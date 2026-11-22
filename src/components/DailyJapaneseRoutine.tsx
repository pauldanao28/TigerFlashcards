"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

type Activity = { id: string; label: string; href: string };
type Progress = Record<string, { seconds: number; done: boolean }>;
const ACTIVITIES: Activity[] = [
  { id: "vocabulary", label: "Vocabulary", href: "/study" },
  { id: "grammar", label: "Grammar", href: "/quizzes?open=grammar" },
  { id: "reading", label: "Reading", href: "/quizzes?open=reader" },
  { id: "listening", label: "Listening", href: "/quizzes?open=listening" },
  { id: "speaking", label: "Speaking", href: "/quizzes?open=conversation" },
];
const DEFAULT_MINUTES: Record<string, number> = { vocabulary: 5, grammar: 5, reading: 5, listening: 5, speaking: 5 };
const dayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const blank = (): Progress => Object.fromEntries(ACTIVITIES.map(a => [a.id, { seconds: 0, done: false }]));

export default function DailyJapaneseRoutine() {
  const { user } = useAuth();
  const uid = user?.id;
  const [date, setDate] = useState(dayKey);
  const [minutes, setMinutes] = useState<Record<string, number>>(DEFAULT_MINUTES);
  const [progress, setProgress] = useState<Progress>(blank);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const lastTick = useRef<number | null>(null);
  const settingsKey = uid ? `flashkado-routine-settings-${uid}` : "";
  const progressKey = uid ? `flashkado-routine-progress-${uid}-${date}` : "";

  useEffect(() => {
    if (!uid) { setReady(false); return; }
    const stored = read<Record<string, number>>(settingsKey, DEFAULT_MINUTES);
    setMinutes(Object.fromEntries(ACTIVITIES.map(a => [a.id, Number.isFinite(stored[a.id]) ? Math.min(60, Math.max(0, stored[a.id])) : 5])));
    setProgress(read<Progress>(progressKey, blank()));
    setActive(null);
    lastTick.current = null;
    setReady(true);
  }, [uid, settingsKey, progressKey]);

  useEffect(() => {
    if (!ready || !uid) return;
    try { localStorage.setItem(settingsKey, JSON.stringify(minutes)); } catch { /* ignore storage errors */ }
  }, [minutes, ready, uid, settingsKey]);
  useEffect(() => {
    if (!ready || !uid) return;
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch { /* ignore storage errors */ }
  }, [progress, ready, uid, progressKey]);

  useEffect(() => {
    const checkDay = () => { const today = dayKey(); if (today !== date) { setActive(null); lastTick.current = null; setReady(false); setDate(today); } };
    const interval = window.setInterval(checkDay, 10000);
    const visible = () => checkDay();
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [date]);

  useEffect(() => {
    if (!active || !ready) { lastTick.current = null; return; }
    lastTick.current = Date.now();
    const interval = window.setInterval(() => {
      if (document.hidden) { lastTick.current = Date.now(); return; }
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(2, Math.floor((now - (lastTick.current ?? now)) / 1000)));
      if (elapsed < 1) return;
      lastTick.current = now;
      setProgress(previous => {
        const current = previous[active] ?? { seconds: 0, done: false };
        const target = (minutes[active] ?? 0) * 60;
        const seconds = Math.min(target, current.seconds + elapsed);
        if (seconds >= target) setActive(null);
        return { ...previous, [active]: { seconds, done: current.done || seconds >= target } };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active, ready, minutes]);

  if (!uid || !ready) return null;
  const total = ACTIVITIES.reduce((sum, a) => sum + (minutes[a.id] || 0), 0);
  const completed = ACTIVITIES.filter(a => (minutes[a.id] || 0) === 0 || progress[a.id]?.done).length;
  return (
    <section className="mx-4 mt-4 max-w-2xl md:mx-auto rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm" aria-label="Daily Japanese routine">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">毎日の日本語練習</p><h2 className="text-lg font-black text-slate-900">Daily Japanese Routine</h2><p className="text-xs text-slate-500">Any order · {completed}/5 complete · {total} min target</p></div>
        <button type="button" onClick={() => setEditing(v => !v)} className="rounded-lg border px-3 py-2 text-xs font-bold text-indigo-700">{editing ? "Done" : "Adjust"}</button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${completed / ACTIVITIES.length * 100}%` }}/></div>
      <div className="mt-3 space-y-3">
        {ACTIVITIES.map(a => {
          const target = (minutes[a.id] || 0) * 60;
          const current = progress[a.id] ?? { seconds: 0, done: false };
          const remaining = Math.max(0, target - current.seconds);
          const running = active === a.id;
          return <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <input aria-label={`Complete ${a.label}`} type="checkbox" checked={current.done || target === 0} disabled={target === 0} onChange={e => { if (running) setActive(null); setProgress(p => ({ ...p, [a.id]: { ...(p[a.id] ?? { seconds: 0 }), done: e.target.checked } })); }} className="h-4 w-4 accent-indigo-600" />
              <span className="flex-1 text-sm font-bold text-slate-800">{a.label}</span>
              <span className="text-xs tabular-nums text-slate-600">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left</span>
            </div>
            {editing && <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">Daily minutes <input type="number" min={0} max={60} value={minutes[a.id] ?? 5} onChange={e => { setActive(null); setMinutes(p => ({ ...p, [a.id]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })); }} className="w-16 rounded-md border bg-white px-2 py-1" /></label>}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={target === 0 || current.done} onClick={() => setActive(running ? null : a.id)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{running ? "Pause" : "Start / Resume"}</button>
              <Link href={a.href} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Open {a.label}</Link>
              {current.seconds > 0 && <button type="button" onClick={() => { if (running) setActive(null); setProgress(p => ({ ...p, [a.id]: { seconds: 0, done: false } })); }} className="ml-auto text-xs text-slate-500">Reset</button>}
            </div>
          </div>;
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Your existing Daily Goals remain separate. Timers count only while this routine is open and visible. Progress is saved on this device for each day.</p>
    </section>
  );
}
