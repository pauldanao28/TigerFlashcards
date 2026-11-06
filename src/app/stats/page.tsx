"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlashcardData, KanjiMnemonic } from "@/lib/types";
import { authedFetch } from "@/lib/authedFetch";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { translations } from "@/lib/languages";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { useAppAlert } from "@/context/AlertContext";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";
import LoadingScreen from "@/components/LoadingScreen";
import KnownWordsTriage, { TriageCard } from "@/components/KnownWordsTriage";
import AddWordsSheet from "@/components/AddWordsSheet";
import DuplicatesSheet from "@/components/DuplicatesSheet";
import CardDetailModal from "@/components/CardDetailModal";
import { findDuplicates, skipDeckDuplicates } from "@/lib/duplicates";
import { AlertTriangle, Ban, BarChart3, Bell, ChevronLeft, ChevronRight, Flag, Gamepad2, Gift, ImageIcon, Lightbulb, Loader2, Lock, MessageSquare, PenTool, Plus, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Star, TrendingDown, Volume2, X, Zap } from "lucide-react";
import { getPushSubscriptionState, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { validateUsername, isUsernameTaken, type UsernameProblem } from "@/lib/username";
import { normalizeEnglish, stripParens, normalizePartOfSpeech } from "@/lib/textNormalize";

// Same test StudyView uses to decide whether a card has a kanji worth generating a
// mnemonic for.
const KANJI_RE = /[一-鿿]/;

interface StatsCardsCache { userId: string; cards: FlashcardData[]; deckId: string; }
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

// A card needs this many Fail grades on the same day to show up in "Struggling
// Today" — a single slip doesn't count, a repeated one does. Same threshold (and
// cleared_at exclusion) WeakWordsQuiz/count_weak_words use, so this list and the
// Study page's "Struggling (N)" badge always agree on the same number.
const DAILY_STRUGGLE_THRESHOLD = 2;

export default function StatsPage() {
  const router = useRouter();
  const t = translations.en;
  const { isBusy: uploadBusy, setIsBusy: setUploadBusy } = useUploadGuard();
  const { showAlert, showConfirm, showPrompt } = useAppAlert();
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userBlocklist, setUserBlocklist] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [newBlockWord, setNewBlockWord] = useState("");
  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [maxStreak, setMaxStreak] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<"none" | "slowReflex" | "recentlyReviewed" | "weakWords" | "favorites" | "mastered">("none");
  // "Remember this kanji" mnemonic generation — moved here from Study's Slow Recall/
  // Weak Words lists (both now gone from Study; this is the only place a kanji card
  // from either signal is browsable). Study's own in-review Flashcard view still has
  // its own independent mnemonic trigger; this doesn't touch that.
  const [mnemonicCard, setMnemonicCard] = useState<FlashcardData | null>(null);
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
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
  const [dailyStruggles, setDailyStruggles] = useState<
    { card_id: string; fail_count: number; reflex_fail_count: number; japanese: string; reading: string; english: string; jlpt_level: string | null; partOfSpeech: string | null }[]
  >([]);
  const [showDailyStruggles, setShowDailyStruggles] = useState(false);
  const [dailyExplainedLines, setDailyExplainedLines] = useState<
    { source: "reader" | "watch"; line_text: string; source_title: string | null; explain_count: number }[]
  >([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null); // non-null while editing
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(true);
  const [dailyQuestsEnabled, setDailyQuestsEnabled] = useState(true);
  const [pushState, setPushState] = useState<"subscribed" | "unsubscribed" | "unsupported" | "loading">("loading");
  const [feedbackForm, setFeedbackForm] = useState({
    type: "feedback",
    subject: "",
    description: "",
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [sent, setSent] = useState(false);
  // Tapped card's JP→EN/EN→JP detail — shown in a small modal instead of inline, so the
  // collapsed list card stays compact.
  const [scoreDetailCard, setScoreDetailCard] = useState<FlashcardData | null>(null);
  const [grammarStats, setGrammarStats] = useState<{ mastered: number; total: number } | null>(null);
  const [previewPack, setPreviewPack] = useState<any | null>(null);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [pendingWordCount, setPendingWordCount] = useState(0);
  // Safety net: don't let the nav-guard get stuck "busy" forever if this page unmounts
  // some other way (browser back/forward) while a batch upload was mid-flight.
  useEffect(() => () => setUploadBusy(false), [setUploadBusy]);

  useEffect(() => {
    getPushSubscriptionState().then(setPushState);
  }, []);

  const handleTogglePush = async () => {
    if (pushState === "subscribed") {
      await unsubscribeFromPush();
      setPushState("unsubscribed");
      return;
    }
    setPushState("loading");
    const result = await subscribeToPush();
    if (result.success) {
      setPushState("subscribed");
    } else {
      setPushState("unsubscribed");
      showAlert(result.error || "Couldn't enable notifications.");
    }
  };

  // Block browser-level navigation (tab close, URL bar, browser back/forward) during upload.
  useEffect(() => {
    if (!uploadBusy) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadBusy]);

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

  // Re-checks (not just reads) on every visit — a cheap idempotent RPC call, kept
  // here (even though Badges no longer displays on this page) so someone who opens
  // Cards before ever visiting Home still gets prompt awarding; Home and StudyView's
  // own checks cover the toast/display side now.
  useEffect(() => {
    if (!user) return;
    supabase.rpc("check_and_award_badges").then(({ error }) => {
      if (error) console.error("Error checking badges:", error.message);
    });
  }, [user]);

  // Grammar summary for the compact card — same mastery bar (>=3 attempts, >=80%)
  // and "touched" filter as /stats/grammar uses, so the count matches the full page.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: sData, error } = await supabase
        .from("user_grammar_scores")
        .select("total, percent")
        .eq("user_id", user.id);
      if (error) { console.error("Error fetching grammar scores:", error.message); return; }
      const touched = (sData ?? []).filter((s) => s.total > 0);
      const mastered = touched.filter((s) => s.total >= 3 && s.percent >= 80).length;
      setGrammarStats({ mastered, total: touched.length });
    })();
  }, [user]);

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
            setInitLoading(false);
          }

          const [, deckId] = await Promise.all([
            fetchProfile(),
            fetchDefaultDeck(),
            fetchStarterPacks(),
            fetchDailyStruggles(),
            fetchDailyExplainedLines(),
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

  // Struggling/Explained Today are both written to from Study — often a *separate*
  // window (the Mini Mode popup), not just a different in-app page. visibilitychange
  // alone doesn't reliably fire across separate windows (it's really meant for
  // tab-switching/minimizing within one), so also listen for window focus, which does.
  useEffect(() => {
    if (!user) return;
    const refetch = () => {
      fetchDailyStruggles();
      fetchDailyExplainedLines();
    };
    const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refetch);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "full_name, avatar_url, streak_count, max_streak, blocked_words, auto_play_jp, auto_play_en, sfx_enabled, swipe_only, imported_packs, is_admin, is_premium, referral_code, stats_visible_to_friends, daily_quests_enabled",
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
      setDailyQuestsEnabled(data.daily_quests_enabled ?? true);
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

  // "Struggling Today" — cards graded Fail at least DAILY_STRUGGLE_THRESHOLD times today
  // (daily_struggles, written by StudyView's handleScore on every Fail grade), not the
  // all-time accuracy-based metric. A single slip doesn't count; a repeated one does.
  // Two plain queries + a client-side join, rather than an embedded
  // daily_struggles → master_cards select — sidesteps any PostgREST schema-cache lag
  // on the foreign key relationship (e.g. right after running the migration by hand).
  const fetchDailyStruggles = async () => {
    if (!user) return;
    const sgToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const { data: struggles, error } = await supabase
      .from("daily_struggles")
      .select("card_id, fail_count, reflex_fail_count")
      .eq("user_id", user.id)
      .eq("struggle_date", sgToday)
      .gte("fail_count", DAILY_STRUGGLE_THRESHOLD)
      .is("cleared_at", null)
      .order("fail_count", { ascending: false });
    if (error) { console.error("Error fetching daily struggles:", error); return; }
    if (!struggles || struggles.length === 0) { setDailyStruggles([]); return; }

    const { data: cardRows, error: cardErr } = await supabase
      .from("master_cards")
      .select("id, japanese, reading, english, jlpt_level, partOfSpeech")
      .in("id", struggles.map((s) => s.card_id));
    if (cardErr) { console.error("Error fetching struggling cards:", cardErr); return; }

    const cardById = new Map((cardRows ?? []).map((c) => [c.id, c]));
    setDailyStruggles(
      struggles
        .map((s) => {
          const card = cardById.get(s.card_id);
          return card ? { card_id: s.card_id, fail_count: s.fail_count, reflex_fail_count: s.reflex_fail_count ?? 0, japanese: card.japanese, reading: card.reading, english: card.english, jlpt_level: card.jlpt_level, partOfSpeech: card.partOfSpeech } : null;
        })
        .filter((row): row is NonNullable<typeof row> => !!row),
    );
  };

  // "Explained Today" — Reader sentences / Watch caption lines tapped "Explain" today
  // (daily_explained_lines, written by useLineExplain on a successful explain fetch).
  const fetchDailyExplainedLines = async () => {
    if (!user) return;
    const sgToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const { data, error } = await supabase
      .from("daily_explained_lines")
      .select("source, line_text, source_title, explain_count")
      .eq("user_id", user.id)
      .eq("explain_date", sgToday)
      .order("first_explained_at", { ascending: true });
    if (error) { console.error("Error fetching daily explained lines:", error); return; }
    if (!data) return;
    setDailyExplainedLines(data);
  };

  const copyDailyExplainedLinesForGemini = async () => {
    const text = dailyExplainedLines
      .map((l) => `[${l.source}${l.source_title ? ` — ${l.source_title}` : ""}] ${l.line_text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    showAlert("Copied!");
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
          .select(`*, deck_cards!inner(deck_id, added_at), user_scores(scores_json, is_priority, prioritized_at, reflex_time_total_ms, reflex_attempts, updated_at)`)
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

      const flattened = allData.map((card: any) => ({
        ...card,
        added_to_deck_at: card.deck_cards?.[0]?.added_at,
        scores: card.user_scores?.[0]?.scores_json || {
          jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
          en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
        },
        is_priority: card.user_scores?.[0]?.is_priority || false,
        prioritized_at: card.user_scores?.[0]?.prioritized_at || null,
        reflex_time_total_ms: card.user_scores?.[0]?.reflex_time_total_ms ?? 0,
        reflex_attempts: card.user_scores?.[0]?.reflex_attempts ?? 0,
        last_reviewed_at: card.user_scores?.[0]?.updated_at ?? null,
      }));

      setCards(flattened);
      if (user && defaultDeckId) {
        const freshCache: StatsCardsCache = { userId: user.id, cards: flattened, deckId: defaultDeckId };
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

  const duplicates = useMemo(() => findDuplicates(cards), [cards]);

  // Per-card status tag shown inline on every card row (independent of the quick
  // filters below). Mastered = either direction ≥70% with 5+ passes; Struggling =
  // best direction <40% with at least one attempt — looser than the Weak Words
  // filter (10+ tries, <30% combined) on purpose, since this is just a glance tag,
  // not a drill-down list.
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

  // Same per-card reflex math as StudyView's own Slow Recall ranking.
  const avgReflexSeconds = (c: FlashcardData): number | null => {
    const attempts = c.reflex_attempts ?? 0;
    if (attempts < 3) return null;
    return (c.reflex_time_total_ms ?? 0) / attempts / 1000;
  };

  // Same generate/cache logic as StudyView's handleWeakWordMnemonic — confirm (it
  // costs a daily AI lookup), generate via /api/mnemonic, persist on the card, and
  // keep it cached so re-opening a card already carrying one skips the API call.
  const handleMnemonic = async (card: FlashcardData) => {
    setMnemonicCard(card);
    if (card.mnemonic || mnemonicLoading) return;

    const confirmed = await showConfirm(
      `Generate a memory aid for ${card.japanese}? This uses one of your daily AI lookups.`,
      { title: "Remember this kanji?", confirmLabel: "Generate" },
    );
    if (!confirmed) {
      setMnemonicCard(null);
      return;
    }

    setMnemonicLoading(true);
    setMnemonicError(null);
    try {
      const res = await authedFetch("/api/mnemonic", {
        method: "POST",
        body: JSON.stringify({ japanese: card.japanese, reading: card.reading, english: card.english }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMnemonicError(data.error || "Couldn't generate a mnemonic right now.");
        return;
      }
      const mnemonic: KanjiMnemonic = { entries: data.entries, origin: data.origin };
      await supabase.from("master_cards").update({ mnemonic }).eq("id", card.id);
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, mnemonic } : c)));
      setMnemonicCard((prev) => (prev && prev.id === card.id ? { ...prev, mnemonic } : prev));
    } catch {
      setMnemonicError("Couldn't generate a mnemonic right now.");
    } finally {
      setMnemonicLoading(false);
    }
  };

  // Combined jp_to_en + en_to_jp pass rate — same definition StudyView's
  // cardOverallPercent uses for Weak Words.
  const cardOverallPercent = (c: FlashcardData): number => {
    const jp = c.scores?.jp_to_en;
    const en = c.scores?.en_to_jp;
    const pass = (jp?.pass || 0) + (en?.pass || 0);
    const total = (jp?.total || 0) + (en?.total || 0);
    return total > 0 ? Math.round((pass / total) * 100) : 0;
  };

  // Slow Reflex / Recently Reviewed / Weak Words / Favorites quick filters — same
  // definitions StudyView's own Focus filter and Weak Words/Priority Words lists used
  // before those moved here (slowReflexIds: reflex_attempts >= 3; weakWordsIds: 10+
  // tries but <30% combined accuracy; favoritesIds: starred via the priority toggle).
  const slowReflexIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) {
      if ((c.reflex_attempts ?? 0) >= 3) ids.add(c.id);
    }
    return ids;
  }, [cards]);

  const recentlyReviewedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) {
      const total = (c.scores?.jp_to_en?.total ?? 0) + (c.scores?.en_to_jp?.total ?? 0);
      if (c.last_reviewed_at && total > 0) ids.add(c.id);
    }
    return ids;
  }, [cards]);

  const weakWordsIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) {
      const jp = c.scores?.jp_to_en;
      const en = c.scores?.en_to_jp;
      const total = (jp?.total ?? 0) + (en?.total ?? 0);
      if (total >= 10 && cardOverallPercent(c) < 30) ids.add(c.id);
    }
    return ids;
  }, [cards]);

  const favoritesIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) {
      if (c.is_priority) ids.add(c.id);
    }
    return ids;
  }, [cards]);

  // Mastered = either direction ≥70% with 5+ passes (same rule cardScoreStatus
  // uses for the inline tag) — replaces the old Mastered StatCard tile/drill-down.
  const masteredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) {
      if (cardScoreStatus(c) === "mastered") ids.add(c.id);
    }
    return ids;
  }, [cards]);

  const filteredCards = useMemo(() => {
    const query = searchQuery.toLowerCase();
    let list = cards.filter(
      (card) =>
        card.japanese.toLowerCase().includes(query) ||
        card.reading.toLowerCase().includes(query) ||
        card.english.toLowerCase().includes(query),
    );
    if (quickFilter === "slowReflex") list = list.filter((c) => slowReflexIds.has(c.id));
    if (quickFilter === "recentlyReviewed") list = list.filter((c) => recentlyReviewedIds.has(c.id));
    if (quickFilter === "weakWords") list = list.filter((c) => weakWordsIds.has(c.id));
    if (quickFilter === "favorites") list = list.filter((c) => favoritesIds.has(c.id));
    if (quickFilter === "mastered") list = list.filter((c) => masteredIds.has(c.id));

    return list.sort((a, b) => {
      if (quickFilter === "slowReflex") {
        return (avgReflexSeconds(b) ?? 0) - (avgReflexSeconds(a) ?? 0);
      }
      if (quickFilter === "weakWords") {
        return cardOverallPercent(a) - cardOverallPercent(b);
      }
      if (quickFilter === "mastered") {
        return cardOverallPercent(b) - cardOverallPercent(a);
      }
      if (quickFilter === "favorites") {
        return (b.prioritized_at ?? "").localeCompare(a.prioritized_at ?? "");
      }
      if (quickFilter === "recentlyReviewed") {
        return (b.last_reviewed_at ?? "").localeCompare(a.last_reviewed_at ?? "");
      }
      const dateA = new Date(a.added_to_deck_at ?? 0).getTime();
      const dateB = new Date(b.added_to_deck_at ?? 0).getTime();
      return dateB - dateA;
    });
  }, [cards, searchQuery, quickFilter, slowReflexIds, recentlyReviewedIds, weakWordsIds, favoritesIds, masteredIds]);

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
      case "N4": return "bg-sky-100 text-sky-700 border-sky-200";
      case "N3": return "bg-amber-100 text-amber-700 border-amber-200";
      case "N2": return "bg-orange-100 text-orange-700 border-orange-200";
      case "N1": return "bg-rose-100 text-rose-700 border-rose-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const USERNAME_ERRORS: Record<UsernameProblem, string> = {
    too_short: "Too short! (Min 2)",
    too_long: "Too long! (Max 10)",
    no_spaces: "No spaces allowed!",
    taken: "Already taken! Try another.",
  };

  const saveUsername = async () => {
    if (!user || nameDraft == null) return;
    const next = nameDraft.trim();
    if (next === profileName) return setNameDraft(null);
    const problem = validateUsername(nameDraft);
    if (problem) return setNameError(USERNAME_ERRORS[problem]);
    setNameSaving(true);
    setNameError(null);
    try {
      if (await isUsernameTaken(next, user.id)) return setNameError(USERNAME_ERRORS.taken);
      const { error } = await supabase.from("profiles").update({ full_name: next }).eq("id", user.id);
      if (error) return setNameError(error.code === "23505" ? USERNAME_ERRORS.taken : "Couldn't save. Try again.");
      setProfileName(next);
      setNameDraft(null);
    } catch {
      setNameError("Couldn't save. Try again.");
    } finally {
      setNameSaving(false);
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
      if (column === "daily_quests_enabled") setDailyQuestsEnabled(value);
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

              {/* USERNAME */}
              <div className="mb-8">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PenTool size={15} className="text-slate-400" /> Username
                </h3>
                {nameDraft == null ? (
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{profileName || "—"}</p>
                    <button
                      onClick={() => { setNameDraft(profileName ?? ""); setNameError(null); }}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-95"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <input
                        value={nameDraft}
                        onChange={(e) => { setNameDraft(e.target.value); setNameError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") saveUsername(); if (e.key === "Escape") setNameDraft(null); }}
                        maxLength={10}
                        autoFocus
                        className="flex-1 min-w-0 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-black uppercase tracking-widest focus:border-black outline-none"
                      />
                      <button
                        onClick={saveUsername}
                        disabled={nameSaving}
                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-60"
                      >
                        {nameSaving ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => setNameDraft(null)}
                        className="px-3 py-2.5 text-slate-500 text-[10px] font-black uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                    </div>
                    {nameError ? (
                      <p className="text-xs font-bold text-red-500 mt-2">{nameError}</p>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-medium mt-2">2–10 characters, no spaces. Friends find you by this name.</p>
                    )}
                  </div>
                )}
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
                  <p className="text-[10px] text-slate-500 font-medium leading-tight mb-3">
                    Share your link — new friends who sign up through it are added to your circle automatically.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 bg-white rounded-xl border border-slate-200 font-black text-sm text-slate-700 tracking-widest truncate">
                      {referralCode ?? "…"}
                    </div>
                    <button
                      onClick={async () => {
                        if (!referralCode) return;
                        try {
                          await navigator.clipboard.writeText(referralCode);
                          showAlert("Code copied!");
                        } catch {
                          showAlert("Failed to copy code.");
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
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
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
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
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
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
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
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
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
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
                        Friends can always see your name, streak, overall level, and daily card progress. Turn this off to hide your detailed scores, today&apos;s quizzes, and goal/quiz notifications from them.
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

                  {/* Daily Quests Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        Daily Quests
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
                        Show 3 daily quests on your Home screen. Turn this off if you&apos;d rather not see them.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateAudioSetting("daily_quests_enabled", !dailyQuestsEnabled)
                      }
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${dailyQuestsEnabled ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${dailyQuestsEnabled ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {/* Push Notifications Toggle */}
                  {pushState !== "unsupported" && (
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-200">
                      <div className="flex items-start gap-2.5">
                        <Bell size={15} className="text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-slate-700">
                            Notifications
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium leading-tight">
                            Get notified on this device about friend requests and other updates, even when the app is closed.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleTogglePush}
                        disabled={pushState === "loading"}
                        className={`w-12 h-6 rounded-full transition-all relative shrink-0 disabled:opacity-50 ${pushState === "subscribed" ? "bg-indigo-600" : "bg-slate-300"}`}
                      >
                        <div
                          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${pushState === "subscribed" ? "left-7" : "left-1"}`}
                        />
                      </button>
                    </div>
                  )}
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

              {/* ACCOUNT SECURITY SECTION — moved here, right before Sign Out, from
                  its old spot right after the referral section. */}
              <div className="mt-16 mb-8">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Lock size={15} className="text-slate-400" /> {t.account_security || "Account Security"}
                </h3>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                  <div className="max-w-[250px]">
                    <p className="text-sm font-bold text-slate-700 leading-tight">
                      {t.update_password || "Update Password"}
                    </p>
                    <p className="text-[9px] text-slate-500 font-medium mt-0.5 leading-relaxed">
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
                    <div className="px-4 py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
                      Social Auth
                    </div>
                  )}
                </div>
              </div>

              {/* SIGN OUT / DELETE ACCOUNT — moved to the very end of Settings,
                  after every other section, so they're not the first destructive-
                  looking actions someone runs into. */}
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

              </div>
            </div>
          )}

          <div className="flex justify-between items-start gap-3 mb-8">
            {/* Left Side: Deck Title & Edit Logic */}
            <div className="flex flex-col min-w-0 flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    className="text-xl md:text-3xl font-extrabold text-slate-800 bg-transparent border-b-2 border-indigo-500 outline-none px-1 py-0 min-w-0 flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && updateDeckTitle()}
                    onBlur={() => !tempTitle.trim() && setIsEditingTitle(false)}
                  />
                  <button
                    onClick={updateDeckTitle}
                    className="shrink-0 bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 transition-colors"
                  >
                    {t.save}
                  </button>
                  <button
                    onClick={() => setIsEditingTitle(false)}
                    className="shrink-0 bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <h1 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight tracking-tight truncate min-w-0">
                    {deckTitle}
                  </h1>
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="shrink-0 p-1.5 bg-slate-200/50 text-slate-400 rounded-lg hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-90"
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
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
                {t.active_collection}
              </p>
            </div>

            {/* Right Side: compact Mini Games icon button, same row as the title */}
            <Link
              href="/minigames"
              title={t.mini_games}
              className="shrink-0 p-3.5 bg-indigo-50 rounded-2xl shadow-sm text-indigo-700 border border-indigo-100 hover:bg-indigo-100 active:scale-95 transition-all"
            >
              <Gamepad2 size={20} />
            </Link>
          </div>

          {/* Grammar — compact summary card; the full pattern list (all JLPT levels,
              filterable) lives on its own page. Kept on Cards (not Home) since it's
              "your learned content" alongside the vocabulary deck, same category as
              the card list below it rather than the progress/motivation stuff on
              Home. */}
          {grammarStats && grammarStats.total > 0 && (
            <Link
              href="/stats/grammar"
              className="flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm mb-8 hover:border-indigo-200 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0 text-base">
                  📝
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700">Grammar</p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {grammarStats.mastered}/{grammarStats.total} learned
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 shrink-0" />
            </Link>
          )}

          {/* Struggling Today — one entry point for both today-only signals: cards
              failed DAILY_STRUGGLE_THRESHOLD+ times, and Reader/Watch lines tapped
              "Explain". Hidden on a clean day, same as Starter Packs. */}
          {(dailyStruggles.length > 0 || dailyExplainedLines.length > 0) && (
            <div className="mb-10">
              <button
                onClick={() => setShowDailyStruggles(true)}
                className="w-full flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 font-black text-slate-700 hover:bg-slate-50 transition-all active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-sm">
                  <TrendingDown size={16} className="text-rose-400" /> Struggling Today
                </span>
                <span className="flex items-center gap-2 text-slate-500 text-xs">
                  {dailyStruggles.length + dailyExplainedLines.length} items <span>→</span>
                </span>
              </button>
            </div>
          )}

          {/* Starter Packs Section — hidden once every pack has been added, so it's not
              permanent real estate for users with nothing left to add. */}
          {starterPacks.some((pack) => !ownedPacks?.includes(pack.id) || packWordsMissing(pack).length > 0) && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
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
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
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
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
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

          {showDailyStruggles && (
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6"
              onClick={() => setShowDailyStruggles(false)}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
              <div
                className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-50 flex justify-between items-center shrink-0">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <TrendingDown size={18} className="text-rose-500" /> Struggling Today
                  </h3>
                  <button onClick={() => setShowDailyStruggles(false)} className="text-slate-300 hover:text-slate-500 shrink-0">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {dailyStruggles.length > 0 && (
                    <div className="mb-5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                        Words you&apos;ve missed {DAILY_STRUGGLE_THRESHOLD}+ times
                      </p>
                      <div className="space-y-2">
                        {dailyStruggles.map((w) => {
                          const liveCard = cards.find((c) => c.id === w.card_id);
                          return (
                            <div key={w.card_id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                              <div className="min-w-0">
                                <p className="font-black text-slate-800 truncate">
                                  {w.japanese} <span className="text-slate-400 font-medium">{w.reading !== w.japanese ? w.reading : ""}</span>
                                </p>
                                <p className="text-xs text-slate-500 truncate">{w.english}</p>
                                {(w.partOfSpeech || w.jlpt_level || w.reflex_fail_count > 0) && (
                                  <div className="flex items-center gap-1 mt-1">
                                    {w.partOfSpeech && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(w.partOfSpeech)}`}>
                                        {w.partOfSpeech}
                                      </span>
                                    )}
                                    {w.jlpt_level && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getJlptColor(w.jlpt_level)}`}>
                                        {w.jlpt_level}
                                      </span>
                                    )}
                                    {w.reflex_fail_count > 0 && (
                                      // Informational only — doesn't change fail_count or the
                                      // 3+ threshold, just flags that some of today's fails were
                                      // Reflex Mode timeouts rather than deliberate misses.
                                      <span
                                        className="text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter bg-amber-50 text-amber-600 border-amber-100 flex items-center gap-0.5"
                                        title={`${w.reflex_fail_count} of today's fails were Reflex Mode timeouts`}
                                      >
                                        <Zap size={9} fill="currentColor" />
                                        Reflex ×{w.reflex_fail_count}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="text-[10px] font-black text-rose-500 bg-rose-50 border border-rose-100 rounded-full px-2 py-1">
                                  ×{w.fail_count}
                                </span>
                                {liveCard && (
                                  // Star it into Priority so it gets pulled into Study's weighted
                                  // rotation more often — the way to actually drill a struggling
                                  // word (including a slow Reflex Mode one) back up.
                                  <button
                                    onClick={() => toggleCardPriority(liveCard)}
                                    className="w-7 h-7 flex items-center justify-center active:scale-90 transition-all"
                                    title={liveCard.is_priority ? "Remove from Priority" : "Add to Priority"}
                                  >
                                    <Star
                                      size={15}
                                      className={liveCard.is_priority ? "text-amber-500" : "text-slate-300"}
                                      fill={liveCard.is_priority ? "currentColor" : "none"}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {dailyExplainedLines.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                          Reader/Watch lines you tapped Explain on
                        </p>
                        <button
                          onClick={copyDailyExplainedLinesForGemini}
                          className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 active:scale-95 transition-all shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="space-y-2">
                        {dailyExplainedLines.map((l, i) => (
                          <div key={i} className="bg-slate-50 rounded-2xl px-4 py-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">
                                {l.source}{l.source_title ? ` · ${l.source_title}` : ""}
                              </span>
                              {l.explain_count > 1 && (
                                <span className="shrink-0 text-[10px] font-black text-indigo-500 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                                  ×{l.explain_count}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-slate-800 leading-snug">{l.line_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
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

          {/* Quick filters — same signals StudyView's own Focus filter and its Weak
              Words/Priority Words lists used before those moved here, applied to the
              card list in place instead of another entry-point card stacked above the
              list (Cards already grew too tall once this session; don't repeat that). */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {([
              ["mastered", "🏆 Mastered"],
              ["favorites", "⭐ Favorites"],
              ["slowReflex", "🐌 Slow"],
              ["recentlyReviewed", "🕐 Recent"],
              ["weakWords", "😓 Weak"],
            ] as const).map(([key, label]) => {
              const isActive = quickFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => { setQuickFilter(isActive ? "none" : key); setDisplayLimit(20); }}
                  className={`w-full px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 truncate ${
                    isActive ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

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
                    {quickFilter === "slowReflex" && avgReflexSeconds(card) != null && (
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter bg-amber-50 text-amber-600 border-amber-200">
                        🐌 {avgReflexSeconds(card)!.toFixed(1)}s avg ×{card.reflex_attempts}
                      </span>
                    )}
                    {quickFilter === "weakWords" && (
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md border font-black uppercase tracking-tighter bg-rose-50 text-rose-600 border-rose-200">
                        😓 {cardOverallPercent(card)}%
                      </span>
                    )}
                    {(quickFilter === "slowReflex" || quickFilter === "weakWords") && KANJI_RE.test(card.japanese) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMnemonic(card); }}
                        className="ml-1.5 p-1 rounded-full hover:bg-amber-100 active:scale-90 transition-all align-middle"
                        title="Remember this kanji"
                      >
                        <Lightbulb size={14} className={card.mnemonic ? "text-amber-500" : "text-slate-300"} />
                      </button>
                    )}
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
            <CardDetailModal card={scoreDetailCard} onClose={() => setScoreDetailCard(null)} />
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
                        {quickFilter === "slowReflex" && avgReflexSeconds(card) != null && (
                          <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter bg-amber-50 text-amber-600 border-amber-200">
                            🐌 {avgReflexSeconds(card)!.toFixed(1)}s avg ×{card.reflex_attempts}
                          </span>
                        )}
                        {quickFilter === "weakWords" && (
                          <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter bg-rose-50 text-rose-600 border-rose-200">
                            😓 {cardOverallPercent(card)}%
                          </span>
                        )}
                        {(quickFilter === "slowReflex" || quickFilter === "weakWords") && KANJI_RE.test(card.japanese) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMnemonic(card); }}
                            className="ml-1.5 p-1 rounded-full hover:bg-amber-100 active:scale-90 transition-all align-middle"
                            title="Remember this kanji"
                          >
                            <Lightbulb size={14} className={card.mnemonic ? "text-amber-500" : "text-slate-300"} />
                          </button>
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

        {/* Mnemonic sheet — triggered from the Slow Reflex/Weak Words quick-filter
            rows' "Remember this kanji" button. Same content/style as StudyView's own
            (now-removed) version. */}
        {mnemonicCard && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-black/40"
              onClick={() => setMnemonicCard(null)}
            />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[301] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 p-6 w-full sm:max-w-sm max-h-[80vh] overflow-y-auto"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Lightbulb size={16} className="text-amber-500" />
                  <p className="text-slate-800 font-black text-sm uppercase tracking-tight">
                    Remember {mnemonicCard.japanese}
                  </p>
                </div>
                <button onClick={() => setMnemonicCard(null)} className="text-slate-300 hover:text-slate-500 shrink-0">
                  <X size={18} />
                </button>
              </div>

              {mnemonicLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Thinking of a way to remember it…</span>
                </div>
              )}

              {!mnemonicLoading && mnemonicError && (
                <p className="text-center text-rose-500 text-xs font-bold py-6">{mnemonicError}</p>
              )}

              {!mnemonicLoading && !mnemonicError && mnemonicCard.mnemonic && (
                <div className="space-y-4">
                  {mnemonicCard.mnemonic.entries.map((entry, i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-3xl font-black text-slate-800 mb-1">{entry.character}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1.5">
                        {entry.radicals}
                      </p>
                      <p className="text-sm text-slate-600 leading-snug">{entry.story}</p>
                    </div>
                  ))}
                  {mnemonicCard.mnemonic.origin && (
                    <p className="text-xs text-slate-400 italic leading-snug pt-1">{mnemonicCard.mnemonic.origin}</p>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
