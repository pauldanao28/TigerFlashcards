"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

type Status = "saving" | "done" | "duplicate" | "error" | "noauth";

function ShareHandler() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("saving");
  const [word, setWord] = useState("");

  useEffect(() => {
    const raw = (searchParams.get("text") || searchParams.get("title") || "").trim();
    if (!raw) { setStatus("error"); return; }
    setWord(raw);

    const save = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setStatus("noauth"); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("pending_words")
          .eq("id", user.id)
          .single();

        // Merge Supabase + localStorage so we never drop words that haven't synced yet
        const fromDb: string[] = profile?.pending_words ?? [];
        let fromStorage: string[] = [];
        try {
          const stored = localStorage.getItem(`flashkado-word-list-${user.id}`);
          fromStorage = stored ? JSON.parse(stored) : [];
        } catch { /* storage unavailable */ }

        // Union of both sources, preserving order (DB first, then any local-only additions)
        const merged = [...new Set([...fromDb, ...fromStorage])];

        if (merged.includes(raw)) {
          setStatus("duplicate");
          return;
        }

        const updated = [...merged, raw];
        await supabase.from("profiles").update({ pending_words: updated }).eq("id", user.id);

        try {
          localStorage.setItem(`flashkado-word-list-${user.id}`, JSON.stringify(updated));
        } catch { /* storage unavailable */ }

        setStatus("done");
      } catch {
        setStatus("error");
      }
    };

    save();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 gap-6">
      <Logo className="w-10 h-14" />

      {status === "saving" && (
        <>
          <div className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Saving…</p>
        </>
      )}

      {(status === "done" || status === "duplicate") && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center text-2xl">
            {status === "done" ? "✅" : "📋"}
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800 mb-1">{word}</p>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              {status === "done" ? "Added to word list" : "Already in word list"}
            </p>
          </div>
          <a
            href="/stats"
            className="mt-2 px-6 py-3 bg-slate-800 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
          >
            Open Flashkado →
          </a>
        </div>
      )}

      {status === "noauth" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-3xl">🔒</div>
          <p className="text-sm font-black text-slate-700">Sign in to save words</p>
          <a
            href="/"
            className="px-6 py-3 bg-slate-800 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest"
          >
            Sign In
          </a>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-black text-slate-700">Something went wrong</p>
          <a
            href="/stats"
            className="px-6 py-3 bg-slate-800 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest"
          >
            Open Flashkado
          </a>
        </div>
      )}
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
      </div>
    }>
      <ShareHandler />
    </Suspense>
  );
}
