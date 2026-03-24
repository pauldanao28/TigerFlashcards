"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // Updated to your path
import GlobalStats from "@/components/GlobalStats";
import UserTable from "@/components/UserTable";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkAdminAndFetch() {
      setLoading(true);

      // 1. Get the current session user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // 2. Check the profiles table for admin status
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin) {
        router.push("/"); // Redirect home if not admin
        return;
      }

      setAuthorized(true);

      // 3. Fetch from the Performance View
      const { data, error } = await supabase
        .from("admin_user_performance_master")
        .select("*");

      console.log("RAW DATA FROM VIEW:", data);

      if (!error) setUsers(data || []);
      setLoading(false);
    }

    checkAdminAndFetch();
  }, [router]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <p className="font-black text-slate-300 animate-pulse tracking-widest uppercase">
          Securing Session...
        </p>
      </div>
    );

  if (!authorized) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 min-h-screen bg-slate-50">
      {/* --- BACK BUTTON & HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            📊 User Stats
            <span className="text-sm bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-bold">
              {users.length}
            </span>
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-wider">
            Live Mastery & Accuracy Metrics
          </p>
        </div>

        <Link
          href="/stats"
          className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-slate-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back
        </Link>
      </div>

      <GlobalStats users={users} />
      <div className="mt-8">
        <UserTable users={users} />
      </div>
    </div>
  );
}
