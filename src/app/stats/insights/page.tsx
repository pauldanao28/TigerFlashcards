"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import LearningInsights from "@/components/LearningInsights";

export default function AdvancedStatsPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setSignedIn(true);
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      setIsAdmin(profile?.is_admin ?? false);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingScreen />;

  if (!signedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 font-bold mb-4">Sign in to see your stats.</p>
          <Link href="/" className="text-indigo-600 font-black text-sm">← Back home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
            📈 Advanced Stats
          </h1>
          <Link
            href="/stats"
            className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
          >
            ← Back
          </Link>
        </div>
        <LearningInsights isAdmin={isAdmin} />
      </div>
    </main>
  );
}
