"use client";
import CustomSelect from "@/components/CustomSelect";
import { SITUATION_TAGS, normalizeSituationTags, type ImportPreviewCard } from "@/lib/cardMetadata";
import { Check, Loader2, X } from "lucide-react";

export default function ImportPreviewSheet({
  rows, onChange, onClose, onApprove, saving, error,
}: {
  rows: ImportPreviewCard[];
  onChange: (rows: ImportPreviewCard[]) => void;
  onClose: () => void;
  onApprove: () => void;
  saving: boolean;
  error: string;
}) {
  const update = (index: number, patch: Partial<ImportPreviewCard>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const chosen = rows.filter(row => row.selected);
  const newCount = chosen.filter(row => !row.existingId).length;
  const reusedCount = chosen.filter(row => !!row.existingId && !row.alreadyInDeck).length;

  return (
    <div className="fixed inset-0 z-[280] flex flex-col bg-slate-900/50 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="flex flex-col bg-white h-full w-full sm:h-[90dvh] sm:max-w-xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-800 font-black text-sm uppercase tracking-tight">Review before importing</h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">{rows.length} entries · {newCount} new · {reusedCount} reused</p>
          </div>
          <button type="button" disabled={saving} aria-label="Close preview" onClick={onClose} className="p-2 rounded-xl bg-slate-100 text-slate-500"><X size={18}/></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
          <p className="text-[11px] font-medium text-slate-500 px-1">Check Gemini&apos;s suggestions. Tap an item to correct it before anything is saved. Existing library cards remain unchanged.</p>
          {rows.map((row, index) => (
            <div key={index} className={`rounded-2xl border p-3 ${row.selected ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-70"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={row.selected} disabled={saving || !!row.alreadyInDeck} onChange={e => update(index, { selected: e.target.checked })} className="mt-2 accent-indigo-600 w-4 h-4" aria-label={`Import ${row.japanese}`} />
                <details className="flex-1 min-w-0 group" open={undefined}>
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-slate-800 font-black text-base break-words">{row.japanese || row.input}</span>
                      <span className="text-slate-500 text-xs break-words">{row.english}</span>
                      <span className="flex gap-1.5 flex-wrap mt-1.5">
                        <span className="rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 text-[9px] font-bold px-1.5 py-0.5 uppercase">{row.card_type === "phrase" ? "Phrase" : "Vocabulary"}</span>
                        {row.existingId && <span className="rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold px-1.5 py-0.5">{row.alreadyInDeck ? "Already in deck" : "Existing library card"}</span>}
                        {row.situation_tags.slice(0, 2).map(tag => <span key={tag} className="rounded-md bg-slate-100 text-slate-500 text-[9px] font-semibold px-1.5 py-0.5">{tag}</span>)}
                      </span>
                    </span>
                    <span className="text-indigo-600 shrink-0 text-[10px] font-bold py-2">Edit</span>
                  </summary>
                  {row.existingId ? (
                    <p className="text-xs text-amber-700 mt-3 bg-amber-50 rounded-xl p-3">Exact match already exists in master_cards. It will {row.alreadyInDeck ? "be skipped" : "be linked to your deck"} without changing its content or review history.</p>
                  ) : (
                    <div className="space-y-3 mt-4 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="text-[11px] font-bold text-slate-600">Japanese
                          <textarea disabled={saving} rows={2} value={row.japanese} onChange={e => update(index,{japanese:e.target.value})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">Reading
                          <textarea disabled={saving} rows={2} value={row.reading} onChange={e => update(index,{reading:e.target.value})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                        </label>
                      </div>
                      <label className="block text-[11px] font-bold text-slate-600">Natural English meaning
                        <textarea disabled={saving} rows={2} value={row.english} onChange={e => update(index,{english:e.target.value})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <CustomSelect label="Card type" value={row.card_type} onChange={value => update(index,{card_type:value as ImportPreviewCard["card_type"], partOfSpeech:value === "phrase" ? "phrase" : row.partOfSpeech === "phrase" ? "noun" : row.partOfSpeech})} options={[{value:"vocabulary",label:"Vocabulary"},{value:"phrase",label:"Phrase"}]}/>
                        <CustomSelect label="JLPT level" value={row.jlpt_level ?? ""} onChange={value => update(index,{jlpt_level:(value || null) as ImportPreviewCard["jlpt_level"]})} options={[{value:"",label:"Not assigned"},...["N5","N4","N3","N2","N1"].map(v=>({value:v,label:v}))]}/>
                      </div>
                      <label className="block text-[11px] font-bold text-slate-600">Usage note (context, tone, formality)
                        <textarea disabled={saving} rows={2} value={row.usage_note} onChange={e => update(index,{usage_note:e.target.value})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                      </label>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Situation tags (multiple)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {normalizeSituationTags([...SITUATION_TAGS,...row.situation_tags]).map(tag => {
                          const active = row.situation_tags.includes(tag);
                          return <button type="button" aria-pressed={active} disabled={saving} key={tag} onClick={() => update(index,{situation_tags:active?row.situation_tags.filter(t=>t!==tag):normalizeSituationTags([...row.situation_tags,tag])})} className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full border ${active ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-slate-200 text-slate-500"}`}>{tag}</button>;
                        })}
                      </div>
                      <label className="block text-[11px] font-bold text-slate-600">Example (Japanese)
                        <textarea disabled={saving} rows={2} value={row.exampleSentence.jp} onChange={e=>update(index,{exampleSentence:{...row.exampleSentence,jp:e.target.value}})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                      </label>
                      <label className="block text-[11px] font-bold text-slate-600">Example (English)
                        <textarea disabled={saving} rows={2} value={row.exampleSentence.en} onChange={e=>update(index,{exampleSentence:{...row.exampleSentence,en:e.target.value}})} className="block w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 resize-y" />
                      </label>
                    </div>
                  )}
                </details>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 p-4 border-t border-slate-100 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="text-rose-600 text-xs font-semibold mb-3">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="px-5 rounded-2xl border border-slate-200 text-xs font-black text-slate-500">Back</button>
            <button type="button" disabled={saving || !chosen.length || chosen.some(row => !row.existingId && (!row.japanese.trim() || !row.english.trim()))} onClick={onApprove} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-white py-3.5 text-xs font-black uppercase tracking-widest active:scale-95 disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16}/>}
              {saving ? "Saving…" : `Import ${chosen.length} card${chosen.length===1?"":"s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
