"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Check } from "lucide-react";

export interface TriageCard {
  id: string;
  japanese: string;
  english: string;
}

interface KnownWordsTriageProps {
  userId: string;
  packName: string;
  cards: TriageCard[];
  onDone: () => void;
}

const PAGE_SIZE = 32;

export default function KnownWordsTriage({ userId, packName, cards, onDone }: KnownWordsTriageProps) {
  const [page, setPage] = useState(0);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const totalPages = Math.ceil(cards.length / PAGE_SIZE);
  const pageCards = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isLastPage = page + 1 >= totalPages;

  const toggle = (id: string) => {
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    if (known.size > 0) {
      const rows = [...known].map((cardId) => ({
        user_id: userId,
        card_id: cardId,
        scores_json: {
          jp_to_en: { pass: 3, fail: 0, total: 3, percent: 100 },
          en_to_jp: { pass: 3, fail: 0, total: 3, percent: 100 },
        },
      }));
      await supabase.from("user_scores").upsert(rows, { onConflict: "user_id,card_id" });
    }
    setSaving(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[400] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{packName}</p>
          <h2 className="font-black text-slate-800 text-sm">Already know any of these?</h2>
        </div>
        <button
          onClick={finish}
          disabled={saving}
          className="text-[10px] font-black uppercase tracking-widest text-slate-400 active:scale-95 transition-all disabled:opacity-40 shrink-0 ml-3"
        >
          {saving ? "Saving…" : "Skip"}
        </button>
      </div>

      {/* Progress */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 shrink-0">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Page {page + 1} / {totalPages}
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
            {known.size} marked known
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${((page + 1) / totalPages) * 100}%` }}
          />
        </div>
      </div>

      {/* Word grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          {pageCards.map((c) => {
            const isKnown = known.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`text-left p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                  isKnown ? "bg-emerald-50 border-emerald-400" : "bg-white border-slate-100"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="font-black text-slate-900 text-sm leading-tight">{c.japanese}</p>
                  {isKnown && (
                    <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.english}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-white shrink-0"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex-1 py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all disabled:opacity-30"
        >
          Back
        </button>
        {isLastPage ? (
          <button
            onClick={finish}
            disabled={saving}
            className="flex-1 py-3.5 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm disabled:opacity-40"
          >
            {saving ? "Saving…" : "Finish"}
          </button>
        ) : (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
