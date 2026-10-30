"use client";
import { X, Flag, Zap } from "lucide-react";
import { FlashcardData } from "@/lib/types";
import { suruLabel } from "@/lib/verbConjugation";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { useAppAlert } from "@/context/AlertContext";
import { useAuth } from "@/context/AuthContext";

// The one card-detail view, shared by the Cards page grid and Study's Weak Words /
// Slow Recall lists — tapping a word anywhere in the app should land on the exact
// same stats, not a slightly different summary per screen.
export default function CardDetailModal({ card, onClose }: { card: FlashcardData; onClose: () => void }) {
  const { user } = useAuth();
  const { showPrompt, showAlert } = useAppAlert();
  const t = translations.en;

  const handleReport = async () => {
    const suggestion = await showPrompt(t.report_placeholder, { title: "Report a card" });
    if (!suggestion) return;
    const { error } = await supabase.from("card_reports").insert({
      card_id: card.id,
      user_id: user?.id,
      suggested_meaning: suggestion,
      status: "pending",
    });
    if (error) {
      showAlert("Failed to send report.");
    } else {
      showAlert(t.report_sent);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200" />
      <div
        className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-2xl font-black text-slate-800 truncate">{card.japanese}</p>
            <p className="text-sm font-bold text-indigo-500">{card.reading}</p>
            <p className="text-slate-600 text-sm mt-0.5">{card.english}</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {(card.transitivity || card.verb_type || card.adjective_type || card.te_form) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {card.partOfSpeech === "noun" && (card.transitivity || card.verb_type) && (
              <span className="text-slate-400 text-[10px] font-bold">{suruLabel(card.japanese)}:</span>
            )}
            {card.transitivity && (
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                {card.transitivity === "transitive" ? "Transitive" : "Intransitive"}
              </span>
            )}
            {card.verb_type && (
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                {card.verb_type === "godan" ? "Godan" : card.verb_type === "ichidan" ? "Ichidan" : "Irregular"}
              </span>
            )}
            {card.adjective_type && (
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                {card.adjective_type === "i" ? "い-adjective" : "な-adjective"}
              </span>
            )}
            {/* Only actual verbs — a suru-noun's te-form is redundant next to its own
                badges + suru_meaning line right below. */}
            {card.te_form && card.partOfSpeech === "verb" && (
              <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-full text-[9px] font-bold border border-slate-100">
                Te-form: {card.te_form}
              </span>
            )}
          </div>
        )}
        {card.suru_meaning && (
          <p className="text-slate-500 text-xs font-medium mb-4 -mt-2 line-clamp-2" title={card.suru_meaning}>
            {suruLabel(card.japanese)}: <span className="text-slate-800 font-bold">{card.suru_meaning}</span>
          </p>
        )}
        <div className="mb-4 p-4 bg-slate-50 rounded-2xl">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Example</p>
          {card.exampleSentence?.jp ? (
            <>
              <p className="text-slate-800 font-bold leading-relaxed">{card.exampleSentence.jp}</p>
              {card.exampleSentence.en && (
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">{card.exampleSentence.en}</p>
              )}
            </>
          ) : (
            <p className="text-slate-400 text-sm italic">No sentence example</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
              🇯🇵 → 🇺🇸
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                {card.scores?.jp_to_en?.percent || 0}%
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${card.scores?.jp_to_en?.percent || 0}%` }}
                />
              </div>
            </div>
            {/* Percent is lifetime pass/total, not a rolling average — showing the
                count makes it clear why a well-reviewed card moves slowly: each new
                correct answer only nudges an already-large denominator. */}
            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
              {card.scores?.jp_to_en?.pass || 0}/{card.scores?.jp_to_en?.total || 0} correct
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
              🇺🇸 → 🇯🇵
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                {card.scores?.en_to_jp?.percent || 0}%
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400"
                  style={{ width: `${card.scores?.en_to_jp?.percent || 0}%` }}
                />
              </div>
            </div>
            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
              {card.scores?.en_to_jp?.pass || 0}/{card.scores?.en_to_jp?.total || 0} correct
            </p>
          </div>
        </div>
        {!!card.reflex_attempts && (
          <div className="flex items-center justify-between gap-2 mt-3 px-3.5 py-2 bg-amber-50 rounded-xl border border-amber-100">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-widest">
              <Zap size={11} fill="currentColor" /> Avg Reflex Speed
            </span>
            <span className="text-sm font-black text-amber-700">
              {((card.reflex_time_total_ms ?? 0) / card.reflex_attempts / 1000).toFixed(1)}s
            </span>
          </div>
        )}
        <button
          onClick={handleReport}
          className="w-full mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 active:scale-95 transition-all"
        >
          <Flag size={12} /> Report a Problem
        </button>
      </div>
    </div>
  );
}
