"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AdminChat from "@/components/AdminChat";
import LoadingScreen from "@/components/LoadingScreen";
import Link from "next/link";

export default function SenseiPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setDenied(true); return; }
      setUserId(session.user.id);
    });
  }, [router]);

  if (denied) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 font-bold">Please log in to chat with Sensei.</p>
        <Link href="/login" className="text-indigo-600 font-black text-sm hover:underline">Log in →</Link>
      </div>
    );
  }

  if (!userId) return <LoadingScreen />;
  return <AdminChat userId={userId} />;
}
