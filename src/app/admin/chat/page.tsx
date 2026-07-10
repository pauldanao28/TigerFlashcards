"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminChat from "@/components/AdminChat";
import LoadingScreen from "@/components/LoadingScreen";
import Link from "next/link";

export default function AdminChatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDenied(true); setChecking(false); return; }
      setUserId(user.id);
      setChecking(false);
    })();
  }, []);

  if (checking) return <LoadingScreen />;

  if (denied) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 font-bold">Access denied.</p>
        <Link href="/" className="text-indigo-600 font-black text-sm hover:underline">← Go home</Link>
      </div>
    );
  }

  return <AdminChat userId={userId!} />;
}
