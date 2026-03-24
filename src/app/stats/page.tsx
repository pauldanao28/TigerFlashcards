"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { FlashcardData } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { useLang } from "@/context/LanguageContext";

export default function StatsPage() {
  const { t, setLang, lang } = useLang();
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userBlocklist, setUserBlocklist] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [newBlockWord, setNewBlockWord] = useState("");
  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(50);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState("Main Deck");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [starterPacks, setStarterPacks] = useState<any[]>([]);
  const [ownedPacks, setOwnedPacks] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    type: "feedback",
    subject: "",
    description: "",
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [sent, setSent] = useState(false);

  // 1. ADD THIS CSS BLOCK AT THE TOP OF YOUR FILE OR IN YOUR GLOBAL CSS
  const firePulseAnimation = `
  @keyframes firePulse {
    0% { transform: scale(1); opacity: 0.9; filter: drop-shadow(0 0 1px #ff6b00); }
    50% { transform: scale(1.1); opacity: 1; filter: drop-shadow(0 0 4px #ff0000); }
    100% { transform: scale(1); opacity: 0.9; filter: drop-shadow(0 0 1px #ff6b00); }
  }
  .animate-fire {
    animation: firePulse 2.5s ease-in-out infinite;
    display: inline-block; /* Required for transform to work */
  }
`;

  const fetchStarterPacks = async () => {
    const { data, error } = await supabase.from("starter_packs").select("*"); // Fetches id, name, description, card_data, etc.
    if (data) setStarterPacks(data);
  };

  const fetchDecks = async () => {
    if (!user) return;

    const { data: decks, error } = await supabase
      .from("decks")
      .select("id, title, is_default")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error fetching decks:", error);
      return;
    }

    if (decks && decks.length > 0) {
      // 1. Try to find the one marked 'is_default'
      const defaultDeck = decks.find((d) => d.is_default) || decks[0];

      // 2. Set the ID so the "Add to Deck" button actually works
      setDefaultDeckId(defaultDeck.id);
      console.log("Default Deck Found & Set:", defaultDeck.id);
    } else {
      // 3. Optional: If they have NO decks, create one for them
      console.log(
        "No decks found for user. You might need to create a 'Main Deck' first.",
      );
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") {
        window.location.href = "/";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 1. Fetch the user's basic info first
  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchDefaultDeck();
      fetchStarterPacks();
    }
  }, [user]);

  // 2. ONLY fetch cards once we have a valid Deck ID
  useEffect(() => {
    if (user && defaultDeckId) {
      fetchCards();
    }
  }, [user, defaultDeckId]); // <--- Adding defaultDeckId to the dependency array is key

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "streak_count, max_streak, blocked_words, auto_play_jp, auto_play_en, imported_packs, is_admin",
      )
      .eq("id", user?.id)
      .single();

    if (data) {
      setStreak(data.streak_count);
      setMaxStreak(data.max_streak || 0);
      setUserBlocklist(data.blocked_words || []);
      setAutoPlayJp(data.auto_play_jp);
      setAutoPlayEn(data.auto_play_en);
      setOwnedPacks(data.imported_packs);
      setIsAdmin(data.is_admin);
    }
  };

  const fetchDefaultDeck = async () => {
    const { data } = await supabase
      .from("decks")
      .select("id, title")
      .eq("user_id", user?.id)
      .eq("is_default", true)
      .single();
    if (data) {
      setDefaultDeckId(data.id);
      setDeckTitle(data.title);
      setTempTitle(data.title);
    }
  };

  // 3. Add the update function
  const updateDeckTitle = async () => {
    if (!tempTitle.trim() || !defaultDeckId) return;

    const { error } = await supabase
      .from("decks")
      .update({ title: tempTitle.trim() })
      .eq("id", defaultDeckId);

    if (error) {
      alert("Failed to update deck name");
    } else {
      setDeckTitle(tempTitle.trim());
      setIsEditingTitle(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error signing out:", error.message);
    // Optional: window.location.href = "/"; // Force redirect to home
  };

  const handleReport = async (cardId: string, currentMeaning: string) => {
    const suggestion = window.prompt(t.report_placeholder);

    if (!suggestion || suggestion.trim() === "") return;

    const { error } = await supabase.from("card_reports").insert({
      card_id: cardId,
      user_id: user?.id,
      suggested_meaning: suggestion.trim(),
      status: "pending",
    });

    if (error) {
      alert("Failed to send report.");
    } else {
      alert(t.report_sent);
    }
  };

  // --- 2. Update processWords to save to Supabase ---
  const fetchCards = async () => {
    if (!user || !defaultDeckId) {
      console.warn("fetchCards aborted: User or Deck ID missing");
      return;
    }

    // 1. We query master_cards, but we use !inner on the join to filter the results
    const { data, error } = await supabase
      .from("master_cards")
      .select(
        `
      *,
      deck_cards!inner (
        deck_id
      ),
      user_scores (
        scores_json
      )
    `,
      )
      // 2. This filters the master_cards to ONLY ones in YOUR deck
      .eq("deck_cards.deck_id", defaultDeckId)
      // 3. This ensures you only get YOUR scores (not someone else's)
      .eq("user_scores.user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch Error:", error.message);
      return;
    }

    if (data) {
      const flattened = data.map((card: any) => {
        // user_scores is still an array from the join
        const userStats = card.user_scores?.[0];

        return {
          ...card,
          scores: userStats?.scores_json || {
            jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
            en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
          },
        };
      });

      setCards(flattened);
    }
  };

  const processWords = async (inputList: string[]) => {
    if (!user || !defaultDeckId)
      return alert("Please log in and ensure deck is initialized.");

    const rawInput = inputList.join("\n").normalize("NFKC").trim();
    if (!rawInput) return;

    // --- 1. Tokenization Logic ---
    let wordsToProcess: string[] = [];
    const isEnglishInput = /^[A-Za-z0-9\s.,!?-]+$/.test(rawInput);

    if (isEnglishInput) {
      wordsToProcess = inputList
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
    } else if (rawInput.includes(",") || rawInput.includes("-")) {
      wordsToProcess = inputList.map((line) => line.split(/[,-]/)[0].trim());
    } else {
      const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });
      const segments = segmenter.segment(rawInput);
      wordsToProcess = Array.from(segments)
        .map((s) => s.segment.trim())
        .filter((w) => {
          const isJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(w);
          const isNotBlocked = !userBlocklist.includes(w);
          const isMeaningful = w.length > 1 || /[\u4e00-\u9faf]/.test(w);
          return isJapanese && isNotBlocked && isMeaningful;
        });
    }

    const uniqueInputWords = [...new Set(wordsToProcess)];
    if (uniqueInputWords.length === 0) return;

    setLoading(true);

    // Helper inside the function to handle the DB linking
    const performLinking = async (cardIds: string[]) => {
      const currentCardIds = new Set(cards.map((c) => c.id));
      const idsToLink = cardIds.filter((id) => !currentCardIds.has(id));

      if (idsToLink.length > 0) {
        const [deckRes, scoreRes] = await Promise.all([
          supabase.from("deck_cards").upsert(
            idsToLink.map((id) => ({ deck_id: defaultDeckId, card_id: id })),
            { onConflict: "deck_id,card_id" },
          ),
          supabase.from("user_scores").upsert(
            idsToLink.map((id) => ({
              user_id: user.id,
              card_id: id,
              scores_json: {
                jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
                en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
              },
            })),
            { onConflict: "user_id,card_id" },
          ),
        ]);
        if (deckRes.error) throw deckRes.error;
        if (scoreRes.error) throw scoreRes.error;
      }
    };

    try {
      // --- 2. Step 1: Handle Existing Cards (Instant) ---
      const { data: existingCards, error: searchErr } = await supabase
        .from("master_cards")
        .select("id, japanese")
        .in("japanese", uniqueInputWords);

      if (searchErr) throw searchErr;

      const existingMap = new Map(
        existingCards?.map((c) => [c.japanese, c.id]) || [],
      );
      const wordsForAI = uniqueInputWords.filter((w) => !existingMap.has(w));

      // Link what we found immediately
      const foundIds = Array.from(existingMap.values());
      if (foundIds.length > 0) {
        await performLinking(foundIds);
        fetchCards(); // Refresh UI to show the "already known" words
      }

      // --- 3. Step 2: Handle New Words (AI) ---
      if (wordsForAI.length > 0) {
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({ words: wordsForAI }),
          });

          if (!res.ok)
            throw new Error(
              res.status === 429 ? "AI Limit Reached" : "AI Error",
            );

          const items = await res.json();
          const itemsArray = Array.isArray(items) ? items : [items];

          const { data: newCards, error: mErr } = await supabase
            .from("master_cards")
            .upsert(
              itemsArray.map((item) => ({
                japanese: String(item.japanese).trim(),
                reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""),
                english: String(item.english || "").trim(),
                partOfSpeech: String(item.partOfSpeech || "noun")
                  .trim()
                  .toLowerCase(),
                exampleSentence: item.exampleSentence || { jp: "", en: "" },
                creator_id: user.id,
              })),
              { onConflict: "japanese" },
            )
            .select("id");

          if (mErr) throw mErr;
          if (newCards && newCards.length > 0) {
            await performLinking(newCards.map((c) => c.id));
            fetchCards();
          }
        } catch (aiErr: any) {
          // If AI fails, we don't crash the whole function because some words were already added
          alert(
            `Note: Added existing words, but new ones failed: ${aiErr.message}`,
          );
        }
      }

      // --- 3.5 Success Feedback ---
      const totalAdded = uniqueInputWords.length;
      if (totalAdded > 0) {
        // If you have a toast library like sonner or react-hot-toast, use that here.
        // Otherwise, a simple alert with your new translations:
        const message =
          lang === "jp"
            ? `${totalAdded}語を追加しました！`
            : `Successfully added ${totalAdded} words!`;

        alert(message);
      }

      // --- 4. Cleanup UI ---
      setInput("");
      setBatchInput("");
      setShowBatch(false);

      // --- 4. Cleanup UI ---
      setInput("");
      setBatchInput("");
      setShowBatch(false);
    } catch (e: any) {
      console.error("ProcessWords Error:", e);
      alert(`Major Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Remove this card from your collection?")) return;

    console.log(`Attempting to delete card ${id} for user ${user?.id}`);

    // 1. Delete from deck_cards
    const { error: linkErr } = await supabase
      .from("deck_cards")
      .delete()
      .eq("card_id", id)
      .eq("deck_id", defaultDeckId);

    // 2. Delete from user_scores
    const { error: scoreErr } = await supabase
      .from("user_scores")
      .delete()
      .eq("card_id", id)
      .eq("user_id", user?.id);

    if (linkErr || scoreErr) {
      console.error("Delete failed!", { linkErr, scoreErr });
      alert(`Could not delete: ${linkErr?.message || scoreErr?.message}`);
      return;
    }

    // 3. Update UI
    setCards((prev) => prev.filter((c) => c.id !== id));
    console.log("Successfully removed from local state");
  };

  // 1. Aggregating Global Totals
  const totalCards = cards.length;

  // 1. Global Totals (Tries, Pass, Fail)
  // Separate Global Totals for both directions
  const globalStats = useMemo(() => {
    return cards.reduce(
      (acc, card) => {
        const s = card.scores;
        if (s) {
          const jp = s.jp_to_en || { total: 0, pass: 0, fail: 0 };
          const en = s.en_to_jp || { total: 0, pass: 0, fail: 0 };

          // Accumulate Japanese -> English
          acc.jp.tries += jp.total || 0;
          acc.jp.pass += jp.pass || 0;
          acc.jp.fail += jp.fail || 0;

          // Accumulate English -> Japanese
          acc.en.tries += en.total || 0;
          acc.en.pass += en.pass || 0;
          acc.en.fail += en.fail || 0;
        }
        return acc;
      },
      {
        jp: { tries: 0, pass: 0, fail: 0 },
        en: { tries: 0, pass: 0, fail: 0 },
      },
    );
  }, [cards]);

  // 2. Mastered (Avg Accuracy > 80% and has been attempted)
  const masteredCards = useMemo(() => {
    return cards.filter((c) => {
      const s = c.scores;
      const jpT = s?.jp_to_en?.total || 0;
      const enT = s?.en_to_jp?.total || 0;
      const jpP = s?.jp_to_en?.percent || 0;
      const enP = s?.en_to_jp?.percent || 0;

      return jpT + enT > 0 && (jpP + enP) / 2 >= 80;
    }).length;
  }, [cards]);

  // 3. Struggling (Avg Accuracy < 40% and has been attempted)
  const strugglingCards = useMemo(() => {
    return cards.filter((c) => {
      const s = c.scores;
      const jpT = s?.jp_to_en?.total || 0;
      const enT = s?.en_to_jp?.total || 0;
      const jpP = s?.jp_to_en?.percent || 0;
      const enP = s?.en_to_jp?.percent || 0;

      return jpT + enT > 0 && (jpP + enP) / 2 < 40;
    }).length;
  }, [cards]);

  const filteredCards = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return cards.filter(
      (card) =>
        card.japanese.toLowerCase().includes(query) ||
        card.reading.toLowerCase().includes(query) ||
        card.english.toLowerCase().includes(query),
    );
  }, [cards, searchQuery]);

  const visibleCards = filteredCards.slice(0, displayLimit);

  const getPosColor = (pos: string) => {
    const p = pos?.toLowerCase() || "";
    if (p.includes("noun")) return "bg-blue-100 text-blue-700 border-blue-200";
    if (p.includes("verb"))
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (p.includes("adj"))
      return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-600 border-slate-200";
  };

  const updateBlocklist = async (newList: string[]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ blocked_words: newList })
      .eq("id", user?.id);

    if (!error) {
      setUserBlocklist(newList);
      alert("Blocklist updated!");
    }
  };

  const updateAudioSetting = async (column: string, value: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: value })
      .eq("id", user?.id);

    if (!error) {
      if (column === "auto_play_jp") setAutoPlayJp(value);
      if (column === "auto_play_en") setAutoPlayEn(value);
    }
  };

  const importPack = async (pack: any) => {
    if (!defaultDeckId) {
      alert(
        "Deck ID is missing. Still loading your profile... please try again in 1 second.",
      );
      fetchDecks(); // Manually trigger a refresh
      return;
    }

    if (!user || !defaultDeckId) return;

    // 1. Safety check: prevent double-adding
    if (ownedPacks?.includes(pack.id)) return;

    setLoading(true);
    try {
      const nWords = pack.card_data as any[];

      // 2. Upsert words (Standard logic)
      const { data: uploadedCards, error: mErr } = await supabase
        .from("master_cards")
        .upsert(
          nWords.map((w) => ({ ...w, creator_id: user.id })),
          { onConflict: "japanese" },
        )
        .select("id");

      if (mErr || !uploadedCards) throw mErr;
      const cardIds = uploadedCards.map((c) => c.id);

      // 3. Link and Score Initialization
      await Promise.all([
        supabase.from("deck_cards").upsert(
          cardIds.map((id) => ({ deck_id: defaultDeckId, card_id: id })),
          { onConflict: "deck_id,card_id" },
        ),
        supabase.from("user_scores").upsert(
          cardIds.map((id) => ({
            user_id: user.id,
            card_id: id,
            scores_json: {
              jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
              en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
            },
          })),
          { onConflict: "user_id,card_id" },
        ),
      ]);

      // 4. Update Profile with the ID ONLY
      const updatedPacks = [...(ownedPacks || []), pack.id];

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ imported_packs: updatedPacks })
        .eq("id", user.id);

      if (pErr) throw pErr;

      // 5. Update local state
      setOwnedPacks(updatedPacks);
      fetchCards();
    } catch (error: any) {
      console.error(error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    setSubmittingFeedback(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("system_feedback").insert({
      user_id: user?.id,
      ...feedbackForm,
    });
    if (!error) {
      setSent(true);
      setFeedbackForm({ type: "feedback", subject: "", description: "" });
      setTimeout(() => setSent(false), 4000);
    }
    setSubmittingFeedback(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Management Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.add_new_word}
              className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                if (!input.trim()) return;
                const lines = input.split("\n").filter((l) => l.trim());
                processWords(lines);
              }}
              disabled={loading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "..." : t.ai_add}
            </button>
          </div>

          <button
            onClick={() => setShowBatch(!showBatch)}
            className="px-6 py-2 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-colors"
          >
            {showBatch ? t.close : t.batch_upload}
          </button>
        </div>

        {/* Batch Area */}
        {showBatch && (
          <div className="mb-8 p-6 bg-indigo-50 rounded-3xl border-2 border-dashed border-indigo-200">
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              className="w-full h-48 p-4 rounded-xl border-none outline-none mb-3 text-sm font-mono shadow-inner"
              placeholder={
                lang === "jp"
                  ? `入力形式の選択:
1. リスト形式: 単語, 意味 (1行に1項目)
2. 歌詞・長文: 歌詞や文章を貼り付けると、AIが新しい単語を抽出します！`
                  : `FORMAT OPTIONS:
1. List: word, meaning (one per line)
2. Lyrics: Paste a whole song or text. I'll pick out the new words for you!`
              }
            />
            <button
              onClick={() => processWords([batchInput])}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
            >
              {loading ? "AI is Extracting & Translating..." : t.process_text}
            </button>
          </div>
        )}

        {/* Settings Toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 font-bold text-slate-600 transition-all active:scale-95"
          >
            <span>{showSettings ? "✕" : "⚙️"}</span>
            {/* Use t.close_settings or t.settings */}
            <span className="text-sm">
              {showSettings ? t.close_settings : t.settings}
            </span>
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span>🔊</span> {t.audio_prefs}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {t.auto_play_jp}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {t.audio_desc_jp}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateAudioSetting("auto_play_jp", !autoPlayJp)
                    }
                    className={`w-12 h-6 rounded-full transition-all relative ${autoPlayJp ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayJp ? "left-7" : "left-1"}`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {t.auto_play_en}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {t.audio_desc_en}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateAudioSetting("auto_play_en", !autoPlayEn)
                    }
                    className={`w-12 h-6 rounded-full transition-all relative ${autoPlayEn ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayEn ? "left-7" : "left-1"}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full mb-8" />

            {/* Language Preference - NEW SECTION */}
            {/* Language Preference - RESPONSIVE FIX */}
            <div className="mb-8">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <span>🌐</span> {t.interface_language}
              </h3>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                <div className="max-w-[200px]">
                  <p className="text-sm font-bold text-slate-700 leading-tight">
                    {t.app_language}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium mt-0.5 leading-relaxed">
                    {t.app_language_desc}
                  </p>
                </div>

                {/* Buttons: Forced to fit on one line or stacked based on width */}
                <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-full sm:w-auto">
                  <button
                    onClick={() => setLang("en")}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                      lang === "en"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    ENGLISH
                  </button>
                  <button
                    onClick={() => setLang("jp")}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                      lang === "jp"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    日本語
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full mb-8" />

            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span>🚫</span> {t.word_filters}
              </h3>
              <div className="flex flex-wrap gap-2 mb-6 p-4 bg-slate-50 rounded-2xl min-h-[60px] border border-slate-100">
                {userBlocklist.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-rose-200"
                  >
                    {word}
                    <button
                      onClick={() =>
                        updateBlocklist(userBlocklist.filter((w) => w !== word))
                      }
                      className="text-rose-400 hover:text-rose-600 ml-1 px-1 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlockWord}
                  onChange={(e) => setNewBlockWord(e.target.value)}
                  placeholder={t.add_word_to_block}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    newBlockWord.trim() &&
                    (updateBlocklist([...userBlocklist, newBlockWord.trim()]),
                    setNewBlockWord(""))
                  }
                />
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full mb-8" />

            {/* BUG & FEEDBACK SECTION - NEW */}
            <div className="mb-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span>💬</span> {t.feedback_title}
              </h3>

              {sent ? (
                <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-2xl text-center animate-in zoom-in-95 duration-300">
                  <p className="text-emerald-600 font-black uppercase text-[10px] tracking-widest">
                    {t.feedback_sent}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* TYPE SELECTOR */}
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 gap-1">
                    {[t.type_bug, t.type_feedback, t.type_feature].map(
                      (type) => (
                        <button
                          key={type}
                          onClick={() =>
                            setFeedbackForm({ ...feedbackForm, type })
                          }
                          className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                            feedbackForm.type === type
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-slate-400 hover:text-slate-500"
                          }`}
                        >
                          {type}
                        </button>
                      ),
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder={t.feedback_placeholder_subject}
                    value={feedbackForm.subject}
                    onChange={(e) =>
                      setFeedbackForm({
                        ...feedbackForm,
                        subject: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300"
                  />

                  <textarea
                    rows={3}
                    placeholder={t.feedback_placeholder_desc}
                    value={feedbackForm.description}
                    onChange={(e) =>
                      setFeedbackForm({
                        ...feedbackForm,
                        description: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300 resize-none"
                  />

                  <button
                    onClick={submitFeedback}
                    disabled={submittingFeedback || !feedbackForm.subject}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
                  >
                    {submittingFeedback
                      ? t.feedback_btn_sending
                      : t.feedback_btn_submit}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          {/* Left Side: Deck Title & Edit Logic */}
          <div className="flex flex-col">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  className="text-2xl md:text-3xl font-extrabold text-slate-800 bg-transparent border-b-2 border-indigo-500 outline-none px-1 py-0 min-w-[200px]"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && updateDeckTitle()}
                  onBlur={() => !tempTitle.trim() && setIsEditingTitle(false)}
                />
                <button
                  onClick={updateDeckTitle}
                  className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 transition-colors"
                >
                  {t.save}
                </button>
                <button
                  onClick={() => setIsEditingTitle(false)}
                  className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight tracking-tight">
                  {deckTitle}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1.5 bg-slate-200/50 text-slate-400 rounded-lg hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-90"
                  title="Rename Deck"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">
              {t.active_collection}
            </p>
          </div>

          {/* Right Side: Navigation Buttons */}
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto md:ml-auto">
            {/* Admin Button - Full width row 1 on mobile */}
            {isAdmin && (
              <Link
                href="/admin"
                className="w-full md:w-auto bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="text-sm">🚩</span> {t.admin_title}
              </Link>
            )}

            {/* Study & Logout - Shared row 2 on mobile */}
            <div className="flex gap-3 w-full md:w-auto">
              <Link
                href="/"
                className="flex-1 md:flex-none md:px-6 bg-white py-3 rounded-2xl shadow-sm font-bold text-indigo-600 border border-slate-100 text-center hover:bg-slate-50 transition-all text-sm whitespace-nowrap"
              >
                ← {t.back_to_study}
              </Link>

              <button
                onClick={handleLogout}
                className="flex-1 md:flex-none md:px-6 bg-rose-50 py-3 rounded-2xl shadow-sm font-bold text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all text-sm whitespace-nowrap"
              >
                {t.signout}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8">
          <StatCard
            label={t.vocabulary}
            value={totalCards}
            color="bg-indigo-500"
          />
          <StatCard
            label={t.mastered}
            value={masteredCards}
            color="bg-emerald-500"
          />
          <StatCard
            label={t.struggling}
            value={strugglingCards}
            color="bg-rose-500"
          />

          <div className="bg-gradient-to-br from-orange-500 to-red-600 p-5 rounded-[2rem] shadow-lg flex items-center justify-between text-white overflow-hidden">
            {/* Left Section: Added pl-3 to prevent text from touching the left edge on mobile */}
            <div className="flex flex-1 items-center gap-4 sm:gap-10 pl-3 sm:pl-0">
              {/* Container for both streaks: Stack on mobile, Row on tablet+ */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-10">
                {/* DAILY LOGIN STREAK */}
                <div className="flex flex-col">
                  <p className="text-white/70 text-[9px] sm:text-[10px] font-black uppercase tracking-tighter mb-0.5 whitespace-nowrap">
                    {t.daily_streak}
                  </p>
                  <p className="text-xl sm:text-3xl font-black leading-none">
                    {streak}{" "}
                    <span className="text-[10px] sm:text-xs uppercase opacity-80">
                      {t.days}
                    </span>
                  </p>
                </div>

                {/* DIVIDER: Hidden on mobile because we are stacking vertically */}
                <div className="hidden sm:block w-px h-8 bg-white/20" />

                {/* BEST SESSION STREAK */}
                <div className="flex flex-col">
                  <p className="text-white/70 text-[9px] sm:text-[10px] font-black uppercase tracking-tighter mb-0.5 whitespace-nowrap">
                    {t.best_streak}
                  </p>
                  <p className="text-xl sm:text-3xl font-black italic leading-none">
                    {maxStreak}{" "}
                    <span className="text-[10px] not-italic uppercase opacity-80">
                      {t.passes}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section: Icon - Using firePulseAnimation logic */}
            <div className="ml-2 flex-shrink-0">
              <span className="inline-block text-3xl sm:text-4xl animate-fire">
                🔥
              </span>
            </div>

            {/* The Animation Logic */}
            <style jsx global>{`
              @keyframes firePulse {
                0% {
                  transform: scale(1);
                  opacity: 0.9;
                  filter: drop-shadow(0 0 2px #ff6b00);
                }
                50% {
                  transform: scale(1.15);
                  opacity: 1;
                  filter: drop-shadow(0 0 8px #ffeb3b);
                }
                100% {
                  transform: scale(1);
                  opacity: 0.9;
                  filter: drop-shadow(0 0 2px #ff6b00);
                }
              }
              .animate-fire {
                animation: firePulse 2s ease-in-out infinite;
              }
            `}</style>
          </div>

          {/* Directional Comparison Dashboard */}
          <div className="col-span-2 md:col-span-3 bg-slate-800 rounded-[2.5rem] p-6 text-white shadow-xl border border-slate-700 relative overflow-hidden">
            {/* Subtle Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />

            <div className="flex flex-col md:flex-row gap-8 items-center">
              {/* Left Side: JP → EN */}
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-black rounded-md border border-indigo-500/30 uppercase tracking-widest">
                    {t.recognition}
                  </span>
                  <p className="text-xs font-bold text-slate-400">🇯🇵 → 🇺🇸</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      {t.tries}
                    </p>
                    <p className="text-xl font-black">{globalStats.jp.tries}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase">
                      {t.accuracy}
                    </p>
                    <p className="text-xl font-black">
                      {globalStats.jp.tries > 0
                        ? Math.round(
                            (globalStats.jp.pass / globalStats.jp.tries) * 100,
                          )
                        : 0}
                      %
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">
                      {t.pass}
                    </p>
                    <p className="text-xl font-black text-emerald-400">
                      {globalStats.jp.pass}
                    </p>
                  </div>
                </div>
              </div>

              {/* Center Divider (Desktop Only) */}
              <div className="hidden md:block w-px h-16 bg-slate-700/50" />

              {/* Right Side: EN → JP */}
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-black rounded-md border border-orange-500/30 uppercase tracking-widest">
                    {t.recall}
                  </span>
                  <p className="text-xs font-bold text-slate-400">🇺🇸 → 🇯🇵</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      {t.tries}
                    </p>
                    <p className="text-xl font-black">{globalStats.en.tries}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-orange-400 uppercase">
                      {t.accuracy}
                    </p>
                    <p className="text-xl font-black">
                      {globalStats.en.tries > 0
                        ? Math.round(
                            (globalStats.en.pass / globalStats.en.tries) * 100,
                          )
                        : 0}
                      %
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">
                      {t.pass}
                    </p>
                    <p className="text-xl font-black text-emerald-400">
                      {globalStats.en.pass}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Starter Packs Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {t.starter_collections}
            </h3>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
              {starterPacks.length} {t.available}
            </span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-6 no-scrollbar -mx-2 px-2">
            {starterPacks.map((pack) => {
              // Pure ID comparison
              const isOwned = ownedPacks?.includes(pack.id);

              return (
                <div
                  key={pack.id}
                  className={`flex-none w-64 p-6 rounded-[2rem] border-2 flex flex-col justify-between transition-all ${
                    isOwned
                      ? "bg-slate-100 border-slate-200"
                      : "bg-white border-indigo-50 shadow-sm"
                  }`}
                >
                  {/* Top Section: Icon and Status */}
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
                          isOwned ? "bg-slate-200" : "bg-indigo-50"
                        }`}
                      >
                        {pack.icon || "📦"}
                      </div>
                      {isOwned ? (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-100/50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-emerald-200">
                          {t.added}
                        </span>
                      ) : (
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-indigo-100">
                          {t.free}
                        </span>
                      )}
                    </div>

                    {/* Middle Section: Content */}
                    <h4 className="font-black text-slate-800 text-lg mb-1">
                      {pack.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-6 line-clamp-2 min-h-[32px]">
                      {pack.description ||
                        `${pack.card_data?.length || 0} essential words to kickstart your journey.`}
                    </p>
                  </div>

                  {/* Bottom Section: Action */}
                  <button
                    onClick={() => importPack(pack)}
                    disabled={loading || isOwned}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all ${
                      isOwned
                        ? "bg-slate-200 text-slate-400"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {isOwned ? t.already_in_deck : t.add_to_deck}
                  </button>
                </div>
              );
            })}

            {/* Empty State */}
            {starterPacks.length === 0 && (
              <div className="flex-none w-full p-8 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                <p className="text-sm text-slate-400 font-bold italic">
                  {t.looking_collections}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            🔍
          </div>
          <input
            type="text"
            placeholder={t.search_placeholder}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDisplayLimit(20);
            }}
          />
        </div>

        {/* List Views (Mobile & Desktop) */}
        <div className="md:hidden space-y-4">
          {visibleCards.map((card) => (
            <div
              key={card.id}
              className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden"
            >
              {/* ACTION BUTTONS (Top Right) */}
              {/* ACTION BUTTONS (Perfectly Aligned) */}
              <div className="absolute top-4 right-4 flex items-center gap-1">
                {/* REPORT BUTTON */}
                <button
                  onClick={() => handleReport(card.id, card.english)}
                  className="w-8 h-8 flex items-center justify-center text-amber-500 active:scale-90 transition-all"
                >
                  <span className="text-base leading-none">🚩</span>
                </button>

                {/* DELETE BUTTON */}
                <button
                  onClick={() => deleteCard(card.id)}
                  className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 active:scale-90 transition-all"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-black text-slate-800">
                  {card.japanese}
                </div>
                {card.partOfSpeech && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}
                  >
                    {card.partOfSpeech}
                  </span>
                )}
                <div className="text-sm font-bold text-indigo-500">
                  {card.reading}
                </div>
                <div className="text-slate-600 mt-1">{card.english}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
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
                        style={{
                          width: `${card.scores?.jp_to_en?.percent || 0}%`,
                        }}
                      />
                    </div>
                  </div>
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
                        style={{
                          width: `${card.scores?.en_to_jp?.percent || 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">{t.kanji_reading}</th>
                <th className="px-6 py-4">{t.english}</th>
                <th className="px-6 py-4">🇯🇵→🇺🇸 {t.score}</th>
                <th className="px-6 py-4">🇺🇸→🇯🇵 {t.score}</th>
                <th className="px-6 py-4 text-right">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCards.map((card) => (
                <tr
                  key={card.id}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="font-bold text-lg text-slate-800">
                      {card.japanese}
                    </div>
                    {card.partOfSpeech && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}
                      >
                        {card.partOfSpeech}
                      </span>
                    )}
                    <div className="text-xs text-indigo-500 font-medium">
                      {card.reading}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    {card.english}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">
                      {card.scores?.jp_to_en?.percent || 0}%
                    </div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{
                          width: `${card.scores?.jp_to_en?.percent || 0}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">
                      {card.scores?.en_to_jp?.percent || 0}%
                    </div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-orange-400"
                        style={{
                          width: `${card.scores?.en_to_jp?.percent || 0}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {/* REPORT BUTTON */}
                      <button
                        onClick={() => handleReport(card.id, card.english)}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors group relative"
                        title={t.report_issue}
                      >
                        <span className="text-lg">🚩</span>
                      </button>

                      {/* DELETE BUTTON (Existing) */}
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        title={t.delete}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCards.length > displayLimit && (
          <div className="mt-8 mb-12 flex justify-center">
            <button
              onClick={() => setDisplayLimit((prev) => prev + 50)}
              className="bg-white border border-slate-200 px-8 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50"
            >
              {t.load_more} ({filteredCards.length - displayLimit} {t.remaining}
              )
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-bold animate-pulse">{t.ai_building}</p>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
      <div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-tighter">
          {label}
        </p>
        <p className="text-4xl font-black text-slate-800">{value || 0}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl ${color} opacity-20`} />
    </div>
  );
}
