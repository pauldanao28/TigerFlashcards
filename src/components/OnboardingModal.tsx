"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingProps {
  userId: string;
  defaultName: string; // Pass the name from Google/FB metadata here
  onComplete: (addedCards: boolean) => void;
}

export default function OnboardingModal({
  userId,
  defaultName,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState(1); // 1: Name, 2: Path Selection
  const [name, setName] = useState(defaultName || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const CONST_DEFAULT_DECK_NAME = "My Deck";

  const [lang, setLang] = useState<"en" | "jp">("en"); // Local toggle state

  const t = {
    en: {
      nickname: "Nickname",
      enter_name: "Enter your Cool Username",
      init: "Initialize Profile →",
      welcome: "Welcome",
      choose: "Choose your starting point:",
      n5_title: "JLPT N5 KICKSTART",
      n5_desc: "Start with 30 essential words. Best for beginners.",
      n5_btn: "Select Protocol →",
      manual_title: "CLEAN SLATE",
      manual_desc: "Start with an empty deck.",
      manual_btn: "Start Manual →",
      sync: "Synchronizing Data...",
      placeholder: "e.g. Satoshi",
    },
    jp: {
      nickname: "ニックネーム",
      enter_name: "ユーザー名を入力してください",
      init: "プロフィールを初期化 →",
      welcome: "ようこそ",
      choose: "開始プロトコルを選択してください：",
      n5_title: "日本語能力試験 N5",
      n5_desc: "必須単語30語から始めましょう。初心者に最適です。",
      n5_btn: "プロトコルを選択 →",
      manual_title: "クリーンスレート",
      manual_desc: "空のデッキから開始します。",
      manual_btn: "マニュアル開始 →",
      sync: "データを同期中...",
      placeholder: "例：サトシ",
    },
  }[lang];

  // --- LOGIC: FINISH NAME SETUP ---
  const handleNameSubmit = () => {
    if (name.trim().length < 2) return;
    setStep(2);
  };

  // --- LOGIC: JLPT N5 START ---
  const startWithN5 = async () => {
    setLoading(true);
    try {
      const { data: pack, error: packErr } = await supabase
        .from("starter_packs")
        .select("id, card_data")
        .eq("name", "JLPT N5 Kickstart")
        .single();

      if (packErr || !pack)
        throw new Error("Could not find the N5 Starter Pack.");

      const n5Words = pack.card_data as any[];

      // Upsert cards and get IDs
      const { data: uploadedCards, error: mErr } = await supabase
        .from("master_cards")
        .upsert(
          n5Words.map((w) => ({ ...w, creator_id: userId })),
          { onConflict: "japanese" },
        )
        .select("id");

      if (mErr || !uploadedCards) throw mErr;
      const cardIds = uploadedCards.map((c) => c.id);

      // Create Default Deck
      const { data: deck, error: dErr } = await supabase
        .from("decks")
        .insert([
          { user_id: userId, title: CONST_DEFAULT_DECK_NAME, is_default: true },
        ])
        .select("id")
        .single();

      if (dErr) throw dErr;

      // Batch link
      await Promise.all([
        supabase
          .from("deck_cards")
          .insert(cardIds.map((id) => ({ deck_id: deck.id, card_id: id }))),
        supabase.from("user_scores").insert(
          cardIds.map((id) => ({
            user_id: userId,
            card_id: id,
            scores_json: { jp_to_en: { percent: 0 }, en_to_jp: { percent: 0 } },
          })),
        ),
      ]);

      // FINAL STEP: Update Profile with Name AND Onboarded Status
      await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          has_onboarded: true,
          imported_packs: [pack.id],
        })
        .eq("id", userId);

      onComplete(true);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIC: SKIP/MANUAL START ---
  const skipToManual = async () => {
    setLoading(true);
    try {
      await supabase
        .from("decks")
        .insert([
          { user_id: userId, title: CONST_DEFAULT_DECK_NAME, is_default: true },
        ]);
      await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          has_onboarded: true,
        })
        .eq("id", userId);

      onComplete(false);
      router.push("/stats");
    } catch (err) {
      alert("Initialization failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6">
      {/* LANGUAGE TOGGLE */}
      <div className="absolute top-10 flex bg-slate-800 p-1 rounded-full border border-slate-700 shadow-2xl">
        <button
          onClick={() => setLang("en")}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${lang === "en" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          English
        </button>
        <button
          onClick={() => setLang("jp")}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${lang === "jp" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          日本語
        </button>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-md w-full bg-white rounded-[3rem] p-10 text-center shadow-2xl"
          >
            {/* 🎴 (Flower Cards) or a custom SVG stack */}
            <div className="text-5xl mb-6 flex items-center justify-center relative">
              <div className="w-12 h-16 bg-white border-4 border-slate-800 rounded-lg shadow-[4px_4px_0px_0px_rgba(30,41,59,1)] flex items-center justify-center">
                <div className="w-6 h-6 bg-rose-500 rounded-full"></div>
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">
              {t.nickname}
            </h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2 mb-8">
              {t.enter_name}
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-5 rounded-2xl bg-slate-50 border-none ring-2 ring-slate-100 focus:ring-4 focus:ring-indigo-500 text-center font-bold text-xl outline-none transition-all mb-6"
              placeholder={t.placeholder}
            />
            <button
              onClick={handleNameSubmit}
              disabled={name.trim().length < 2}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 disabled:opacity-30 transition-all"
            >
              {t.init}
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-4xl w-full"
          >
            <div className="text-center mb-12">
              <h1 className="text-4xl font-black text-white mb-3 italic uppercase tracking-tighter">
                {t.welcome}, {name}!
              </h1>
              <p className="text-slate-400 text-lg font-medium">{t.choose}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={startWithN5}
                disabled={loading}
                className="group bg-white p-8 rounded-[2.5rem] text-left transition-all hover:scale-[1.02] active:scale-95 shadow-2xl disabled:opacity-50"
              >
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  🇯🇵
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2 italic tracking-tighter">
                  {t.n5_title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {t.n5_desc}
                </p>
                <div className="mt-8 font-black text-indigo-600 uppercase text-xs tracking-widest">
                  {t.n5_btn}
                </div>
              </button>
              <button
                onClick={skipToManual}
                disabled={loading}
                className="group bg-slate-800 p-8 rounded-[2.5rem] border-2 border-slate-700 text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <div className="w-14 h-14 bg-slate-700 text-white rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:bg-white group-hover:text-slate-900 transition-colors">
                  ✍️
                </div>
                <h3 className="text-2xl font-black text-white mb-2 italic tracking-tighter">
                  {t.manual_title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {t.manual_desc}
                </p>
                <div className="mt-8 font-black text-slate-400 uppercase text-xs tracking-widest group-hover:text-white">
                  {t.manual_btn}
                </div>
              </button>
            </div>
            {loading && (
              <p className="text-center mt-10 text-indigo-400 font-black uppercase tracking-[0.3em] animate-pulse">
                {t.sync}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
