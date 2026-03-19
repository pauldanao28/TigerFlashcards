"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        // No session? Go back to login.
        router.push("/");
      }
    };
    checkSession();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // This is the magic command that updates the logged-in user's password
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Password updated successfully!");
      router.push("/"); // Send them back to the home/study page
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">
          New Password
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Enter your new password below to regain access.
        </p>

        <form onSubmit={handleUpdate} className="space-y-4">
          <input
            type="password"
            placeholder="Minimum 6 characters"
            className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button
            disabled={loading}
            className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {loading ? "Updating..." : "Save New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
