"use client";
import type { CardType } from "@/lib/cardMetadata";

export default function CardMetadataFilters({
  cardType, onCardTypeChange, selectedTags, onTagsChange, tags, dark = false,
}: {
  cardType: CardType | "all";
  onCardTypeChange: (next: CardType | "all") => void;
  selectedTags: string[];
  onTagsChange: (next: string[]) => void;
  tags: string[];
  dark?: boolean;
}) {
  const chip = (active: boolean) => active
    ? "bg-indigo-600 border-indigo-600 text-white"
    : dark ? "bg-transparent border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500";
  return (
    <div className="space-y-3">
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${dark ? "text-slate-400" : "text-slate-600"}`}>Card Type</p>
        <div className="flex gap-1.5 flex-wrap">
          {([["all", "All"], ["vocabulary", "Vocabulary"], ["phrase", "Phrases"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={cardType === value} onClick={() => onCardTypeChange(value)} className={`px-3 py-1.5 text-[10px] uppercase font-black rounded-full border ${chip(cardType === value)}`}>{label}</button>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-[10px] font-black uppercase tracking-widest ${dark ? "text-slate-400" : "text-slate-600"}`}>Situation Tags</p>
          {selectedTags.length > 0 && <button type="button" onClick={() => onTagsChange([])} className="text-[10px] font-bold text-indigo-500">Clear</button>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {tags.map(tag => {
            const active = selectedTags.includes(tag);
            return <button type="button" key={tag} aria-pressed={active} onClick={() => onTagsChange(active ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag])} className={`px-2.5 py-1.5 text-[10px] font-bold rounded-full border ${chip(active)}`}>{tag}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
