"use client";
import { useEffect, useState, useMemo, useRef } from "react";
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
import LoadingScreen from "@/components/LoadingScreen";
import KnownWordsTriage, { TriageCard } from "@/components/KnownWordsTriage";
import AddWordsSheet from "@/components/AddWordsSheet";
import DuplicatesSheet from "@/components/DuplicatesSheet";
import { findDuplicates, skipDeckDuplicates } from "@/lib/duplicates";
import { AlertTriangle, Ban, BarChart3, BookOpen, ChevronLeft, Flag, Gamepad2, Gift, Headphones, ImageIcon, Layers, List, Lock, MessageSquare, PenTool, Plus, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Star, Target, TrendingDown, TrendingUp, Trophy, Volume2, X } from "lucide-react";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { normalizeEnglish, stripParens, normalizePartOfSpeech } from "@/lib/textNormalize";

interface StatsCardsCache { userId: string; cards: FlashcardData[]; deckId: string; quickStats: QuickStats | null; }
// In-memory — survives in-app navigation back to this tab, but a real page reload
// (pull-to-refresh, browser refresh, the app being relaunched) wipes it, since that
// resets the whole JS runtime.
let _statsCardsCache: StatsCardsCache | null = null;

// Persisted — survives real reloads too. Convenience only (stale-while-revalidate: shown
// instantly, then silently replaced once fetchCards' real network call lands), so every
// access is guarded; a failure here (quota exceeded, private browsing) just means the
// page falls back to its normal cold-load behavior.
const cardsCacheKey = (userId: string) => `flashkado-cards-cache-${userId}`;
function loadPersistedCardsCache(userId: string): StatsCardsCache | null {
  try {
    const raw = localStorage.getItem(cardsCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}
function savePersistedCardsCache(cache: StatsCardsCache) {
  try {
    localStorage.setItem(cardsCacheKey(cache.userId), JSON.stringify(cache));
  } catch {
    // ignore — quota exceeded, private browsing, storage disabled, etc.
  }
}

// Keep in sync with StudyView.tsx's rolling priority cap.
const PRIORITY_CAP = 30;

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
    if (totalAttempts > 0 && Math.max(jp.percent ?? 0, en.percent ?? 0) < 40) struggling++;
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
  const { showAlert, showConfirm, showPrompt } = useAppAlert();
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState("Main Deck");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [starterPacks, setStarterPacks] = useState<any[]>([]);
  const [ownedPacks, setOwnedPacks] = useState<string[]>([]);
  const [triage, setTriage] = useState<{ packName: string; cards: TriageCard[] } | null>(null);
  const [swipeOnly, setSwipeOnly] = useState(false);
  const [reflexMode, setReflexMode] = useState(false);
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
  // Tapped card's JP→EN/EN→JP detail — shown in a small modal instead of inline, so the
  // collapsed list card stays compact.
  const [scoreDetailCard, setScoreDetailCard] = useState<FlashcardData | null>(null);
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
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [pendingWordCount, setPendingWordCount] = useState(0);
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

      // Signing out still needs to drop the loading gate (nothing left to wait for);
      // otherwise leave it to initData/fetchCards below, once there's real data to show
      // instead of revealing the page with every stat still at its zero default.
      if (!session) setInitLoading(false);

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
          // Cache hit (in-memory, else the persisted fallback): populate cards instantly
          // so the page renders without waiting for the big fetch. fetchCards still runs
          // below once defaultDeckId is set — on purpose, to revalidate this snapshot in
          // the background rather than trusting it for the rest of the session.
          const cached = (_statsCardsCache?.userId === user.id ? _statsCardsCache : null) ?? loadPersistedCardsCache(user.id);
          if (cached) {
            setCards(cached.cards);
            setDefaultDeckId(cached.deckId);
            if (cached.quickStats) setQuickStats(cached.quickStats);
            setInitLoading(false);
          }

          const [, deckId] = await Promise.all([
            fetchProfile(),
            fetchDefaultDeck(),
            fetchStarterPacks(),
          ]);
          // Nothing to wait for (no deck → fetchCards never runs) — reveal now. Otherwise
          // leave the gate to fetchCards's own first-page handler, so the page doesn't
          // show every stat at zero before the real numbers land.
          if (!cached && !deckId) setInitLoading(false);
        } catch (error) {
          console.error("Error loading stats:", error);
          setInitLoading(false);
        }
      }
    };

    initData();
  }, [user]);

  // 2. ONLY fetch cards once we have a valid Deck ID — runs even after a cache hit above,
  // to revalidate that snapshot in the background (stale-while-revalidate).
  useEffect(() => {
    if (!user || !defaultDeckId) return;
    fetchCards();
  }, [user, defaultDeckId]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "full_name, avatar_url, streak_count, max_streak, blocked_words, auto_play_jp, auto_play_en, sfx_enabled, swipe_only, reflex_mode, imported_packs, is_admin, is_premium, referral_code, stats_visible_to_friends",
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
      setReflexMode(data.reflex_mode ?? false);
      setOwnedPacks(data.imported_packs);
      setIsAdmin(data.is_admin);
      setIsPremium(data.is_premium ?? false);
      setProfileName(data.full_name);
      setAvatarUrl(data.avatar_url ?? null);
      setReferralCode(data.referral_code ?? null);
      setStatsVisible(data.stats_visible_to_friends ?? true);
    }
  };

  // Returns the deck id (or null if the user has none) so the caller can tell whether
  // there's a card fetch to wait for before revealing the page.
  const fetchDefaultDeck = async (): Promise<string | null> => {
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
      return data.id;
    }
    return null;
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

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error signing out:", error.message);
    // Optional: window.location.href = "/"; // Force redirect to home
  };

  const handleReport = async (cardId: string, currentMeaning: string) => {
    const suggestion = await showPrompt(t.report_placeholder, { title: "Report a card" });

    if (!suggestion) return;

    const { error } = await supabase.from("card_reports").insert({
      card_id: cardId,
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

  const fetchCards = async () => {
    if (!user || !defaultDeckId) return;

    setCardsLoading(true);
    try {
      // One paginated fetch of full card data — this used to be two full passes over the
      // same deck (a lean scores-only pass just to show stat numbers fast, then a full
      // pass for the card list), which doubled the requests and data transferred for no
      // real benefit: the full rows already carry scores_json too. Stats are set once
      // after every page has landed (not per-page) — updating them as each page arrived
      // made the numbers visibly count up page by page (0 → 1000 → 2000 → 2900) instead
      // of just appearing once, correct.
      const allData: any[] = [];
      let error = null;
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page, error: pageErr } = await supabase
          .from("master_cards")
          .select(`*, deck_cards!inner(deck_id, added_at), user_scores(scores_json, is_priority, prioritized_at)`)
          .eq("deck_cards.deck_id", defaultDeckId)
          .eq("user_scores.user_id", user.id)
          .order("added_at", { foreignTable: "deck_cards", ascending: false })
          // Tiebreaker for cards added in the same batch (identical added_at) — without
          // a unique secondary key, .range() pagination can skip or duplicate rows among
          // ties once the deck crosses one page.
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (pageErr) { error = pageErr; break; }
        if (page) allData.push(...page);
        if (!page || page.length < PAGE_SIZE) break;
      }

      if (error) { console.error("Fetch Error:", (error as any).message); return; }

      const freshQuickStats = allData.length ? computeQuickStats(allData) : null;
      if (freshQuickStats) setQuickStats(freshQuickStats);

      const flattened = allData.map((card: any) => ({
        ...card,
        added_to_deck_at: card.deck_cards?.[0]?.added_at,
        scores: card.user_scores?.[0]?.scores_json || {
          jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
          en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
        },
        is_priority: card.user_scores?.[0]?.is_priority || false,
        prioritized_at: card.user_scores?.[0]?.prioritized_at || null,
      }));

      setCards(flattened);
      if (user && defaultDeckId) {
        const freshCache: StatsCardsCache = { userId: user.id, cards: flattened, deckId: defaultDeckId, quickStats: freshQuickStats };
        _statsCardsCache = freshCache;
        savePersistedCardsCache(freshCache);
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

  const deleteCard = async (id: string) => {
    if (!(await showConfirm("Remove this card from your collection?"))) return;

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

    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  // Rolling cap: starring a 31st word bumps whichever one has been starred longest,
  // same rule as the Study tab's star toggle (they share the same user_scores columns).
  const toggleCardPriority = async (card: FlashcardData) => {
    if (!user) return;
    const turningOn = !card.is_priority;
    let demotedId: string | null = null;

    if (turningOn) {
      const current = cards.filter((c) => c.is_priority);
      if (current.length >= PRIORITY_CAP) {
        const oldest = [...current].sort((a, b) =>
          (a.prioritized_at || "").localeCompare(b.prioritized_at || ""),
        )[0];
        if (oldest) {
          demotedId = oldest.id;
          await supabase.from("user_scores")
            .update({ is_priority: false, prioritized_at: null })
            .eq("user_id", user.id).eq("card_id", oldest.id);
        }
      }
    }

    const prioritized_at = turningOn ? new Date().toISOString() : null;
    await supabase.from("user_scores")
      .update({ is_priority: turningOn, prioritized_at })
      .eq("user_id", user.id).eq("card_id", card.id);

    setCards((prev) => prev.map((c) => {
      if (c.id === card.id) return { ...c, is_priority: turningOn, prioritized_at };
      if (demotedId && c.id === demotedId) return { ...c, is_priority: false, prioritized_at: null };
      return c;
    }));
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
  const duplicates = useMemo(() => findDuplicates(cards), [cards]);

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
      // Best direction, not the average — same philosophy as Mastered (either direction
      // clearing the bar counts), so a card doing fine in one direction isn't dragged
      // into Struggling by a weak, possibly-untried, other direction.
      const bestAccuracy = Math.max(s?.jp_to_en?.percent || 0, s?.en_to_jp?.percent || 0);

      return totalAttempts > 0 && bestAccuracy < 40;
    });
  }, [cards]);

  // Per-card version of the same two rules above, for the compact list card's tag.
  const cardScoreStatus = (card: FlashcardData): "mastered" | "struggling" | null => {
    const s = card.scores;
    const jpMastered = (s?.jp_to_en?.pass || 0) >= 5 && (s?.jp_to_en?.percent || 0) >= 70;
    const enMastered = (s?.en_to_jp?.pass || 0) >= 5 && (s?.en_to_jp?.percent || 0) >= 70;
    if (jpMastered || enMastered) return "mastered";
    const totalAttempts = (s?.jp_to_en?.total || 0) + (s?.en_to_jp?.total || 0);
    const bestAccuracy = Math.max(s?.jp_to_en?.percent || 0, s?.en_to_jp?.percent || 0);
    if (totalAttempts > 0 && bestAccuracy < 40) return "struggling";
    return null;
  };

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

  // Keeps big tries counts (19,095 reviews deep into a word) from blowing out
  // the fixed-width stat tiles — "19.1K" reads fine at the same size "19095" doesn't.
  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  };

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
      case "N4": return "bg-sky-100 text-sky-700 border-sky-200";
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
      if (column === "reflex_mode") setReflexMode(value);
      if (column === "stats_visible_to_friends") setStatsVisible(value);
    } else {
      console.error("Error updating setting:", error.message);
    }
  };

  // Words in a pack that aren't in the deck yet — for packs that gained words after you
  // imported them. A kana word counts as present when its kanji card is in the deck.
  const deckForms = useMemo(() => {
    const forms = new Set<string>();
    for (const c of cards) { forms.add(c.japanese); if (c.japanese !== c.reading) forms.add(c.reading); }
    return forms;
  }, [cards]);
  type PackWord = Record<string, unknown> & { japanese: string };
  const packWordsMissing = (pack: { card_data?: PackWord[] }): PackWord[] =>
    cards.length === 0 ? [] : (pack.card_data ?? []).filter((w) => !deckForms.has(w.japanese));

  const importPack = async (pack: any, opts?: { silent?: boolean }) => {
    if (!defaultDeckId) {
      showAlert(
        "Deck ID is missing. Still loading your profile... please try again in 1 second.",
      );
      fetchDecks(); // Manually trigger a refresh
      return;
    }

    if (!user || !defaultDeckId) return;

    // 1. An owned pack is only re-imported for words added to it since (packWordsMissing)
    const isUpdate = !!ownedPacks?.includes(pack.id);
    const nWords: PackWord[] = isUpdate ? packWordsMissing(pack) : pack.card_data;
    if (nWords.length === 0) return;

    setLoading(true);
    try {

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

      // Leave out the pack's duplicates of cards already in the deck (みず when 水 is
      // there, 私は when 私 is) — lib/duplicates
      const packCards = [...existingByJapanese.values(), ...insertedCards];
      const { ids: linkIds } = await skipDeckDuplicates(defaultDeckId, packCards.map((c) => c.id));
      const linkSet = new Set(linkIds);
      const uploadedCards = packCards.filter((c) => linkSet.has(c.id));
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
      const updatedPacks = isUpdate ? ownedPacks : [...(ownedPacks || []), pack.id];

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ imported_packs: updatedPacks })
        .eq("id", user.id);

      if (pErr) throw pErr;

      // 5. Update local state
      setOwnedPacks(updatedPacks);
      fetchCards();
      if (!opts?.silent) {
        setTriage({ packName: pack.name, cards: uploadedCards.map((c) => ({ id: c.id, japanese: c.japanese, english: c.english })) });
      }
    } catch (error: any) {
      console.error(error);
      showAlert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // A starter pack you already own can still gain words later (content fixes, pack
  // growth). Sync those in automatically instead of making you notice and click an
  // "Add new words" button — a brand-new import already gets the pack's full current
  // word list, so this only ever applies to packs you'd already added.
  const autoSyncedPacksRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ownedPacks || cards.length === 0 || starterPacks.length === 0) return;
    for (const pack of starterPacks) {
      if (!ownedPacks.includes(pack.id)) continue;
      if (autoSyncedPacksRef.current.has(pack.id)) continue;
      if (packWordsMissing(pack).length === 0) continue;
      autoSyncedPacksRef.current.add(pack.id);
      importPack(pack, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedPacks, cards, starterPacks]);

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
                    <Sparkles size={10} /> Premium
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 font-black text-slate-600 transition-all active:scale-95 h-10 uppercase tracking-widest text-[10px]"
            >
              <SettingsIcon size={14} /> {t.settings}
            </button>
          </div>
        </div>
      </header>
      <main className="min-h-screen bg-slate-50 px-8 pb-8 pt-12">
        <div className="max-w-5xl mx-auto">

          {/* Settings — full-screen overlay, same pattern as the quiz components */}
          {showSettings && (
            <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-white shrink-0">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
                >
                  <ChevronLeft size={14} />
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
                  <ImageIcon size={15} className="text-slate-400" /> Avatar
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
                  <Gift size={15} className="text-slate-400" /> Invite Friends
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
                  <Lock size={15} className="text-slate-400" /> {t.account_security || "Account Security"}
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
                      <RefreshCw size={13} /> {t.change_btn || "Change"}
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
                  <AlertTriangle size={12} /> {t.danger_zone}
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
                  <Volume2 size={15} className="text-slate-400" /> {t.audio_prefs}
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

                  {/* Reflex Mode Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        Reflex Mode
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">
                        Auto-fails a card if you don&apos;t grade it within 3 seconds
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("reflex_mode", !reflexMode)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${reflexMode ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${reflexMode ? "left-7" : "left-1"}`}
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
                  <Ban size={15} className="text-slate-400" /> {t.word_filters}
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
                  <MessageSquare size={15} className="text-slate-400" /> {t.feedback_title}
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

              {/* ===== GROUP: ADMIN (admin-only) ===== */}
              {isAdmin && (
                <>
                  <div className="flex items-center gap-2.5 mb-6 mt-16">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Admin</h2>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <Link
                      href="/admin"
                      className="flex-1 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Flag size={14} /> {t.admin_title}
                    </Link>
                    <Link
                      href="/admin/users"
                      className="flex-1 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-lg font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <BarChart3 size={14} /> {t.admin_user_stats}
                    </Link>
                  </div>
                </>
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
                    <X size={13} />
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
                  <Gamepad2 size={17} /> {t.mini_games}
                </Link>

              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8">
            <StatCard
              label={t.vocabulary}
              value={totalCards}
              bgColor="bg-indigo-50"
              iconColor="text-indigo-500"
              icon={BookOpen}
            />
            <StatCard
              label={t.mastered}
              value={masteredCount}
              bgColor="bg-emerald-50"
              iconColor="text-emerald-500"
              icon={Trophy}
              onClick={() => setShowMasteredCelebration(true)}
            />
            <StatCard
              label={t.struggling}
              value={strugglingCount}
              bgColor="bg-rose-50"
              iconColor="text-rose-500"
              icon={TrendingDown}
              onClick={() => setShowStrugglingCelebration(true)}
            />

            <StatCard
              label={t.daily_progress}
              value={reviewsToday}
              bgColor="bg-amber-50"
              iconColor="text-amber-500"
              icon={Target}
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
                        {formatCount(globalStats.jp.tries)}
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
                        {formatCount(globalStats.jp.pass)}
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
                        {formatCount(globalStats.en.tries)}
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
                        {formatCount(globalStats.en.pass)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Advanced Stats — separate page, all live-computed (no AI except the
              admin-only Analyze button inside it). */}
          <div className="mb-10">
            <Link
              href="/stats/insights"
              className="w-full flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 font-black text-slate-700 hover:bg-slate-50 transition-all active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-sm">
                <TrendingUp size={16} className="text-slate-400" /> Advanced Stats
              </span>
              <span className="text-slate-400 text-xs">View →</span>
            </Link>
          </div>

          {/* Starter Packs Section — hidden once every pack has been added, so it's not
              permanent real estate for users with nothing left to add. */}
          {starterPacks.some((pack) => !ownedPacks?.includes(pack.id) || packWordsMissing(pack).length > 0) && (
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

                    {/* Bottom Section: Action — words added to a pack after you already own
                        it sync in automatically (see the auto-sync effect below), so an
                        owned pack never needs a manual "add new words" step here. */}
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
            </div>
          </div>
          )}

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
                      {viewMode === "mastered" ? <Trophy size={20} className="text-emerald-500" /> : <TrendingDown size={20} className="text-rose-500" />}
                      {viewMode === "mastered" ? t.mastered : t.struggling}
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "flashcards" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                      >
                        <Layers size={11} /> Flashcards
                      </button>
                      <button
                        onClick={() => setHistoryTab("quizzes")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "quizzes" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                      >
                        <BarChart3 size={11} /> Quizzes
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="h-10 w-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:shadow-sm transition-all active:scale-90 shrink-0 ml-3"
                  >
                    <X size={16} />
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
                          { key: "vocab",   label: "Vocab",   icon: Layers,      color: "#6366f1", values: vocabVals,   today: dailyHistory[0]?.count ?? 0,      unit: "" },
                          { key: "read",    label: "Read",    icon: BookOpen,    color: "#4f46e5", values: readVals,    today: quizHistory[0]?.reading,           unit: "%" },
                          { key: "listen",  label: "Listen",  icon: Headphones,  color: "#7c3aed", values: listenVals,  today: quizHistory[0]?.listening,         unit: "%" },
                          { key: "grammar", label: "Grammar", icon: PenTool,     color: "#d97706", values: grammarVals, today: quizHistory[0]?.grammar,           unit: "%" },
                        ];
                        return (
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            {tiles.map((tile) => (
                              <div key={tile.key} className="bg-white rounded-2xl border border-slate-100 px-3 pt-3 pb-2.5 flex flex-col gap-1">
                                <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: tile.color }}>
                                  <tile.icon size={10} /> {tile.label}
                                </p>
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
                        <span className="flex-1 flex justify-center text-indigo-400"><BookOpen size={12} /></span>
                        <span className="flex-1 flex justify-center text-violet-400"><Headphones size={12} /></span>
                        <span className="flex-1 flex justify-center text-amber-400"><PenTool size={12} /></span>
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
                    <X size={18} />
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

          {/* Duplicate cards (kana copies of kanji cards, word + particle) — see lib/duplicates */}
          {duplicates.length > 0 && (
            <button
              onClick={() => setShowDuplicates(true)}
              className="w-full mb-3 flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl text-left active:scale-[0.99] transition-transform"
            >
              <span className="text-sm font-bold text-amber-800">{duplicates.length} {t.duplicates_found}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">{t.duplicates_review} →</span>
            </button>
          )}
          {showDuplicates && user && defaultDeckId && (
            <DuplicatesSheet
              duplicates={duplicates}
              userId={user.id}
              deckId={defaultDeckId}
              t={t}
              onClose={() => setShowDuplicates(false)}
              onMerged={() => fetchCards()}
            />
          )}

          {/* Search + manual refresh — the page already revalidates itself in the
              background on load (stale-while-revalidate), this is just for forcing it
              on demand instead of waiting. */}
          <div className="flex items-center gap-2 mb-6">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Search size={16} />
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
            <button
              onClick={() => fetchCards()}
              disabled={cardsLoading}
              title="Refresh"
              className="shrink-0 w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-400 hover:text-indigo-600 active:scale-90 transition-all disabled:opacity-50"
            >
              <RefreshCw size={16} className={cardsLoading ? "animate-spin" : ""} />
            </button>
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
                    {/* PRIORITY STAR */}
                    <button
                      onClick={() => toggleCardPriority(card)}
                      className="w-8 h-8 flex items-center justify-center active:scale-90 transition-all"
                      title={card.is_priority ? "Remove from Priority" : "Add to Priority"}
                    >
                      <Star
                        size={16}
                        className={card.is_priority ? "text-amber-500" : "text-slate-300"}
                        fill={card.is_priority ? "currentColor" : "none"}
                      />
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
                  <div
                    className="cursor-pointer active:opacity-70 transition-opacity"
                    onClick={() => setScoreDetailCard(card)}
                  >
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
                        className={`text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}
                      >
                        {card.partOfSpeech}
                      </span>
                    )}
                    {card.jlpt_level && (
                      <span
                        className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getJlptColor(card.jlpt_level)}`}
                      >
                        {card.jlpt_level}
                      </span>
                    )}
                    {(() => {
                      const status = cardScoreStatus(card);
                      if (!status) return null;
                      return (
                        <span
                          className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter ${
                            status === "mastered"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-rose-50 text-rose-600 border-rose-200"
                          }`}
                        >
                          {status === "mastered" ? t.mastered : t.struggling}
                        </span>
                      );
                    })()}
                    <div className="text-sm font-bold text-indigo-500">
                      {card.reading}
                    </div>
                    <div className="text-slate-600 mt-1">{card.english}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* JP→EN / EN→JP detail — tap a card above to see it, instead of every card
              carrying two bars inline all the time. */}
          {scoreDetailCard && (
            <div
              className="fixed inset-0 z-[230] flex items-center justify-center p-4"
              onClick={() => setScoreDetailCard(null)}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200" />
              <div
                className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="text-2xl font-black text-slate-800 truncate">{scoreDetailCard.japanese}</p>
                    <p className="text-sm font-bold text-indigo-500">{scoreDetailCard.reading}</p>
                    <p className="text-slate-600 text-sm mt-0.5">{scoreDetailCard.english}</p>
                  </div>
                  <button
                    onClick={() => setScoreDetailCard(null)}
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="mb-4 p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Example</p>
                  {scoreDetailCard.exampleSentence?.jp ? (
                    <>
                      <p className="text-slate-800 font-bold leading-relaxed">{scoreDetailCard.exampleSentence.jp}</p>
                      {scoreDetailCard.exampleSentence.en && (
                        <p className="text-slate-500 text-sm mt-1 leading-relaxed">{scoreDetailCard.exampleSentence.en}</p>
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
                        {scoreDetailCard.scores?.jp_to_en?.percent || 0}%
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${scoreDetailCard.scores?.jp_to_en?.percent || 0}%` }}
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
                        {scoreDetailCard.scores?.en_to_jp?.percent || 0}%
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400"
                          style={{ width: `${scoreDetailCard.scores?.en_to_jp?.percent || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const card = scoreDetailCard;
                    setScoreDetailCard(null);
                    handleReport(card.id, card.english);
                  }}
                  className="w-full mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 active:scale-95 transition-all"
                >
                  <Flag size={12} /> Report a Problem
                </button>
              </div>
            </div>
          )}

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
                          {/* PRIORITY STAR */}
                          <button
                            onClick={() => toggleCardPriority(card)}
                            className="p-2 hover:bg-amber-50 rounded-lg transition-colors"
                            title={card.is_priority ? "Remove from Priority" : "Add to Priority"}
                          >
                            <Star
                              size={18}
                              className={card.is_priority ? "text-amber-500" : "text-slate-300"}
                              fill={card.is_priority ? "currentColor" : "none"}
                            />
                          </button>

                          {/* REPORT BUTTON */}
                          <button
                            onClick={() => handleReport(card.id, card.english)}
                            className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors group relative"
                            title={t.report_issue}
                          >
                            <Flag size={16} />
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
          onClick={() => setShowAddSheet(true)}
          whileTap={{ scale: 0.88 }}
          className="fixed bottom-24 right-5 z-[205] w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-300/50 flex items-center justify-center"
        >
          <Plus size={26} strokeWidth={2.5} />
          {pendingWordCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingWordCount}
            </span>
          )}
        </motion.button>
        {user?.id && defaultDeckId && (
          <AddWordsSheet
            userId={user.id}
            deckId={defaultDeckId}
            isAdmin={isAdmin}
            blocklist={userBlocklist}
            open={showAddSheet}
            onClose={() => setShowAddSheet(false)}
            onAdded={fetchCards}
            onQueueCountChange={setPendingWordCount}
          />
        )}
      </main>
    </div>
  );
}
function StatCard({
  label,
  value,
  bgColor,
  iconColor,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  bgColor: string;
  iconColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
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
        <p className={`font-black text-slate-800 ${String(value || 0).length >= 6 ? "text-2xl" : String(value || 0).length >= 5 ? "text-3xl" : "text-4xl"}`}>
          {value || 0}
        </p>
      </div>

      {/* Visual Icon Box */}
      <div className={`w-12 h-12 rounded-2xl ${bgColor} flex items-center justify-center`}>
        <Icon size={20} className={iconColor} />
      </div>
    </motion.div>
  );
}
