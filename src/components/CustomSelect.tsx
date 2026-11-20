"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
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
      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center sm:justify-center">
          <button type="button" aria-label="Close selector" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <div role="dialog" aria-modal="true" aria-labelledby={titleId}
            className="relative flex w-full max-h-[calc(100dvh-1rem)] flex-col rounded-t-3xl border border-slate-200 bg-white px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between mb-5">
              <h3 id={titleId} className="text-slate-900 font-black text-sm uppercase tracking-widest">{label}</h3>
              <button type="button" aria-label="Close selector" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-500 hover:text-slate-900"><X size={20}/></button>
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain pb-1">
              {options.map(option => {
                const active = option.value === value;
                return <button type="button" key={option.value} aria-pressed={active} onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-sm font-bold transition-colors ${active ? "bg-indigo-50 border-indigo-500 text-indigo-800" : "bg-white border-slate-200 text-slate-800 hover:border-indigo-300"}`}>
                  <span>{option.label}</span>{active && <Check size={18} className="shrink-0 text-indigo-600" />}
                </button>;
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
