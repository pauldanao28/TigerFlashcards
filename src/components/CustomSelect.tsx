"use client";
import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

type Option = { value: string; label: string };
type Props = { label: string; value: string; options: Option[]; onChange: (value: string) => void };

export default function CustomSelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div>
      <span className="block text-xs font-bold mb-2 text-slate-700">{label}</span>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 active:scale-[0.99] transition-transform">
        <span>{selected?.label ?? value}</span><ChevronDown size={17} className="shrink-0 text-indigo-600" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center sm:justify-center">
          <button type="button" aria-label="Close selector" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/70" />
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-slate-900 px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 id={titleId} className="text-white font-black text-sm uppercase tracking-widest">{label}</h3>
              <button type="button" aria-label="Close selector" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-300 hover:text-white"><X size={20}/></button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {options.map(option => {
                const active = option.value === value;
                return <button type="button" key={option.value} aria-pressed={active} onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-sm font-bold transition-colors ${active ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-100 hover:border-indigo-400"}`}>
                  <span>{option.label}</span>{active && <Check size={18} className="shrink-0" />}
                </button>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
