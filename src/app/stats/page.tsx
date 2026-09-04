"use client";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlashcardData } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { translations } from "@/lib/languages";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { useAppAlert } from "@/context/AlertContext";
import { motion, useAnimationControls } from "framer-motion";
import Logo from "@/components/Logo";
import { calculateGlobalStats } from "@/lib/stats";
import { authedFetch } from "@/lib/authedFetch";
import LoadingScreen from "@/components/LoadingScreen";
import KnownWordsTriage, { TriageCard } from "@/components/KnownWordsTriage";
import { List, X, Plus, Loader2, RotateCcw } from "lucide-react";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { normalizeEnglish, stripParens, normalizePartOfSpeech } from "@/lib/textNormalize";

interface StatsCardsCache { userId: string; cards: FlashcardData[]; deckId: string; }
let _statsCardsCache: StatsCardsCache | null = null;

interface QuickStats {
  total: number;
  mastered: number;
  struggling: number;
  jp: { tries: number; pass: number; fail: number };
  en: { tries: number; pass: number; fail: number };
}

function computeQuickStats(rows: { user_scores?: { scores_json?: any }[] }[]): QuickStats {
  let total = 0, mastered = 0, struggling = 0;
  let jpTries = 0, jpPass = 0, jpFail = 0, enTries = 0, enPass = 0, enFail = 0;
  for (const row of rows) {
    const s = row.user_scores?.[0]?.scores_json;
    const jp = s?.jp_to_en ?? {};
    const en = s?.en_to_jp ?? {};
    total++;
    const jpPass5 = (jp.pass ?? 0) >= 5 && (jp.percent ?? 0) >= 70;
    const enPass5 = (en.pass ?? 0) >= 5 && (en.percent ?? 0) >= 70;
    if (jpPass5 || enPass5) mastered++;
    const totalAttempts = (jp.total ?? 0) + (en.total ?? 0);
    if (totalAttempts > 0 && ((jp.percent ?? 0) + (en.percent ?? 0)) / 2 < 40) struggling++;
    jpTries += jp.total ?? 0; jpPass += jp.pass ?? 0; jpFail += jp.fail ?? 0;
    enTries += en.total ?? 0; enPass += en.pass ?? 0; enFail += en.fail ?? 0;
  }
  return { total, mastered, struggling, jp: { tries: jpTries, pass: jpPass, fail: jpFail }, en: { tries: enTries, pass: enPass, fail: enFail } };
}

function SparkLine({ values, color }: { values: (number | null)[]; color: string }) {
  const W = 64, H = 28;
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length === 0) return (
    <div style={{ width: W, height: H }} className="flex items-center">
      <div className="w-full h-px bg-slate-100" />
    </div>
  );
  if (pts.length === 1) {
    const cx = ((pts[0].i / Math.max(values.length - 1, 1)) * W).toFixed(1);
    const cy = (H / 2).toFixed(1);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <line x1="0" y1={cy} x2={W} y2={cy} stroke={color} strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3,3" />
        <circle cx={cx} cy={cy} r="2.5" fill={color} />
      </svg>
    );
  }
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v), min + 1);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min)) * (H - 6);
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${x(pts[0].i).toFixed(1)},${H} ${pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} ${x(pts[pts.length - 1].i).toFixed(1)},${H}`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <polygon points={area} fill={color} fillOpacity="0.15" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i).toFixed(1)} cy={y(last.v).toFixed(1)} r="2.5" fill={color} />
    </svg>
  );
}

const CONFETTI_PARTICLES = [
  { color: "#6366f1", left: 8,  delay: 0,    drift: -40, h: 10, w: 10, round: true  },
  { color: "#f59e0b", left: 18, delay: 0.1,  drift: 35,  h: 6,  w: 12, round: false },
  { color: "#10b981", left: 28, delay: 0.25, drift: -20, h: 8,  w: 8,  round: true  },
  { color: "#f43f5e", left: 38, delay: 0.05, drift: 50,  h: 6,  w: 10, round: false },
  { color: "#3b82f6", left: 50, delay: 0.2,  drift: -55, h: 10, w: 6,  round: false },
  { color: "#8b5cf6", left: 60, delay: 0.15, drift: 25,  h: 6,  w: 8,  round: true  },
  { color: "#f59e0b", left: 70, delay: 0.3,  drift: -30, h: 8,  w: 8,  round: false },
  { color: "#6366f1", left: 80, delay: 0.1,  drift: 45,  h: 6,  w: 6,  round: true  },
  { color: "#10b981", left: 90, delay: 0.2,  drift: -50, h: 10, w: 6,  round: true  },
  { color: "#f43f5e", left: 13, delay: 0.35, drift: 60,  h: 6,  w: 10, round: false },
  { color: "#3b82f6", left: 33, delay: 0.08, drift: -65, h: 8,  w: 8,  round: true  },
  { color: "#8b5cf6", left: 55, delay: 0.22, drift: 30,  h: 6,  w: 6,  round: false },
  { color: "#f43f5e", left: 43, delay: 0.18, drift: -45, h: 8,  w: 6,  round: true  },
  { color: "#6366f1", left: 75, delay: 0.28, drift: 55,  h: 6,  w: 10, round: false },
];

export default function StatsPage() {
  const router = useRouter();
  const t = translations.en;
  const { isBusy: uploadBusy, setIsBusy: setUploadBusy } = useUploadGuard();
  const { showAlert, showConfirm } = useAppAlert();
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userBlocklist, setUserBlocklist] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [newBlockWord, setNewBlockWord] = useState("");
  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [maxStreak, setMaxStreak] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(50);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState("Main Deck");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [starterPacks, setStarterPacks] = useState<any[]>([]);
  const [ownedPacks, setOwnedPacks] = useState<string[]>([]);
  const [triage, setTriage] = useState<{ packName: string; cards: TriageCard[] } | null>(null);
  const [swipeOnly, setSwipeOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(true);
  const [feedbackForm, setFeedbackForm] = useState({
    type: "feedback",
    subject: "",
    description: "",
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [sent, setSent] = useState(false);
  const [viewMode, setViewMode] = useState<"none" | "mastered" | "struggling">(
    "none",
  );
  const [dailyHistory, setDailyHistory] = useState<
    { study_date: string; count: number }[]
  >([]);
  const [quizHistory, setQuizHistory] = useState<
    { study_date: string; reading: number | null; listening: number | null; grammar: number | null }[]
  >([]);
  const [historyTab, setHistoryTab] = useState<"flashcards" | "quizzes">("flashcards");
  const [showHistory, setShowHistory] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showMasteredCelebration, setShowMasteredCelebration] = useState(false);
  const [showStrugglingCelebration, setShowStrugglingCelebration] = useState(false);
  const [reviewsToday, setReviewsToday] = useState(0);
  const [previewPack, setPreviewPack] = useState<any | null>(null);
  const [addedWordsSummary, setAddedWordsSummary] = useState<any[]>([]);
  const [showSummaryOverlay, setShowSummaryOverlay] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [pendingWords, setPendingWords] = useState<string[]>([]);
  const [showWordList, setShowWordList] = useState(false);
  const [wordListAdding, setWordListAdding] = useState(false);
  const [wordListText, setWordListText] = useState("");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addSheetTab, setAddSheetTab] = useState<"word" | "paste" | "queue">("word");
  const [refreshKey, setRefreshKey] = useState(0);
  const [cardFetchKey, setCardFetchKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const skipNextCardFetch = useRef(false);
  useEffect(() => { if (showWordList) setWordListText(pendingWords.join("\n")); }, [showWordList]);
  useEffect(() => { if (showAddSheet && addSheetTab === "queue") setWordListText(pendingWords.join("\n")); }, [showAddSheet, addSheetTab]);
  // Safety net: don't let the nav-guard get stuck "busy" forever if this page unmounts
  // some other way (browser back/forward) while a batch upload was mid-flight.
  useEffect(() => () => setUploadBusy(false), [setUploadBusy]);

  // Block browser-level navigation (tab close, URL bar, browser back/forward) during upload.
  useEffect(() => {
    if (!uploadBusy) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadBusy]);

  useEffect(() => {
    const fetchTodayCount = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get today's date in YYYY-MM-DD format (Singapore Time)
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Singapore",
      });

      const { data, error } = await supabase
        .from("user_review_counts")
        .select("count")
        .eq("user_id", user.id)
        .eq("study_date", today)
        .single();

      if (!error && data) {
        setReviewsToday(data.count);
      }
    };

    fetchTodayCount();
  }, []);

  const fetchHistory = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const since = fourteenDaysAgo.toLocaleDateString("en-CA");

    const [{ data: reviewData }, { data: quizData }] = await Promise.all([
      supabase
        .from("user_review_counts")
        .select("study_date, count")
        .eq("user_id", user.id)
        .gte("study_date", since)
        .order("study_date", { ascending: false }),
      supabase
        .from("quiz_daily_stats")
        .select("study_date, quiz_type, correct, total")
        .eq("user_id", user.id)
        .gte("study_date", since)
        .order("study_date", { ascending: false }),
    ]);

    // Build full 14-day grid (newest first: index 0 = today)
    const days: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    // Pad vocab to full 14 days (0 for days with no reviews)
    const vocabMap = new Map((reviewData ?? []).map(r => [r.study_date, r.count]));
    setDailyHistory(days.map(date => ({ study_date: date, count: vocabMap.get(date) ?? 0 })));
    const acc: Record<string, Record<string, { correct: number; total: number }>> = {};
    for (const row of quizData ?? []) {
      if (!acc[row.study_date]) acc[row.study_date] = {};
      const prev = acc[row.study_date][row.quiz_type] ?? { correct: 0, total: 0 };
      acc[row.study_date][row.quiz_type] = { correct: prev.correct + row.correct, total: prev.total + row.total };
    }
    setQuizHistory(days.map(date => {
      const d = acc[date] ?? {};
      const pct = (type: string) => d[type]?.total ? Math.round((d[type].correct / d[type].total) * 100) : null;
      return { study_date: date, reading: pct("reading"), listening: pct("listening"), grammar: pct("grammar") };
    }));
  };

  const fetchStarterPacks = async () => {
    const { data, error } = await supabase.from("starter_packs").select("*").order("created_at"); // Fetches id, name, description, card_data, etc.
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
    } else {
      // 3. Optional: If they have NO decks, create one for them
      console.log(
        "No decks found for user. You might need to create a 'Main Deck' first.",
      );
    }
  };
  useEffect(() => {
    // 1. Only set initLoading if we don't have a user yet
    if (!user) {
      setInitLoading(true);
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      // 2. Stop loading on any auth event (login, token refresh, etc.)
      setInitLoading(false);

      if (event === "SIGNED_OUT") {
        window.location.href = "/";
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Empty array means this ONLY runs once on mount

  // 1. Fetch the user's basic info first
  useEffect(() => {
    const initData = async () => {
      if (user) {
        try {
          // Cache hit: populate cards instantly so the page renders without waiting for the big fetch
          const cached = _statsCardsCache?.userId === user.id ? _statsCardsCache : null;
          if (cached) {
            setCards(cached.cards);
            setDefaultDeckId(cached.deckId);
            skipNextCardFetch.current = true;
            setInitLoading(false);
          }

          // Pre-populate from localStorage immediately so + sheet shows queue before Supabase returns
          let localWords: string[] = [];
          try {
            const stored = localStorage.getItem(`flashkado-word-list-${user.id}`);
            localWords = stored ? JSON.parse(stored) : [];
            if (localWords.length > 0) setPendingWords(localWords);
          } catch { /* ignore */ }

          const [, , , pendingData] = await Promise.all([
            fetchProfile(),
            fetchDefaultDeck(),
            fetchStarterPacks(),
            supabase.from("profiles").select("pending_words").eq("id", user.id).single(),
          ]);
          const dbWords: string[] = pendingData.data?.pending_words ?? [];
          // Union of DB + localStorage so we never drop locally-added words that haven't synced
          const merged = [...new Set([...dbWords, ...localWords])];
          setPendingWords(merged);
          localStorage.setItem(`flashkado-word-list-${user.id}`, JSON.stringify(merged));
        } catch (error) {
          console.error("Error loading stats:", error);
        } finally {
          setInitLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    initData();
  }, [user, refreshKey]);

  // 2. ONLY fetch cards once we have a valid Deck ID
  useEffect(() => {
    if (!user || !defaultDeckId) return;
    if (skipNextCardFetch.current) {
      skipNextCardFetch.current = false;
      return;
    }
    fetchCards();
  }, [user, defaultDeckId, cardFetchKey]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "full_name, avatar_url, streak_count, max_streak, blocked_words, auto_play_jp, auto_play_en, sfx_enabled, swipe_only, imported_packs, is_admin, is_premium, referral_code, stats_visible_to_friends",
      )
      .eq("id", user?.id)
      .single();

    if (data) {
      setMaxStreak(data.max_streak || 0);
      setUserBlocklist(data.blocked_words || []);
      setAutoPlayJp(data.auto_play_jp);
      setAutoPlayEn(data.auto_play_en);
      setSfxEnabled(data.sfx_enabled);
      setSwipeOnly(data.swipe_only ?? false);
      setOwnedPacks(data.imported_packs);
      setIsAdmin(data.is_admin);
      setIsPremium(data.is_premium ?? false);
      setProfileName(data.full_name);
      setAvatarUrl(data.avatar_url ?? null);
      setReferralCode(data.referral_code ?? null);
      setStatsVisible(data.stats_visible_to_friends ?? true);
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
      showAlert("Failed to update deck name");
    } else {
      setDeckTitle(tempTitle.trim());
      setIsEditingTitle(false);
    }
  };

  const handleRefresh = () => {
    _statsCardsCache = null;
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setCardFetchKey((k) => k + 1);
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
      showAlert("Failed to send report.");
    } else {
      showAlert(t.report_sent);
    }
  };

  const fetchCards = async () => {
    if (!user || !defaultDeckId) return;

    setCardsLoading(true);
    try {
      // Phase 1 — lean: fetch only scores_json (no text columns) to show stat numbers fast
      const leanAll: any[] = [];
      const LEAN_PAGE = 1000;
      for (let from = 0; ; from += LEAN_PAGE) {
        const { data: page } = await supabase
          .from("master_cards")
          .select("id, deck_cards!inner(deck_id), user_scores(scores_json)")
          .eq("deck_cards.deck_id", defaultDeckId)
          .eq("user_scores.user_id", user.id)
          .range(from, from + LEAN_PAGE - 1);
        if (page) leanAll.push(...page);
        if (!page || page.length < LEAN_PAGE) break;
      }
      if (leanAll.length) setQuickStats(computeQuickStats(leanAll));
      setInitLoading(false); // page is now visible with stat numbers

      // Phase 2 — full: fetch all card content for the card list (background)
      const allData: any[] = [];
      let error = null;
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page, error: pageErr } = await supabase
          .from("master_cards")
          .select(`*, deck_cards!inner(deck_id, added_at), user_scores(scores_json)`)
          .eq("deck_cards.deck_id", defaultDeckId)
          .eq("user_scores.user_id", user.id)
          .order("added_at", { foreignTable: "deck_cards", ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (pageErr) { error = pageErr; break; }
        if (page) allData.push(...page);
        if (!page || page.length < PAGE_SIZE) break;
      }

      if (error) { console.error("Fetch Error:", (error as any).message); return; }

      const flattened = allData.map((card: any) => ({
        ...card,
        added_to_deck_at: card.deck_cards?.[0]?.added_at,
        scores: card.user_scores?.[0]?.scores_json || {
          jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
          en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
        },
      }));

      setCards(flattened);
      if (user && defaultDeckId) {
        _statsCardsCache = { userId: user.id, cards: flattened, deckId: defaultDeckId };
      }
    } catch (err) {
      console.error("Unexpected Fetch Error:", err);
    } finally {
      setCardsLoading(false);
      setInitLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const ok = await showConfirm(t.delete_confirm, { title: t.delete_account, confirmLabel: t.delete_btn, danger: true });
      if (!ok) return;

      // Call the Postgres function we just created
      const { error } = await supabase.rpc("delete_user_forever");

      if (error) {
        console.error("RPC Error:", error.message);
        throw error;
      }

      // Sign out locally to clear the session
      await supabase.auth.signOut();

      // Redirect to landing
      window.location.href = "/";
    } catch (error) {
      console.error("Error deleting account:", error);
      showAlert("Failed to delete account. Please try logging in again first.");
    }
  };

  const processWords = async (inputList: string[]): Promise<Set<string>> => {
    const succeededWords = new Set<string>();
    if (!user || !defaultDeckId) {
      showAlert("Please log in and ensure deck is initialized.");
      return succeededWords;
    }

    // Snapshot deck before any changes so we can flag cards already owned
    const preExistingDeckIds = new Set(cards.map((c) => c.id));

    const rawInput = inputList.join("\n").normalize("NFKC").trim();
    if (!rawInput) return succeededWords;

    // --- 1. Tokenization Logic ---
    let wordsToProcess: string[] = [];
    const isEnglishInput = /^[A-Za-z0-9\s.,!?-]+$/.test(rawInput);

    // NEW: Single Add Bypass
    // If only one item is provided, we treat it as a deliberate single add
    // and do NOT chop the kanji/words.
    if (inputList.length === 1 && inputList[0].trim().length > 0) {
      wordsToProcess = [inputList[0].trim()];
    }
    // Batch Add Logic
    else if (isEnglishInput) {
      wordsToProcess = inputList
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
    } else if (rawInput.includes(",") || rawInput.includes("-")) {
      wordsToProcess = inputList.map((line) => line.split(/[,-]/)[0].trim());
    } else {
      // Only use the "Chopper" (Segmenter) if it's a batch add/sentence
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
    if (uniqueInputWords.length === 0) return succeededWords;

    setLoading(true);

    /* --- NEW: PARTIAL DAILY LIMIT LOGIC --- */
    let wordsToActuallyProcess = uniqueInputWords;
    const DAILY_LIMIT = 50;

    try {
      if (isAdmin) throw new Error("skip"); // admins have no limit
      const { data: performance } = await supabase
        .from("admin_user_performance_master")
        .select("cards_added_today")
        .eq("id", user.id)
        .single();

      const currentToday = performance?.cards_added_today || 0;

      if (currentToday >= DAILY_LIMIT) {
        setLoading(false);
        setInput("");
        setBatchInput("");
        showAlert(
          t.limit_reached_msg
            .replace("{{current}}", currentToday.toString())
            .replace("{{limit}}", DAILY_LIMIT.toString()),
        );
        return succeededWords;
      }

      if (currentToday + uniqueInputWords.length > DAILY_LIMIT) {
        const allowedCount = DAILY_LIMIT - currentToday;
        // Slice the array to only include what fits in the remaining quota
        wordsToActuallyProcess = uniqueInputWords.slice(0, allowedCount);

        // Optional: Inform the user we are only doing a partial add
        showAlert(
          t.partial_limit_msg.replace("{{count}}", allowedCount.toString()),
        );
      }
    } catch (limitErr) {
      console.error("Limit check failed, proceeding anyway:", limitErr);
    }
    /* --- END OF PARTIAL LIMIT LOGIC --- */

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

    let allProcessedCards: any[] = [];

    try {
      // --- 2. Step 1: Handle Existing Cards (Instant) ---
      const { data: existingCards, error: searchErr } = await supabase
        .from("master_cards")
        .select("*")
        .in("japanese", wordsToActuallyProcess);

      if (searchErr) throw searchErr;

      if (existingCards) {
        allProcessedCards = [...existingCards];
        const foundIds = existingCards.map((c) => c.id);
        if (foundIds.length > 0) await performLinking(foundIds);
        existingCards.forEach((c) => succeededWords.add(c.japanese));
      }

      const existingMap = new Map(
        existingCards?.map((c) => [c.japanese, c.id]) || [],
      );
      const wordsForAI = wordsToActuallyProcess.filter(
        (w) => !existingMap.has(w),
      );

      // --- 3. Step 2: Handle New Words (AI) ---
      if (wordsForAI.length > 0) {
        try {
          const res = await authedFetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({ words: wordsForAI }),
          });

          if (!res.ok)
            throw new Error(
              res.status === 429 ? "AI Limit Reached" : "AI Error",
            );

          const items = await res.json();
          const itemsArray = Array.isArray(items) ? items : [items];

          // Deduplicate Gemini output by dictionary form
          const seen = new Set<string>();
          const deduplicatedItems = itemsArray
            .map((item) => ({
              japanese: String(item.japanese).trim(),
              reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""),
              english: String(item.english || "").trim(),
              partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(),
              jlpt_level: item.jlpt_level ?? null,
              exampleSentence: item.exampleSentence || { jp: "", en: "" },
              creator_id: user.id,
            }))
            .filter((item) => {
              if (!item.japanese || seen.has(item.japanese)) return false;
              seen.add(item.japanese);
              return true;
            });

          // Second existing-card check against Gemini's normalized dictionary-form words.
          // Catches cards that were missed by the first check (e.g. whole-text paste input).
          const geminiWords = deduplicatedItems.map((i) => i.japanese);
          const { data: alreadyInMaster } = await supabase
            .from("master_cards")
            .select("*")
            .in("japanese", geminiWords);

          const alreadyInMasterMap = new Map((alreadyInMaster ?? []).map((c) => [c.japanese, c]));

          // Link already-existing cards without overwriting their data
          if (alreadyInMaster && alreadyInMaster.length > 0) {
            allProcessedCards = [...allProcessedCards, ...alreadyInMaster];
            await performLinking(alreadyInMaster.map((c) => c.id));
            alreadyInMaster.forEach((c) => succeededWords.add(c.japanese));
          }

          // Only upsert words that are truly new to master_cards
          const trulyNewItems = deduplicatedItems.filter((i) => !alreadyInMasterMap.has(i.japanese));
          if (trulyNewItems.length > 0) {
            const { data: newCards, error: mErr } = await supabase
              .from("master_cards")
              .upsert(trulyNewItems, { onConflict: "japanese" })
              .select("*");

            if (mErr) throw mErr;
            if (newCards) {
              allProcessedCards = [...allProcessedCards, ...newCards];
              await performLinking(newCards.map((c) => c.id));
              newCards.forEach((c) => succeededWords.add(c.japanese));
            }
          }
          wordsForAI.forEach((w) => succeededWords.add(w));
        } catch (aiErr: any) {
          console.error("AI Step Failed:", aiErr.message);
          showAlert(`AI processing failed: ${aiErr.message}`);
        }
      }

      // --- 3.5 Show Overlay ---
      if (allProcessedCards.length > 0) {
        const finalSummary = Array.from(
          new Map(allProcessedCards.map((c) => [c.japanese, c])).values(),
        ).map((c) => ({ ...c, alreadyInDeck: preExistingDeckIds.has(c.id) }));
        setAddedWordsSummary(finalSummary);
        setShowAddSheet(false);
        setShowSummaryOverlay(true);
        fetchCards();
      }

      // --- 4. Cleanup UI ---
      setInput("");
      setBatchInput("");
      setShowBatch(false);
    } catch (e: any) {
      console.error("ProcessWords Error:", e);
      showAlert(
        e.message === "AI Limit Reached"
          ? "Daily word-generation limit reached — this keeps the app free for everyone. Come back tomorrow to add more!"
          : `Something went wrong: ${e.message}`
      );
    } finally {
      setLoading(false);
    }
    return succeededWords;
  };

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncWordList = useCallback((newList: string[]) => {
    setPendingWords(newList);
    if (user) localStorage.setItem(`flashkado-word-list-${user.id}`, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (user) supabase.from("profiles").update({ pending_words: newList }).eq("id", user.id)
        .then(({ error: e }) => { if (e) console.error("[DB word-list sync]", e.code, e.message); });
    }, 1000);
  }, [user]);

  // Cancel any pending debounce and write immediately — used when closing the panel or
  // adding to the deck, so a quick close/click right after typing can't lose the edit.
  const flushWordList = useCallback((newList: string[]) => {
    setPendingWords(newList);
    if (user) {
      localStorage.setItem(`flashkado-word-list-${user.id}`, JSON.stringify(newList));
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      supabase.from("profiles").update({ pending_words: newList }).eq("id", user.id)
        .then(({ error: e }) => { if (e) console.error("[DB word-list flush]", e.code, e.message); });
    }
  }, [user]);

  const addWordListToDeck = async (words: string[]) => {
    if (!words.length) return;
    // Cancel any debounced sync from typing — it could otherwise fire mid-add (this can take
    // a few seconds for AI generation) and overwrite the empty-list flush below with stale data.
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setWordListAdding(true);
    setUploadBusy(true);
    setShowAddSheet(false);
    setBatchProcessing(true);
    try {
      const succeededWords = await processWords(words);
      // Only drop the words that actually made it into the deck — anything that failed
      // (AI error, daily limit) stays in the list so it isn't silently lost.
      flushWordList(words.filter((w) => !succeededWords.has(w)));
      setWordListText("");
      setShowWordList(false);
    } finally {
      setWordListAdding(false);
      setUploadBusy(false);
      setBatchProcessing(false);
    }
  };

  const deleteCard = async (id: string, isFromSummary = false) => {
    // Only show the confirmation if it's NOT from the quick-summary overlay
    if (!isFromSummary && !(await showConfirm("Remove this card from your collection?")))
      return;

    // 1. Database Cleanup (Linking & Scores)
    const { error: linkErr } = await supabase
      .from("deck_cards")
      .delete()
      .eq("card_id", id)
      .eq("deck_id", defaultDeckId);

    const { error: scoreErr } = await supabase
      .from("user_scores")
      .delete()
      .eq("card_id", id)
      .eq("user_id", user?.id);

    if (linkErr || scoreErr) {
      showAlert(`Could not delete: ${linkErr?.message || scoreErr?.message}`);
      return;
    }

    // 2. Update Main List UI
    setCards((prev) => prev.filter((c) => c.id !== id));

    // 3. Update Overlay UI (If applicable)
    if (isFromSummary) {
      setAddedWordsSummary((prev) => prev.filter((c) => c.id !== id));
    }
  };

  // Prefer quickStats (loaded fast) for number display; fall back to full cards once loaded.
  const totalCards = quickStats?.total ?? cards.length;
  const globalStats = useMemo(() => {
    if (quickStats && cards.length === 0) {
      return { jp: quickStats.jp, en: quickStats.en };
    }
    return calculateGlobalStats(cards);
  }, [cards, quickStats]);

  // 1. Global Totals (Tries, Pass, Fail)
  // Separate Global Totals for both directions
  // const globalStats = useMemo(() => {
  //   return cards.reduce(
  //     (acc, card) => {
  //       const s = card.scores;
  //       if (s) {
  //         const jp = s.jp_to_en || { total: 0, pass: 0, fail: 0 };
  //         const en = s.en_to_jp || { total: 0, pass: 0, fail: 0 };

  //         // Accumulate Japanese -> English
  //         acc.jp.tries += jp.total || 0;
  //         acc.jp.pass += jp.pass || 0;
  //         acc.jp.fail += jp.fail || 0;

  //         // Accumulate English -> Japanese
  //         acc.en.tries += en.total || 0;
  //         acc.en.pass += en.pass || 0;
  //         acc.en.fail += en.fail || 0;
  //       }
  //       return acc;
  //     },
  //     {
  //       jp: { tries: 0, pass: 0, fail: 0 },
  //       en: { tries: 0, pass: 0, fail: 0 },
  //     },
  //   );
  // }, [cards]);

  // Mastered = max(jp_to_en, en_to_jp) ≥ 70% with at least one attempt
  const masteredList = useMemo(() => {
    return cards.filter((c) => {
      const s = c.scores;
      return ((s?.jp_to_en?.pass || 0) >= 5 && (s?.jp_to_en?.percent || 0) >= 70) ||
             ((s?.en_to_jp?.pass || 0) >= 5 && (s?.en_to_jp?.percent || 0) >= 70);
    });
  }, [cards]);

  const strugglingList = useMemo(() => {
    return cards.filter((c) => {
      const s = c.scores;
      const totalAttempts =
        (s?.jp_to_en?.total || 0) + (s?.en_to_jp?.total || 0);
      const avgAccuracy =
        ((s?.jp_to_en?.percent || 0) + (s?.en_to_jp?.percent || 0)) / 2;

      return totalAttempts > 0 && avgAccuracy < 40;
    });
  }, [cards]);

  const masteredCount = (quickStats && cards.length === 0) ? quickStats.mastered : masteredList.length;
  const strugglingCount = (quickStats && cards.length === 0) ? quickStats.struggling : strugglingList.length;

  const filteredCards = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return cards
      .filter(
        (card) =>
          card.japanese.toLowerCase().includes(query) ||
          card.reading.toLowerCase().includes(query) ||
          card.english.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        const dateA = new Date(a.added_to_deck_at ?? 0).getTime();
        const dateB = new Date(b.added_to_deck_at ?? 0).getTime();
        return dateB - dateA;
      });
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

  const getJlptColor = (level: string) => {
    switch (level) {
      case "N5": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "N4": return "bg-teal-100 text-teal-700 border-teal-200";
      case "N3": return "bg-amber-100 text-amber-700 border-amber-200";
      case "N2": return "bg-orange-100 text-orange-700 border-orange-200";
      case "N1": return "bg-rose-100 text-rose-700 border-rose-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const updateAvatar = async (url: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user?.id);

    if (!error) {
      setAvatarUrl(url);
    } else {
      showAlert("Failed to update avatar");
    }
  };

  const updateBlocklist = async (newList: string[]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ blocked_words: newList })
      .eq("id", user?.id);

    if (!error) {
      setUserBlocklist(newList);
      showAlert("Blocklist updated!");
    }
  };

  // 2. Update the function to handle the new sfx_enabled column
  const updateAudioSetting = async (column: string, value: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: value })
      .eq("id", user?.id);

    if (!error) {
      if (column === "auto_play_jp") setAutoPlayJp(value);
      if (column === "auto_play_en") setAutoPlayEn(value);
      // Add this line:
      if (column === "sfx_enabled") setSfxEnabled(value);
      if (column === "swipe_only") setSwipeOnly(value);
      if (column === "stats_visible_to_friends") setStatsVisible(value);
    } else {
      console.error("Error updating setting:", error.message);
    }
  };

  const importPack = async (pack: any) => {
    if (!defaultDeckId) {
      showAlert(
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

      // 2. Reuse existing master_cards rows untouched (never overwrite a
      // shared card's data just because a pack happens to include the same
      // word) — only insert genuinely new words, normalized on the way in.
      const CARD_CHUNK = 150;
      const existingByJapanese = new Map<string, { id: string; japanese: string; english: string }>();
      for (let i = 0; i < nWords.length; i += CARD_CHUNK) {
        const chunk = nWords.slice(i, i + CARD_CHUNK).map((w) => w.japanese);
        const { data: existing } = await supabase
          .from("master_cards")
          .select("id, japanese, english")
          .in("japanese", chunk);
        (existing ?? []).forEach((row) => existingByJapanese.set(row.japanese, row));
      }

      const newWords = nWords.filter((w) => !existingByJapanese.has(w.japanese));
      let insertedCards: { id: string; japanese: string; english: string }[] = [];
      if (newWords.length > 0) {
        const { data: inserted, error: mErr } = await supabase
          .from("master_cards")
          .insert(
            newWords.map((w) => ({
              ...w,
              english: typeof w.english === "string" ? normalizeEnglish(w.english) : w.english,
              reading: typeof w.reading === "string" ? stripParens(w.reading) : w.reading,
              partOfSpeech: typeof w.partOfSpeech === "string" ? normalizePartOfSpeech(w.partOfSpeech) : w.partOfSpeech,
              creator_id: user.id,
            })),
          )
          .select("id, japanese, english");
        if (mErr || !inserted) throw mErr;
        insertedCards = inserted;
      }

      const uploadedCards = [...existingByJapanese.values(), ...insertedCards];
      const cardIds = uploadedCards.map((c) => c.id);

      // 3. Find which of these cards you're already studying (e.g. an
      // overlapping word from another pack, or one you added manually) —
      // a starter pack import must never touch an existing score row.
      // Chunked to stay well under URL length limits for large packs.
      const CHUNK = 150;
      const existingScoreIds = new Set<string>();
      for (let i = 0; i < cardIds.length; i += CHUNK) {
        const chunk = cardIds.slice(i, i + CHUNK);
        const { data: existing } = await supabase
          .from("user_scores")
          .select("card_id")
          .eq("user_id", user.id)
          .in("card_id", chunk);
        (existing ?? []).forEach((row) => existingScoreIds.add(row.card_id));
      }
      const newCardIds = cardIds.filter((id) => !existingScoreIds.has(id));

      // 4. Link to deck (safe to upsert — no mutable progress here) and
      // initialize scores ONLY for genuinely new cards.
      await Promise.all([
        supabase.from("deck_cards").upsert(
          cardIds.map((id) => ({ deck_id: defaultDeckId, card_id: id })),
          { onConflict: "deck_id,card_id" },
        ),
        newCardIds.length > 0
          ? supabase.from("user_scores").insert(
              newCardIds.map((id) => ({
                user_id: user.id,
                card_id: id,
                scores_json: {
                  jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
                  en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
                },
              })),
            )
          : Promise.resolve(),
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
      setTriage({ packName: pack.name, cards: uploadedCards.map((c) => ({ id: c.id, japanese: c.japanese, english: c.english })) });
    } catch (error: any) {
      console.error(error);
      showAlert("Error: " + error.message);
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
      type: feedbackForm.type.toLowerCase(),
      subject: feedbackForm.subject,
      description: feedbackForm.description,
      status: "open",
    });

    if (!error) {
      setSent(true);
      // Reset form to default values
      setFeedbackForm({ type: "feedback", subject: "", description: "" });
      setTimeout(() => setSent(false), 4000);
    }

    setSubmittingFeedback(false);
  };

  if (initLoading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      {/* Single Parent Wrapper */}
      {/* 1. STICKY HEADER: Edge-to-Edge */}
      <header className="sticky top-0 z-50 w-full bg-slate-50/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* LEFT: Identity (Bigger & Left-Aligned) */}
          <div className="flex items-center gap-4">
            <Logo className="w-10 h-14 md:w-12 h-16" />

            <div className="flex flex-col text-left">
              <h1
                className={`
  ${(profileName?.length || 10) > 12 ? "text-xl" : "text-3xl"} 
  md:text-4xl font-black text-slate-800 italic uppercase tracking-tighter leading-none
`}
              >
                {profileName || user?.user_metadata?.full_name || ""}
              </h1>

              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="px-2.5 py-0.5 bg-slate-800 text-white rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {t.status_online}
                </span>
                {isPremium && (
                  <span className="px-2.5 py-0.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-white rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                    ✨ Premium
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Refresh + Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              className="flex items-center justify-center w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-slate-600 transition-all active:scale-90 disabled:opacity-40"
            >
              <RotateCcw size={14} className={isRefreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 font-black text-slate-600 transition-all active:scale-95 h-10 uppercase tracking-widest text-[10px]"
            >
              <span>⚙️</span> {t.settings}
            </button>
          </div>
        </div>
      </header>
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-5xl mx-auto">

          {/* Settings — full-screen overlay, same pattern as the quiz components */}
          {showSettings && (
            <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-white shrink-0">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
                >
                  <span>←</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">{t.back}</span>
                </button>
                <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">{t.settings}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto">
              {/* ===== GROUP: ACCOUNT ===== */}
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Account</h2>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* AVATAR PICKER */}
              <div className="mb-8">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🖼️</span> Avatar
                </h3>
                <div className="grid grid-cols-5 gap-3">
                  {AVATAR_PRESETS.map((url) => (
                    <button
                      key={url}
                      onClick={() => updateAvatar(url)}
                      className={`relative aspect-square rounded-full overflow-hidden border-2 bg-slate-50 transition-all active:scale-95 ${
                        avatarUrl === url
                          ? "border-indigo-600 ring-2 ring-indigo-200"
                          : "border-slate-100 hover:border-slate-300"
                      }`}
                    >
                      <img src={url} alt="Avatar option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-100 w-full mb-8" />

              {/* INVITE FRIENDS — referral code + one-tap share */}
              <div className="mb-8">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🎁</span> Invite Friends
                </h3>
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-medium leading-tight mb-3">
                    Share your link — new friends who sign up through it are added to your circle automatically.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 bg-white rounded-xl border border-slate-200 font-black text-sm text-slate-700 tracking-widest truncate">
                      {referralCode ? `flashkado.com/join/${referralCode}` : "…"}
                    </div>
                    <button
                      onClick={async () => {
                        if (!referralCode) return;
                        const shareUrl = `https://flashkado.com/join/${referralCode}`;
                        const shareMessage = `Join me on FlashKado! I'm learning Japanese with AI-powered flashcards 🇯🇵 ${shareUrl}`;
                        if (navigator.share) {
                          try {
                            await navigator.share({ text: shareMessage, url: shareUrl });
                          } catch {
                            // cancelled — no-op
                          }
                          return;
                        }
                        try {
                          await navigator.clipboard.writeText(shareMessage);
                          showAlert("Invite message copied to clipboard!");
                        } catch {
                          showAlert("Failed to copy link.");
                        }
                      }}
                      disabled={!referralCode}
                      className="px-5 py-3 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-40 shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 w-full mb-8" />

              {/* ACCOUNT SECURITY SECTION */}
              <div className="mb-8">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🔒</span> {t.account_security || "Account Security"}
                </h3>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                  <div className="max-w-[250px]">
                    <p className="text-sm font-bold text-slate-700 leading-tight">
                      {t.update_password || "Update Password"}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium mt-0.5 leading-relaxed">
                      {user?.app_metadata?.provider === "email"
                        ? t.update_password_desc ||
                          "Change your login password to keep your account secure."
                        : t.social_login_msg ||
                          "Your account is managed via Google/Facebook."}
                    </p>
                  </div>

                  {user?.app_metadata?.provider === "email" ? (
                    <button
                      onClick={() => router.push("/update-password")}
                      className="w-full sm:w-auto px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2"
                    >
                      <span>🔄</span> {t.change_btn || "Change"}
                    </button>
                  ) : (
                    <div className="px-4 py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-200">
                      Social Auth
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-slate-100 w-full mb-8" />

              {/* SIGN OUT — separated from the danger zone */}
              <div className="mb-8">
                <button
                  onClick={handleLogout}
                  className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-700 transition-all active:scale-95 shadow-sm"
                >
                  {t.signout}
                </button>
              </div>

              {/* DANGER ZONE — intentionally far from sign out */}
              <div className="mt-16 pt-8 border-t-2 border-red-100">
                <h3 className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <span>⚠️</span> {t.danger_zone}
                </h3>

                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="max-w-[250px]">
                    <p className="text-sm font-bold text-red-700 leading-tight">
                      {t.delete_account}
                    </p>
                    <p className="text-[9px] text-red-400 font-medium mt-0.5 leading-relaxed">
                      {t.delete_account_desc}
                    </p>
                  </div>

                  <button
                    onClick={handleDeleteAccount}
                    className="w-full sm:w-auto px-6 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 shadow-sm"
                  >
                    {t.delete_btn}
                  </button>
                </div>
              </div>

              {/* ===== GROUP: PREFERENCES ===== */}
              <div className="flex items-center gap-2.5 mb-6 mt-16">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Preferences</h2>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="mb-8">
                {/* Header Section */}
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🔊</span> {t.audio_prefs}
                </h3>

                {/* Settings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Auto Play JP */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {t.auto_play_jp}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        {t.audio_desc_jp}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("auto_play_jp", !autoPlayJp)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${autoPlayJp ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayJp ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {/* Auto Play EN */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {t.auto_play_en}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        {t.audio_desc_en}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("auto_play_en", !autoPlayEn)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${autoPlayEn ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayEn ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {/* NEW: Sound Effects Toggle (Now matches the others perfectly) */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {t.sfx_title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        {t.sfx_desc}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("sfx_enabled", !sfxEnabled)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${sfxEnabled ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${sfxEnabled ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {/* Swipe Only Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {t.swipe_only_title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        {t.swipe_only_desc}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("swipe_only", !swipeOnly)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${swipeOnly ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${swipeOnly ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {/* Stats Visible to Friends Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        Show my stats to friends
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        Friends can always see your name, streak, and overall level. Turn this off to hide your detailed score breakdown from them.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("stats_visible_to_friends", !statsVisible)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${statsVisible ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${statsVisible ? "left-7" : "left-1"}`}
                      />
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
                          updateBlocklist(
                            userBlocklist.filter((w) => w !== word),
                          )
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

              {/* ===== GROUP: FEEDBACK ===== */}
              <div className="flex items-center gap-2.5 mb-6 mt-16">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Feedback</h2>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

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
                    {/* TYPE SELECTOR WITH INDIGO OVERLAY */}
                    <div className="relative flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 overflow-hidden">
                      {/* Animated Indigo Slider */}
                      <motion.div
                        className="absolute top-1 bottom-1 left-1 w-[calc(33.33%-5.3px)] bg-indigo-600 rounded-lg shadow-sm"
                        initial={false}
                        animate={{
                          x:
                            feedbackForm.type === t.type_bug
                              ? "0%"
                              : feedbackForm.type === t.type_feedback
                                ? "100%"
                                : "200%",
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                      />

                      {[t.type_bug, t.type_feedback, t.type_feature].map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() =>
                              setFeedbackForm({ ...feedbackForm, type })
                            }
                            className={`relative z-10 flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors duration-200 ${
                              feedbackForm.type === type
                                ? "text-white"
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
              {/* UTILITY ROW: Study & Logout */}
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <Link
                  href="/minigames"
                  className="flex-1 md:flex-none md:px-5 bg-indigo-50 py-3 rounded-2xl shadow-sm font-bold text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-all text-sm whitespace-nowrap flex items-center justify-center gap-2"
                >
                  <span className="text-lg">🎮</span> {t.mini_games}
                </Link>

              </div>

              {/* ADMIN ROW */}
              {isAdmin && (
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                  <Link
                    href="/admin"
                    className="w-full md:w-auto bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span className="text-sm">🚩</span> {t.admin_title}
                  </Link>

                  <Link
                    href="/admin/users"
                    className="w-full md:w-auto bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-lg font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span className="text-sm">📊</span> {t.admin_user_stats}
                  </Link>
                </div>
              )}
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
              value={masteredCount}
              color="bg-emerald-500"
              onClick={() => setShowMasteredCelebration(true)}
            />
            <StatCard
              label={t.struggling}
              value={strugglingCount}
              color="bg-rose-500"
              onClick={() => setShowStrugglingCelebration(true)}
            />

            <StatCard
              label={t.daily_progress}
              value={reviewsToday}
              color="bg-amber-400"
              onClick={() => {
                fetchHistory();
                setShowCelebration(true);
              }}
            />

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
                      <p className="text-xl font-black">
                        {globalStats.jp.tries}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-indigo-400 uppercase">
                        {t.accuracy}
                      </p>
                      <p className="text-xl font-black">
                        {globalStats.jp.tries > 0
                          ? Math.round(
                              (globalStats.jp.pass / globalStats.jp.tries) *
                                100,
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
                      <p className="text-xl font-black">
                        {globalStats.en.tries}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-orange-400 uppercase">
                        {t.accuracy}
                      </p>
                      <p className="text-xl font-black">
                        {globalStats.en.tries > 0
                          ? Math.round(
                              (globalStats.en.pass / globalStats.en.tries) *
                                100,
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
                    <div
                      className="cursor-pointer group/card"
                      onClick={() => setPreviewPack(pack)}
                    >
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
                      onClick={async () => {
                        const count = pack.card_data?.length || 0;
                        const ok = await showConfirm(
                          `Add "${pack.name}" (${count} words) to your deck? This can't be undone.`,
                          { title: "Add to Deck", confirmLabel: "Add" }
                        );
                        if (ok) importPack(pack);
                      }}
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

          {viewMode !== "none" && (
            /* 1. Backdrop Overlay */
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6"
              onClick={() => setViewMode("none")} // Click backdrop to close
            >
              {/* 2. Blurred background */}
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" />

              {/* 3. Modal Content Card */}
              <div
                className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the card
              >
                {/* Header - Fixed at top */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight flex items-center gap-3">
                      {viewMode === "mastered"
                        ? `🏆 ${t.mastered}`
                        : `🎯 ${t.struggling}`}
                      <span
                        className={`text-[10px] not-italic px-3 py-1 rounded-full font-black tracking-widest ${viewMode === "mastered" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}
                      >
                        {viewMode === "mastered"
                          ? masteredList.length
                          : strugglingList.length}{" "}
                        {t.words}
                      </span>
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {t.dismiss_hint}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewMode("none")}
                    className="h-12 w-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-90"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {/* Body - Scrollable Area */}
                <div className="p-8 overflow-y-auto custom-scrollbar bg-slate-50/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                    {(viewMode === "mastered"
                      ? masteredList
                      : strugglingList
                    ).map((word) => (
                      <div
                        key={word.id}
                        className="p-5 rounded-3xl border border-white bg-white shadow-sm flex justify-between items-center hover:shadow-md hover:scale-[1.01] transition-all group"
                      >
                        <div>
                          <p className="text-xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                            {word.japanese}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                            {word.reading} • {word.english}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-black ${viewMode === "mastered" ? "text-emerald-500" : "text-rose-500"}`}
                          >
                            {Math.round(
                              ((word.scores?.jp_to_en?.percent || 0) +
                                (word.scores?.en_to_jp?.percent || 0)) /
                                2,
                            )}
                            %
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer - Optional: Quick Action */}
                <div className="p-6 border-t border-slate-50 text-center bg-white">
                  <button
                    onClick={() => setViewMode("none")}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-600"
                  >
                    {t.return_to_dashboard}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* --- Celebration Modal --- */}
          {showCelebration && (() => {
            const msg = reviewsToday === 0
              ? { emoji: "📚", line1: "No reviews yet today,", line2: "let's change that!" }
              : reviewsToday >= 20
              ? { emoji: "🔥", line1: `${reviewsToday} words practiced`, line2: "You're on fire today!" }
              : { emoji: "🎉", line1: `${reviewsToday} ${reviewsToday === 1 ? "word" : "words"} practiced`, line2: "today — great work!" };
            return (
              <div className="fixed inset-0 z-[225] flex items-center justify-center p-4">
                {/* Confetti particles */}
                {CONFETTI_PARTICLES.map((c, i) => (
                  <motion.div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{
                      backgroundColor: c.color,
                      width: c.w,
                      height: c.h,
                      borderRadius: c.round ? "50%" : "2px",
                      left: `${c.left}%`,
                      top: -16,
                    }}
                    initial={{ y: -16, opacity: 1, rotate: 0 }}
                    animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0.6, 0], rotate: 400 }}
                    transition={{ duration: 2, delay: c.delay, ease: [0.2, 0.8, 0.6, 1] }}
                  />
                ))}
                {/* Backdrop */}
                <motion.div
                  className="absolute inset-0 bg-indigo-950/70 backdrop-blur-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => { setShowCelebration(false); setShowHistory(true); }}
                />
                {/* Card */}
                <motion.div
                  className="relative z-10 bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl overflow-hidden"
                  initial={{ scale: 0.6, opacity: 0, y: 30 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24, delay: 0.05 }}
                >
                  {/* Background glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/60 to-transparent pointer-events-none" />
                  {/* Emoji */}
                  <motion.div
                    className="text-6xl mb-5 select-none"
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
                  >
                    {msg.emoji}
                  </motion.div>
                  {/* Count */}
                  <motion.p
                    className="text-5xl font-black text-indigo-600 tracking-tight leading-none mb-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.35 }}
                  >
                    {msg.line1}
                  </motion.p>
                  <motion.p
                    className="text-base font-bold text-slate-500 mb-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.32, duration: 0.3 }}
                  >
                    {msg.line2}
                  </motion.p>
                  {/* CTA */}
                  <motion.button
                    onClick={() => { setShowCelebration(false); setShowHistory(true); }}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    See Full Progress →
                  </motion.button>
                </motion.div>
              </div>
            );
          })()}

          {/* --- Mastered Celebration Modal --- */}
          {showMasteredCelebration && (() => {
            const msg = masteredCount === 0
              ? { emoji: "🌱", line1: "No mastered cards yet", line2: "Keep studying — you'll get there!" }
              : masteredCount >= 10
              ? { emoji: "🌟", line1: `${masteredCount} cards mastered!`, line2: "That's incredible progress!" }
              : { emoji: "🏆", line1: `${masteredCount} ${masteredCount === 1 ? "card" : "cards"} mastered!`, line2: "Well done — keep it up!" };
            return (
              <div className="fixed inset-0 z-[225] flex items-center justify-center p-4">
                {CONFETTI_PARTICLES.map((c, i) => (
                  <motion.div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{ backgroundColor: c.color, width: c.w, height: c.h, borderRadius: c.round ? "50%" : "2px", left: `${c.left}%`, top: -16 }}
                    initial={{ y: -16, opacity: 1, rotate: 0 }}
                    animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0.6, 0], rotate: 400 }}
                    transition={{ duration: 2, delay: c.delay, ease: [0.2, 0.8, 0.6, 1] }}
                  />
                ))}
                <motion.div
                  className="absolute inset-0 bg-emerald-950/70 backdrop-blur-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => { setShowMasteredCelebration(false); setViewMode("mastered"); }}
                />
                <motion.div
                  className="relative z-10 bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl overflow-hidden"
                  initial={{ scale: 0.6, opacity: 0, y: 30 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24, delay: 0.05 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/60 to-transparent pointer-events-none" />
                  <motion.div
                    className="text-6xl mb-5 select-none"
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
                  >{msg.emoji}</motion.div>
                  <motion.p
                    className="text-4xl font-black text-emerald-600 tracking-tight leading-none mb-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.35 }}
                  >{msg.line1}</motion.p>
                  <motion.p
                    className="text-base font-bold text-slate-500 mb-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.32, duration: 0.3 }}
                  >{msg.line2}</motion.p>
                  <motion.button
                    onClick={() => { setShowMasteredCelebration(false); setViewMode("mastered"); }}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    whileTap={{ scale: 0.96 }}
                  >See Mastered Cards →</motion.button>
                </motion.div>
              </div>
            );
          })()}

          {/* --- Struggling Celebration Modal --- */}
          {showStrugglingCelebration && (() => {
            const msg = strugglingCount === 0
              ? { emoji: "🎯", line1: "Nothing holding you back!", line2: "Zero cards struggling — you're crushing it!" }
              : { emoji: "💪", line1: `${strugglingCount} ${strugglingCount === 1 ? "card" : "cards"} to level up`, line2: "You've got this — let's tackle them!" };
            return (
              <div className="fixed inset-0 z-[225] flex items-center justify-center p-4">
                {CONFETTI_PARTICLES.map((c, i) => (
                  <motion.div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{ backgroundColor: c.color, width: c.w, height: c.h, borderRadius: c.round ? "50%" : "2px", left: `${c.left}%`, top: -16 }}
                    initial={{ y: -16, opacity: 1, rotate: 0 }}
                    animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0.6, 0], rotate: 400 }}
                    transition={{ duration: 2, delay: c.delay, ease: [0.2, 0.8, 0.6, 1] }}
                  />
                ))}
                <motion.div
                  className="absolute inset-0 bg-violet-950/70 backdrop-blur-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => { setShowStrugglingCelebration(false); setViewMode("struggling"); }}
                />
                <motion.div
                  className="relative z-10 bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl overflow-hidden"
                  initial={{ scale: 0.6, opacity: 0, y: 30 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24, delay: 0.05 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-violet-50/60 to-transparent pointer-events-none" />
                  <motion.div
                    className="text-6xl mb-5 select-none"
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
                  >{msg.emoji}</motion.div>
                  <motion.p
                    className="text-4xl font-black text-violet-600 tracking-tight leading-none mb-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.35 }}
                  >{msg.line1}</motion.p>
                  <motion.p
                    className="text-base font-bold text-slate-500 mb-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.32, duration: 0.3 }}
                  >{msg.line2}</motion.p>
                  <motion.button
                    onClick={() => { setShowStrugglingCelebration(false); setViewMode("struggling"); }}
                    className="w-full bg-violet-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-all active:scale-95 shadow-lg shadow-violet-200"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    whileTap={{ scale: 0.96 }}
                  >See Cards to Level Up →</motion.button>
                </motion.div>
              </div>
            );
          })()}

          {/* --- Daily Activity Overlay --- */}
          {showHistory && (
            <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-300"
                onClick={() => setShowHistory(false)}
              />

              <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-slate-50 flex justify-between items-start bg-gradient-to-b from-slate-50/50 to-transparent">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                      <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">
                        {t.activity_log}
                      </h3>
                    </div>
                    {/* Tabs */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHistoryTab("flashcards")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "flashcards" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                      >
                        🃏 Flashcards
                      </button>
                      <button
                        onClick={() => setHistoryTab("quizzes")}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "quizzes" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                      >
                        📊 Quizzes
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="h-10 w-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:shadow-sm transition-all active:scale-90 shrink-0 ml-3"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-8 md:p-10 overflow-y-auto custom-scrollbar">
                  {historyTab === "flashcards" && (
                    <>
                      {/* The Visual Chart Area */}
                      <div className="relative bg-slate-50/50 rounded-[2.5rem] p-6 border border-slate-100 mb-8">
                        {/* Subtle Grid Lines Background */}
                        <div className="absolute inset-0 grid grid-rows-4 px-6 py-6 opacity-[0.03] pointer-events-none">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="border-t border-black w-full" />
                          ))}
                        </div>

                        <div className="relative flex items-end justify-between gap-1.5 md:gap-3 h-56">
                          {[...dailyHistory].reverse().map((day, i) => {
                            const maxCount = Math.max(
                              ...dailyHistory.map((d) => d.count),
                              1,
                            );
                            const heightPercentage = Math.max(
                              (day.count / maxCount) * 100,
                              4,
                            );
                            const isToday = i === dailyHistory.length - 1;

                            return (
                              <div
                                key={day.study_date}
                                className="flex-1 flex flex-col items-center group h-full justify-end"
                              >
                                <div className="relative w-full flex flex-col justify-end h-full">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 pointer-events-none z-10 shadow-xl">
                                    {day.count}{" "}
                                    <span className="text-slate-400 font-bold ml-0.5">
                                      pts
                                    </span>
                                  </div>

                                  <div
                                    style={{ height: `${heightPercentage}%` }}
                                    className={`w-full rounded-t-2xl transition-all duration-700 ease-out cursor-default
                            ${
                              isToday
                                ? "bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-lg shadow-indigo-100"
                                : "bg-slate-200 group-hover:bg-slate-300 group-hover:shadow-md"
                            }`}
                                  />
                                </div>
                                <div className="mt-4 flex flex-col items-center">
                                  <span
                                    className={`text-[8px] font-black uppercase tracking-tighter ${isToday ? "text-indigo-600" : "text-slate-400"}`}
                                  >
                                    {new Date(day.study_date).toLocaleDateString(
                                      "en-SG",
                                      { weekday: "short" },
                                    )}
                                  </span>
                                  <span className="text-[7px] font-bold text-slate-300 mt-0.5">
                                    {new Date(day.study_date).getDate()}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Stats Summary Cards */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 hover:border-indigo-100 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                </svg>
                              </div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {t.total}
                              </p>
                            </div>
                            <SparkLine values={[...dailyHistory].reverse().map((d) => d.count)} color="#6366f1" />
                          </div>
                          <p className="text-3xl font-black text-slate-800 tracking-tight">
                            {dailyHistory.reduce((acc, curr) => acc + curr.count, 0)}
                            <span className="text-[10px] font-bold text-slate-300 uppercase ml-2 tracking-widest">
                              {t.reviews}
                            </span>
                          </p>
                        </div>

                        <div className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 hover:border-emerald-100 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-500">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {t.average}
                              </p>
                            </div>
                            <SparkLine values={[...dailyHistory].reverse().map((d) => d.count)} color="#10b981" />
                          </div>
                          <p className="text-3xl font-black text-slate-800 tracking-tight">
                            {Math.round(dailyHistory.reduce((acc, curr) => acc + curr.count, 0) / (dailyHistory.length || 1))}
                            <span className="text-[10px] font-bold text-slate-300 uppercase ml-2 tracking-widest">
                              {t.daily}
                            </span>
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {historyTab === "quizzes" && (
                    <div>
                      {/* Sparkline summary tiles */}
                      {(() => {
                        const vocabVals = [...dailyHistory].reverse().map((d) => d.count);
                        const readVals = [...quizHistory].reverse().map((d) => d.reading);
                        const listenVals = [...quizHistory].reverse().map((d) => d.listening);
                        const grammarVals = [...quizHistory].reverse().map((d) => d.grammar);
                        const tiles = [
                          { key: "vocab",   label: "🃏 Vocab",   color: "#6366f1", values: vocabVals,   today: dailyHistory[0]?.count ?? 0,      unit: "" },
                          { key: "read",    label: "📖 Read",    color: "#4f46e5", values: readVals,    today: quizHistory[0]?.reading,           unit: "%" },
                          { key: "listen",  label: "🎧 Listen",  color: "#7c3aed", values: listenVals,  today: quizHistory[0]?.listening,         unit: "%" },
                          { key: "grammar", label: "📝 Grammar", color: "#d97706", values: grammarVals, today: quizHistory[0]?.grammar,           unit: "%" },
                        ];
                        return (
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            {tiles.map((tile) => (
                              <div key={tile.key} className="bg-white rounded-2xl border border-slate-100 px-3 pt-3 pb-2.5 flex flex-col gap-1">
                                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: tile.color }}>{tile.label}</p>
                                <SparkLine values={tile.values} color={tile.color} />
                                <p className="text-sm font-black text-slate-700 leading-none">
                                  {tile.today !== null && tile.today !== undefined
                                    ? <>{tile.today}{tile.unit}</>
                                    : <span className="text-slate-300 text-xs font-bold">—</span>}
                                  {tile.unit === "" && <span className="text-[9px] font-bold text-slate-300 ml-1">today</span>}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                        Last 7 Days
                      </p>
                      {/* Column headers */}
                      <div className="flex items-center gap-3 mb-1 px-2">
                        <span className="w-20 shrink-0" />
                        <span className="flex-1 text-center text-[10px] font-black text-indigo-400">📖</span>
                        <span className="flex-1 text-center text-[10px] font-black text-violet-400">🎧</span>
                        <span className="flex-1 text-center text-[10px] font-black text-amber-400">📝</span>
                      </div>
                      {/* Rows */}
                      <div className="space-y-0.5">
                        {quizHistory.slice(0, 7).map((row, i) => {
                          const isToday = i === 0;
                          const dot = (pct: number | null) => {
                            if (pct === null) return <span className="text-slate-200 text-lg leading-none">·</span>;
                            const color = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400";
                            return (
                              <span className={`text-base leading-none ${color}`} title={`${pct}%`}>●</span>
                            );
                          };
                          return (
                            <div
                              key={row.study_date}
                              className={`flex items-center gap-3 py-2 px-2 rounded-xl ${isToday ? "bg-indigo-50" : ""}`}
                            >
                              <div className="w-20 shrink-0 flex items-center gap-1.5">
                                <span className={`text-[10px] font-black ${isToday ? "text-indigo-600" : "text-slate-500"}`}>
                                  {new Date(row.study_date + "T00:00:00").toLocaleDateString("en-SG", { month: "short", day: "numeric" })}
                                </span>
                                {isToday && <span className="text-[8px] font-black text-indigo-300 uppercase tracking-widest">now</span>}
                              </div>
                              <span className="flex-1 flex justify-center">{dot(row.reading)}</span>
                              <span className="flex-1 flex justify-center">{dot(row.listening)}</span>
                              <span className="flex-1 flex justify-center">{dot(row.grammar)}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 mt-5 px-2">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Key</span>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className="text-emerald-400">●</span> ≥80%</span>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className="text-amber-400">●</span> ≥60%</span>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className="text-rose-400">●</span> &lt;60%</span>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className="text-slate-200 text-sm">·</span> none</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-slate-50/50 text-center mt-auto border-t border-slate-50">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] opacity-60">
                    {t.motto_focus} • {t.motto_consistency} • {t.motto_mastery}
                  </p>
                </div>
              </div>
            </div>
          )}


          {/* --- Starter Pack Preview Overlay --- */}
          {previewPack && (
            <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-300"
                onClick={() => setPreviewPack(null)}
              />

              <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                {/* Header (Matching your Activity Log style) */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-end bg-gradient-to-b from-slate-50/50 to-transparent">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                        {previewPack.icon || "📦"}
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">
                        {previewPack.name}
                      </h3>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                      {previewPack.card_data?.length} {t.cards} •{" "}
                      {t.starter_collections}
                    </p>
                  </div>
                  <button
                    onClick={() => setPreviewPack(null)}
                    className="h-12 w-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:shadow-sm transition-all active:scale-90"
                  >
                    ✕
                  </button>
                </div>

                {/* Content Area: Card List */}
                <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-50/30">
                  {/* Description Card */}
                  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 mb-6 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Description
                    </p>
                    <p className="text-slate-600 text-sm leading-relaxed font-medium">
                      {previewPack.description || "A curated starter collection."}
                    </p>
                  </div>

                  {/* The "Contents" Grid */}
                  <div className="grid grid-cols-1 gap-3">
                    {previewPack.card_data?.map((card: any, idx: number) => (
                      <div
                        key={idx}
                        className="group bg-white p-5 rounded-[2rem] border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all flex items-center justify-between"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-xl font-black text-slate-800 tracking-tight">
                            {card.japanese}
                          </span>
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                            {card.reading}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="inline-block bg-slate-50 px-4 py-2 rounded-xl text-xs font-black text-slate-500 border border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-colors">
                            {card.english}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtle Bottom Branding */}
                <div className="pb-6 bg-white text-center">
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] opacity-60">
                    {"Mastery Awaits"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {triage && user && (
            <KnownWordsTriage
              userId={user.id}
              packName={triage.packName}
              cards={triage.cards}
              onDone={() => setTriage(null)}
            />
          )}

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

          {/* Card list skeleton while full content loads */}
          {cardsLoading && cards.length === 0 && (
            <div className="space-y-3 mb-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white rounded-[2rem] border border-slate-100 p-6 animate-pulse">
                  <div className="h-5 bg-slate-100 rounded-full w-1/3 mb-3" />
                  <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* List Views (Mobile & Desktop) */}
          <div className="md:hidden space-y-4">
            {visibleCards.map((card) => {
              const isNew =
                new Date().getTime() -
                  new Date(card.added_to_deck_at ?? 0).getTime() <
                86400000;

              return (
                <div
                  key={card.id}
                  className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden"
                >
                  {/* ACTION BUTTONS (Top Right) */}
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
                    {/* Flex container to keep Japanese and Badge together */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div className="text-2xl font-black text-slate-800 leading-none">
                        {card.japanese}
                      </div>

                      {/* 2. NEW BADGE (Indigo + White for a clean tech look) */}
                      {isNew && (
                        <span className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm border border-indigo-400/20">
                          New
                        </span>
                      )}
                    </div>

                    {card.partOfSpeech && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}
                      >
                        {card.partOfSpeech}
                      </span>
                    )}
                    {card.jlpt_level && (
                      <span
                        className={`ml-1.5 text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getJlptColor(card.jlpt_level)}`}
                      >
                        {card.jlpt_level}
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
              );
            })}
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
                {visibleCards.map((card) => {
                  // 1. Logic: Is this card less than 24 hours old?
                  const isNew =
                    new Date().getTime() -
                      new Date(card.added_to_deck_at ?? 0).getTime() <
                    86400000;

                  return (
                    <tr
                      key={card.id}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-lg text-slate-800">
                            {card.japanese}
                          </div>

                          {/* 2. NEW BADGE for Table Row */}
                          {isNew && (
                            <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                              New
                            </span>
                          )}
                        </div>

                        {card.partOfSpeech && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}
                          >
                            {card.partOfSpeech}
                          </span>
                        )}
                        {card.jlpt_level && (
                          <span
                            className={`ml-1.5 text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getJlptColor(card.jlpt_level)}`}
                          >
                            {card.jlpt_level}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCards.length > displayLimit && (
            <div className="mt-8 mb-12 flex justify-center">
              <button
                onClick={() => setDisplayLimit((prev) => prev + 200)}
                className="bg-white border border-slate-200 px-8 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50"
              >
                {t.load_more} ({filteredCards.length - displayLimit}{" "}
                {t.remaining})
              </button>
            </div>
          )}
        </div>

        {/* ── Add Cards FAB ── */}
        <motion.button
          onClick={() => { setShowAddSheet(true); setAddSheetTab("word"); }}
          whileTap={{ scale: 0.88 }}
          className="fixed bottom-24 right-5 z-[205] w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-300/50 flex items-center justify-center"
        >
          <Plus size={26} strokeWidth={2.5} />
          {pendingWords.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingWords.length}
            </span>
          )}
        </motion.button>

        {/* ── Add Cards Bottom Sheet ── */}
        {showAddSheet && (
          <div className="fixed inset-0 z-[250] flex flex-col justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => { flushWordList(wordListText.split("\n").map(w => w.trim()).filter(Boolean)); setShowAddSheet(false); }}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              className="relative bg-white rounded-t-[2rem] shadow-2xl flex flex-col max-h-[85dvh]"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* Tab bar */}
              <div className="flex items-center gap-1 px-5 pt-2 pb-3 border-b border-slate-100">
                {(["word", "paste", "queue"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAddSheetTab(tab)}
                    className={`relative flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${addSheetTab === tab ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {tab === "word" && "Word"}
                    {tab === "paste" && "Paste"}
                    {tab === "queue" && "Queue"}
                    {tab === "queue" && pendingWords.length > 0 && (
                      <span className={`absolute -top-1.5 -right-1 text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center ${addSheetTab === "queue" ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"}`}>
                        {pendingWords.length}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => { flushWordList(wordListText.split("\n").map(w => w.trim()).filter(Boolean)); setShowAddSheet(false); }}
                  className="ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-5">

                {/* WORD TAB */}
                {addSheetTab === "word" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Japanese or English word</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && input.trim()) {
                              processWords(input.split("\n").filter(l => l.trim()));
                            }
                          }}
                          placeholder="食べる / taberu / to eat…"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => { if (!input.trim()) return; processWords(input.split("\n").filter(l => l.trim())); }}
                      disabled={loading || !input.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      {loading ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Plus size={16} /> Add to Deck</>}
                    </button>
                    <p className="text-center text-[10px] text-slate-400 font-bold">AI generates the card — reading, meaning, JLPT level</p>
                  </div>
                )}

                {/* PASTE TAB */}
                {addSheetTab === "paste" && (() => {
                  const lines = batchInput.trim().split("\n").filter(Boolean);
                  const hasJp = /[぀-ヿ一-龯]/.test(batchInput);
                  const avgLen = batchInput.length / Math.max(lines.length, 1);
                  let hint: { label: string; emoji: string } | null = null;
                  if (batchInput.trim()) {
                    if (lines.length === 1) hint = { emoji: "🔤", label: "Single word" };
                    else if (hasJp && avgLen > 15) hint = { emoji: "🎵", label: "Japanese text — AI extracts vocabulary" };
                    else if (hasJp) hint = { emoji: "📋", label: "Japanese word list" };
                    else if (avgLen > 20) hint = { emoji: "📖", label: "English text (Japanese input works best)" };
                    else hint = { emoji: "📋", label: "English word list — one per line" };
                  }
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Paste lyrics, a story, or a word list</p>
                        {hint && (
                          <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {hint.emoji} {hint.label}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={batchInput}
                        onChange={(e) => setBatchInput(e.target.value)}
                        rows={9}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                        placeholder={"食べる\n勉強する\n\nor paste a full song / article in Japanese…"}
                      />
                      <button
                        onClick={async () => {
                          setShowAddSheet(false);
                          setBatchProcessing(true);
                          setUploadBusy(true);
                          try { await processWords([batchInput]); }
                          finally { setBatchProcessing(false); setUploadBusy(false); }
                        }}
                        disabled={loading || !batchInput.trim()}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                      >
                        {loading ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Plus size={16} /> Extract &amp; Add</>}
                      </button>
                    </div>
                  );
                })()}

                {/* QUEUE TAB */}
                {addSheetTab === "queue" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{pendingWords.length} word{pendingWords.length !== 1 ? "s" : ""} queued · one per line</p>
                      <button onClick={() => { flushWordList([]); setWordListText(""); }} className="text-[10px] font-black text-rose-400 hover:text-rose-500 uppercase tracking-widest">Clear all</button>
                    </div>
                    <textarea
                      value={wordListText}
                      onChange={(e) => setWordListText(e.target.value)}
                      onBlur={(e) => syncWordList(e.target.value.split("\n").map(w => w.trim()).filter(Boolean))}
                      rows={10}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                      placeholder={"食べる\n勉強\n彼女\n…"}
                    />
                    <button
                      onClick={() => addWordListToDeck(wordListText.split("\n").map(w => w.trim()).filter(Boolean))}
                      disabled={wordListAdding || !wordListText.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      {wordListAdding ? <><Loader2 size={16} className="animate-spin" /> Adding…</> : <><Plus size={16} /> Add All to Deck</>}
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}

        {/* Batch processing overlay — sheet closes immediately, this shows while AI works */}
        {batchProcessing && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
              <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Processing…</p>
            </div>
          </div>
        )}

        {showSummaryOverlay && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-3 bg-slate-50/50">
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                    {t.words_added}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex flex-wrap gap-x-1">
                    <span>{addedWordsSummary.filter(w => !w.alreadyInDeck).length} new</span>
                    {addedWordsSummary.some(w => w.alreadyInDeck) && (
                      <span className="text-teal-500 whitespace-nowrap">· {addedWordsSummary.filter(w => w.alreadyInDeck).length} already in deck</span>
                    )}
                  </p>

                  {/* NEW: Conditional Limit Badge */}
                  {addedWordsSummary.length >= 50 && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black border border-amber-200 animate-pulse">
                      {t.limit_notice}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowSummaryOverlay(false)}
                  className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400"
                >
                  ✕
                </button>
              </div>

              {/* List content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {addedWordsSummary.map((word, i) => (
                  <div
                    key={i}
                    className={`group p-4 rounded-2xl border shadow-sm flex items-start gap-4 transition-all ${word.alreadyInDeck ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-100 hover:border-indigo-100"}`}
                  >
                    {/* 1. LEFT: KANJI AVATAR */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm ${word.alreadyInDeck ? "bg-slate-100 border-slate-200" : "bg-indigo-50 border-indigo-100"}`}>
                      <span className={`font-black text-xl ${word.alreadyInDeck ? "text-slate-400" : "text-indigo-600"}`}>
                        {word.japanese[0]}
                      </span>
                    </div>

                    {/* 2. CENTER: Content Info */}
                    <div className="flex-1 min-w-0 flex flex-col text-left">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-black text-slate-800 truncate">
                          {word.japanese}
                        </span>
                        <span className="text-xs font-bold text-rose-500 uppercase tracking-tighter shrink-0 whitespace-nowrap">
                          {word.reading}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 font-medium mt-0.5 leading-tight pr-8 truncate">
                        {word.english}
                      </p>

                      {/* Meta Tags */}
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                          {word.partOfSpeech}
                        </span>
                        {word.alreadyInDeck && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                            Already in deck
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. TOP RIGHT: THE DELETE BUTTON (Trash Can Style) */}
                    <div className="flex-shrink-0 -mt-1 -mr-1">
                      <button
                        onClick={() => deleteCard(word.id, true)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
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
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => setShowSummaryOverlay(false)}
                  className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg"
                >
                  {t.got_it}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[220] flex flex-col items-center justify-center text-white">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-lg font-bold animate-pulse">{t.ai_building}</p>
          </div>
        )}

      </main>
    </div>
  );
}
function StatCard({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  const controls = useAnimationControls();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      controls.start({
        x: [-8, 8, -6, 6, -3, 3, 0],
        transition: { duration: 0.4, ease: "easeInOut" },
      });
    }
  };

  return (
    <motion.div
      animate={controls}
      onClick={handleClick}
      className={`bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center transition-all cursor-pointer ${
        onClick
          ? "hover:border-slate-300 hover:scale-[1.02] active:scale-95"
          : "active:scale-95"
      }`}
    >
      <div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-tighter">
          {label}
        </p>
        <p className="text-4xl font-black text-slate-800">{value || 0}</p>
      </div>

      {/* Visual Icon Box */}
      <div
        className={`w-12 h-12 rounded-2xl ${color} opacity-20 flex items-center justify-center`}
      >
        {onClick && (
          <span
            className={`text-xl font-black ${color.replace("bg-", "text-")} opacity-100`}
          >
            →
          </span>
        )}
      </div>
    </motion.div>
  );
}
