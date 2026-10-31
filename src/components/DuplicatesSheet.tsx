"use client";
import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { resolveDuplicate, type Duplicate } from "@/lib/duplicates";
import type { translations } from "@/lib/languages";

type T = (typeof translations)["en"];

const tries = (d: Duplicate["remove"]) => (d.scores?.jp_to_en?.total || 0) + (d.scores?.en_to_jp?.total || 0);

// Review + merge the deck's duplicate cards (see lib/duplicates). Everything starts
// selected; nothing changes until Merge is pressed.
export default function DuplicatesSheet({
  duplicates,
  userId,
  deckId,
  t,
  onClose,
  onMerged,
}: {
  duplicates: Duplicate[];
  userId: string;
  deckId: string;
  t: T;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(duplicates.map((d) => d.remove.id)));
  const [merging, setMerging] = useState(false);
  const [failed, setFailed] = useState(0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const merge = async () => {
    setMerging(true);
    setFailed(0);
    let errors = 0;
    for (const d of duplicates.filter((x) => selected.has(x.remove.id))) {
      try { await resolveDuplicate(userId, deckId, d); } catch { errors++; }
    }
    setFailed(errors);
    setMerging(false);
    onMerged();
  };

  const groups: { kind: Duplicate["kind"]; label: string }[] = [
    { kind: "kana", label: t.duplicates_kana },
    { kind: "particle", label: t.duplicates_particle },
  ];
  const count = duplicates.filter((d) => selected.has(d.remove.id)).length;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
      <div
        className="relative w-full max-w-xl bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-800">{t.duplicates_title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.duplicates_desc}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {duplicates.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t.duplicates_none}</p>}
          {groups.map(({ kind, label }) => {
            const items = duplicates.filter((d) => d.kind === kind);
            if (items.length === 0) return null;
            return (
              <div key={kind} className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
                  {label} · {items.length}
                </p>
                <div className="flex flex-col gap-1.5">
                  {items.map((d) => (
                    <label
                      key={d.remove.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(d.remove.id)}
                        onChange={() => toggle(d.remove.id)}
                        className="accent-indigo-600"
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                        <span className="font-black text-slate-800">{d.keep.japanese}</span>
                        <span className="text-[10px] font-bold text-slate-400">{d.keep.jlpt_level}</span>
                        <ArrowLeft size={12} className="shrink-0 text-slate-300" />
                        <span className="font-bold text-slate-500">{d.remove.japanese}</span>
                        <span className="text-[10px] font-bold text-slate-400">{d.remove.jlpt_level}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400 truncate max-w-[40%]">
                        {d.keep.english}{tries(d.remove) > 0 ? ` · +${tries(d.remove)} tries` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {duplicates.length > 0 && (
          <div className="p-4 border-t border-slate-100">
            {failed > 0 && <p className="text-xs font-bold text-rose-500 mb-2">{failed} couldn&apos;t be merged — try again.</p>}
            <button
              onClick={merge}
              disabled={merging || count === 0}
              className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {merging ? t.duplicates_merging : `${t.duplicates_merge} ${count}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
