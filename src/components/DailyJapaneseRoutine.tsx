"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, X, BookOpen, Pencil, BookText, Headphones, Mic } from "lucide-react";
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

export default function DailyJapaneseRoutine({ reviewsToday = 0, reviewGoal = 100, embedded = false }: { reviewsToday?: number; reviewGoal?: number; embedded?: boolean }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [date, setDate] = useState(dayKey);
  const [minutes, setMinutes] = useState<Record<string, number>>(DEFAULT_MINUTES);
  const [progress, setProgress] = useState<Progress>(blank);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [setup, setSetup] = useState(false);
  const [budget, setBudget] = useState(25);
  const [focus, setFocus] = useState("balanced");
  const [ready, setReady] = useState(false);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);
  const settingsKey = uid ? `flashkado-routine-settings-${uid}` : "";
  const progressKey = uid ? `flashkado-routine-progress-${uid}-${date}` : "";

  useEffect(() => {
    if (!uid) { setReady(false); return; }
    setSetup(localStorage.getItem(settingsKey) === null);
    const stored = read<Record<string, number>>(settingsKey, DEFAULT_MINUTES);
    setMinutes(Object.fromEntries(ACTIVITIES.map(a => [a.id, Number.isFinite(stored[a.id]) ? Math.min(60, Math.max(0, stored[a.id])) : 5])));
    setProgress(read<Progress>(progressKey, blank()));
    setActive(null);
    lastTick.current = null;
    setReady(true);
  }, [uid, settingsKey, progressKey]);

  useEffect(() => {
    if (!ready || !uid || setup) return;
    try { localStorage.setItem(settingsKey, JSON.stringify(minutes)); } catch { /* ignore storage errors */ }
  }, [minutes, ready, uid, settingsKey, setup]);
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
        return { ...previous, [active]: { seconds, done: current.done || seconds >= target } };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active, ready, minutes]);

  useEffect(() => {
    if (active && progress[active]?.done) setActive(null);
  }, [active, progress]);

  const allocate = (choice: string, total: number) => {
    setFocus(choice); setBudget(total);
    const weights: Record<string, number[]> = { balanced: [1,1,1,1,1], speaking: [1,1,1,2,3], vocabulary: [3,1,1,1,1], comprehension: [1,1,3,3,1] };
    const w = weights[choice] || weights.balanced;
    const sum = w.reduce((a,b) => a+b, 0);
    const vals = w.map(x => Math.floor(total*x/sum));
    for (let i = 0, rest = total-vals.reduce((a,b)=>a+b,0); rest > 0; i++,rest--) vals[i%5]++;
    setMinutes(Object.fromEntries(ACTIVITIES.map((a,i)=>[a.id,vals[i]])));
  };
  const saveSetup = (skip = false) => {
    const values = skip ? DEFAULT_MINUTES : minutes;
    setMinutes(values);
    try { localStorage.setItem(settingsKey, JSON.stringify(values)); } catch { /* ignore */ }
    setSetup(false);
  };
  if (!uid || !ready) return null;
  if (setup) return (
    <section className="mx-4 mt-4 max-w-2xl md:mx-auto rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase text-indigo-600">Your learning commitment</p>
      <h2 className="mt-1 text-xl font-black text-slate-900">Build your daily Japanese plan</h2>
      <p className="mt-1 text-sm text-slate-500">Choose your time and focus. Adjust it anytime. Your existing Daily Goals stay unchanged.</p>
      <p className="mt-4 text-xs font-bold">How many minutes per day?</p>
      <div className="mt-2 flex flex-wrap gap-2">{[10,15,25,40,60].map(n=><button key={n} type="button" onClick={()=>allocate(focus,n)} className={"rounded-lg border px-3 py-2 text-sm font-bold "+(budget===n?"border-indigo-500 bg-indigo-50 text-indigo-700":"border-slate-200")}>{n} min</button>)}</div>
      <p className="mt-4 text-xs font-bold">What would you like to focus on?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">{[{id:"balanced",label:"Balanced"},{id:"speaking",label:"Speaking"},{id:"vocabulary",label:"Vocabulary"},{id:"comprehension",label:"Reading & Listening"}].map(o=><button key={o.id} type="button" onClick={()=>allocate(o.id,budget)} className={"rounded-lg border p-3 text-left text-xs font-bold "+(focus===o.id?"border-indigo-500 bg-indigo-50 text-indigo-700":"border-slate-200")}>{o.label}</button>)}</div>
      <p className="mt-4 text-xs font-bold">Fine-tune your daily minutes</p>
      <div className="mt-2 space-y-2">{ACTIVITIES.map(a=><label key={a.id} className="flex items-center justify-between gap-2 text-sm"><span>{a.label}</span><span><input type="number" min={0} max={60} value={minutes[a.id]||0} onChange={e=>setMinutes(p=>({...p,[a.id]:Math.max(0,Math.min(60,Number(e.target.value)||0))}))} className="w-16 rounded-lg border p-2 text-right" /> min</span></label>)}</div>
      <p className="mt-3 text-xs text-slate-500">Total: {Object.values(minutes).reduce((a,b)=>a+b,0)} minutes/day</p>
      <button type="button" onClick={()=>saveSetup()} className="mt-4 w-full rounded-xl bg-indigo-600 p-3 text-sm font-black text-white">Save my commitment</button>
      <button type="button" onClick={()=>saveSetup(true)} className="mt-2 w-full p-2 text-xs font-semibold text-slate-500">Skip · Use balanced 25-minute plan</button>
    </section>
  );

  const total = ACTIVITIES.reduce((sum, a) => sum + (minutes[a.id] || 0), 0);
  const vocabGoalMet = reviewsToday >= reviewGoal;
  const completed = ACTIVITIES.filter(a => (minutes[a.id] || 0) === 0 || progress[a.id]?.done || (a.id === "vocabulary" && vocabGoalMet)).length;
  return (
    <section className={embedded ? "mt-4 border-t border-slate-100 pt-4" : "mx-4 mt-4 max-w-2xl md:mx-auto rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"} aria-label="Daily Japanese routine">
      <button type="button" onClick={() => setExpanded(v => !v)} aria-haspopup="dialog" aria-expanded={expanded} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">Daily Routine</p>
          <p className="mt-0.5 text-xs text-slate-500">{completed}/5 complete · {total} min planned</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-slate-500" />
      </button>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${completed / ACTIVITIES.length * 100}%` }}/></div>
      {<div className="mt-3 grid grid-cols-5 gap-1" aria-label="Routine activity status">
        {ACTIVITIES.map((a, i) => {
          const Icon = [BookOpen, Pencil, BookText, Headphones, Mic][i];
          const done = (minutes[a.id] || 0) === 0 || progress[a.id]?.done || (a.id === "vocabulary" && vocabGoalMet);
          return <div key={a.id} className="flex min-w-0 flex-col items-center gap-1">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><Icon size={16} /></span>
            <span className="max-w-full truncate text-[9px] font-semibold text-slate-500">{a.id === "vocabulary" ? "Vocab" : a.label}</span>
          </div>;
        })}
      </div>}
      {expanded && <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center" role="presentation">
        <button type="button" aria-label="Close daily routine" onClick={() => setExpanded(false)} className="absolute inset-0 bg-slate-900/50" />
        <div role="dialog" aria-modal="true" aria-labelledby="daily-routine-modal-title" className="relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><p className="text-[10px] font-black uppercase text-indigo-600">毎日の日本語練習</p><h2 id="daily-routine-modal-title" className="text-lg font-black text-slate-900">Daily Japanese Routine</h2><p className="text-xs text-slate-500">{completed}/5 complete · {total} min planned</p></div>
            <button type="button" onClick={() => setExpanded(false)} aria-label="Close routine" className="rounded-full border border-slate-200 p-2"><X size={20}/></button>
          </div>
          <div id="daily-routine-details" className="overflow-y-auto px-5 pb-8">
        <div className="mt-3 flex justify-end"><button type="button" onClick={() => setEditing(v => !v)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700">{editing ? "Done adjusting" : "Adjust minutes"}</button></div>
      <div className="mt-3 space-y-3">
        {ACTIVITIES.map(a => {
          const target = (minutes[a.id] || 0) * 60;
          const current = progress[a.id] ?? { seconds: 0, done: false };
          const remaining = Math.max(0, target - current.seconds);
          const running = active === a.id;
          const autoDone = a.id === "vocabulary" && vocabGoalMet;
          const isDone = current.done || autoDone || target === 0;
          return <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <input aria-label={`Complete ${a.label}`} type="checkbox" checked={isDone} disabled={target === 0 || autoDone} onChange={e => { if (running) setActive(null); setProgress(p => ({ ...p, [a.id]: { ...(p[a.id] ?? { seconds: 0 }), done: e.target.checked } })); }} className="h-4 w-4 accent-indigo-600" />
              <span className="flex-1 text-sm font-bold text-slate-800">{a.label}{autoDone && <span className="ml-2 text-[10px] font-semibold text-emerald-600">Review goal met</span>}</span>
              <span className="text-xs tabular-nums text-slate-600">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left</span>
            </div>
            {editing && <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">Daily minutes <input type="number" min={0} max={60} value={minutes[a.id] ?? 5} onChange={e => { setActive(null); setMinutes(p => ({ ...p, [a.id]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })); }} className="w-16 rounded-md border bg-white px-2 py-1" /></label>}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={target === 0 || isDone} onClick={() => setActive(running ? null : a.id)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{running ? "Pause" : "Start / Resume"}</button>
              <Link href={a.href} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Open {a.label}</Link>
              {current.seconds > 0 && <button type="button" onClick={() => { if (running) setActive(null); setProgress(p => ({ ...p, [a.id]: { seconds: 0, done: false } })); }} className="ml-auto text-xs text-slate-500">Reset</button>}
            </div>
          </div>;
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Vocabulary is automatically complete when your review goal is met. Other activities are flexible. Timers count only while Home is visible; daily progress is stored on this device.</p>
      </div></div></div>}
    </section>
  );
}
