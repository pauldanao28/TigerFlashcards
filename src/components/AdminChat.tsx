"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Send, Trash2, X, Loader2, List, Plus, ScrollText, Volume2, VolumeX, BookOpen, SlidersHorizontal } from "lucide-react";
import { playTTS, stopTTS, getVoice, setVoice, VOICE_OPTIONS, VoiceId } from "@/lib/tts";

function uuid(): string {
  try { return self.crypto.randomUUID(); } catch { /* fall through */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Persona definitions ───────────────────────────────────────────────────────
export type PersonaKey = "senpai" | "sensei" | "samurai" | "idol";

const PERSONAS: Record<PersonaKey, { label: string; kanji: string; emoji: string; color: string; bg: string; ring: string; desc: string }> = {
  senpai:  { label: "先輩",     kanji: "先輩", emoji: "🧑‍🎓", color: "text-indigo-600",  bg: "bg-indigo-50",   ring: "ring-indigo-400",  desc: "Friendly senpai" },
  sensei:  { label: "先生",     kanji: "先生", emoji: "👨‍🏫", color: "text-slate-700",   bg: "bg-slate-100",   ring: "ring-slate-400",   desc: "Strict teacher" },
  samurai: { label: "侍",       kanji: "侍",   emoji: "⚔️",  color: "text-rose-700",    bg: "bg-rose-50",     ring: "ring-rose-400",    desc: "Samurai philosopher" },
  idol:    { label: "アイドル", kanji: "☆", emoji: "⭐", color: "text-pink-600", bg: "bg-pink-50", ring: "ring-pink-400", desc: "Idol coach" },
};

const PERSONA_ORDER: PersonaKey[] = ["senpai", "sensei", "samurai", "idol"];
const PERSONA_STORAGE_KEY = "flashkado-sensei-persona";
const chatStorageKey = (p: PersonaKey) => `flashkado-sensei-chat-${p}`;

// ── Types ��──────────────────────────────────────────────────────────────────���─
interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: number;
  corrections?: string[];
}

const SCENARIOS: { id: string; emoji: string; labelEn: string; labelJp: string; prompt: string }[] = [
  { id: "free",       emoji: "💬", labelEn: "Free Chat",    labelJp: "自由会話",  prompt: "" },
  { id: "drill",      emoji: "🎯", labelEn: "Drill",        labelJp: "ドリル",    prompt: "" }, // prompt built dynamically from weak cards
  { id: "ramen",      emoji: "🍜", labelEn: "Ramen Shop",   labelJp: "ラーメン屋", prompt: "今日はラーメン屋のロールプレイシナリオです。生徒はお客として来店しています。注文・メニュー確認・お会計などの場面を自然に展開し、食べ物に関する語彙を積極的に使ってください。" },
  { id: "basketball", emoji: "🏀", labelEn: "Basketball",   labelJp: "バスケ練習",  prompt: "今日はバスケットボールの練習後のシナリオです。チームメートとの会話・励まし・作戦・反省などのカジュアルな日本語を中心に使ってください。" },
  { id: "konbini",    emoji: "🏪", labelEn: "Convenience",  labelJp: "コンビニ",   prompt: "今日はコンビニでのシナリオです。生徒はお客として来店。商品を探す・店員に質問・レジで会計するシーンを練習してください。" },
  { id: "interview",  emoji: "💼", labelEn: "Interview",    labelJp: "就職面接",   prompt: "今日は就職面接のロールプレイです。敬語（尊敬語・謙譲語）を中心に、自己紹介・志望動機・強み弱みなど面接定番の質問と答え方を練習してください。" },
  { id: "travel",     emoji: "✈️", labelEn: "Travel",       labelJp: "旅行",      prompt: "今日は日本旅行のシナリオです。ホテルのチェックイン・観光地での道案内・お土産屋での買い物など、旅行中に使う日本語を練習してください。" },
  { id: "doctor",     emoji: "🏥", labelEn: "Doctor Visit", labelJp: "病院",      prompt: "今日は病院でのシナリオです。受付・医師への症状説明・薬局での対応など、医療・健康に関する語彙と表現を練習してください。" },
];

interface SenseiProfile {
  level?: string;
  native_language?: string;
  motivation?: string;
  occupation?: string;
  learning_goals?: string[];
  hobbies?: string[];
  weak_points?: string[];
  strong_points?: string[];
  common_errors?: string[];
  preferred_topics?: string[];
  personality?: string;
  vocabulary_introduced?: string[];
  recently_added?: string[];
  grammar_weak_points?: string[];
  recent_topics?: string[];
  notes?: string;
}

interface Tooltip {
  word: string;
  reading: string;
  editWord: string;
  x: number;
  y: number;
  adding: boolean;
  knownEnglish?: string | null;
  jishoLoading?: boolean;
  jishoMeanings?: { definition: string; pos: string }[];
  jlpt?: string[];
  isCommon?: boolean;
  example?: { jp: string; en: string } | null;
}

type Segment =
  | { type: "annotated"; text: string; reading: string }
  | { type: "plain"; text: string };

const kanjiRe = /[一-龯㐀-䶿々〻]/;

// Lazy-init: avoid module-level Intl.Segmenter which crashes during Next.js SSR
let _jaSegmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (typeof window === "undefined") return null;
  if (!_jaSegmenter) {
    try { _jaSegmenter = new Intl.Segmenter("ja", { granularity: "word" }); } catch { return null; }
  }
  return _jaSegmenter;
}

// ── Furigana parser ───────────────────────────────────────────────────────────
// Tappable if word STARTS with kanji — allows okurigana suffix (食べる, 頑張って).
// Rejects words where kana precedes kanji (お願い) or no kanji at all (ありがとう).
// Furigana parentheses are always stripped so they never appear in chat text.
function parseFurigana(text: string): Segment[] {
  if (!text) return [];
  const parts: Segment[] = [];
  // Match kanji word (with optional okurigana) + reading. First char must be kanji so particles
  // like の between two words don't get swallowed into the annotated segment.
  const regex = /([一-龯々〻㐀-䶿][一-龯々〻㐀-䶿ぁ-ん]*)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g;
  const containsKanji = /[一-龯々〻㐀-䶿ヶ]/;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "plain", text: text.slice(lastIndex, match.index) });
    if (containsKanji.test(match[1])) {
      parts.push({ type: "annotated", text: match[1], reading: match[2] });
    } else {
      parts.push({ type: "plain", text: match[1] }); // strip furigana, show word as-is
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "plain", text: text.slice(lastIndex) });
  return parts;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminChat({ userId }: { userId: string }) {
  const [activePersona, setActivePersona] = useState<PersonaKey>("senpai");
  // Sync from localStorage after hydration to avoid SSR/client mismatch
  useEffect(() => {
    const saved = localStorage.getItem(PERSONA_STORAGE_KEY) as PersonaKey | null;
    if (saved && PERSONA_ORDER.includes(saved) && saved !== activePersona) setActivePersona(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SenseiProfile | null>(null);
  const [wordList, setWordList] = useState<string[]>([]);
  const wordListLoadedRef = useRef(false);
  const [showList, setShowList] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);
  const [addedSummary, setAddedSummary] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [weakCards, setWeakCards] = useState<string[]>([]);
  const [weakCardDetails, setWeakCardDetails] = useState<{ japanese: string; reading: string; english: string }[]>([]);
  const [activeScenario, setActiveScenario] = useState("free");
  const [recap, setRecap] = useState<any | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapConfirm, setRecapConfirm] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>(() => getVoice());
  const greetingFiredRef = useRef(false);

  const lastAnalyzedIndexRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastProfileUpdateRef = useRef(0);
  const sheetOpenRef = useRef(false); // true while bottom sheet is open — suppress auto-scroll
  const jishoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const persona = PERSONAS[activePersona];

  // ── Switch persona ──────────────────────────────────────────────────────────
  const switchPersona = (key: PersonaKey) => {
    if (key === activePersona) return;
    localStorage.setItem(PERSONA_STORAGE_KEY, key);
    setActivePersona(key);
    setMessages([]);
    setMessagesLoading(true);
    lastAnalyzedIndexRef.current = 0;
    greetingFiredRef.current = false;
  };


  // ── Load messages for active persona ───────────────────────────────────���───
  useEffect(() => {
    const stored = localStorage.getItem("sensei_profile_updated_at");
    if (stored) lastProfileUpdateRef.current = parseInt(stored, 10);
  }, []);

  useEffect(() => {
    const load = async () => {
      setMessagesLoading(true);
      // Try with corrections column; fall back to without it if the column doesn't exist yet
      let result = await supabase
        .from("sensei_messages")
        .select("id, role, content, timestamp, corrections")
        .eq("user_id", userId)
        .eq("persona", activePersona)
        .order("timestamp", { ascending: false })
        .limit(100);
      if (result.error?.message?.includes("corrections")) {
        result = await (supabase
          .from("sensei_messages")
          .select("id, role, content, timestamp")
          .eq("user_id", userId)
          .eq("persona", activePersona)
          .order("timestamp", { ascending: false })
          .limit(100) as any);
      }
      // Re-sort ascending for display (we fetched desc to get the latest 100)
      if (result.data) result = { ...result, data: [...result.data].reverse() };
      const { data, error } = result;

      const normalizeMsg = (m: any): Message => ({
        ...m,
        corrections: Array.isArray(m.corrections) ? m.corrections
          : typeof m.corrections === "string" ? (() => { try { return JSON.parse(m.corrections); } catch { return []; } })()
          : [],
      });
      const validMsg = (m: Message) => m && typeof m.content === "string" && m.content.length > 0;
      if (!error && data && data.length > 0) {
        const seen = new Set<string>();
        const loaded = (data as Message[]).map(normalizeMsg).filter(m => !seen.has(m.id) && seen.add(m.id)).filter(validMsg);
        setMessages(loaded);
        localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(loaded));
      } else {
        try {
          const saved = localStorage.getItem(chatStorageKey(activePersona));
          if (saved) {
            const parsed: Message[] = JSON.parse(saved).map(normalizeMsg).filter(validMsg);
            if (parsed.length > 0) {
              setMessages(parsed);
              supabase.from("sensei_messages").upsert(
                parsed.map((m) => ({ ...m, user_id: userId, persona: activePersona })),
                { onConflict: "id" }
              );
            } else {
              setMessages([]);
            }
          } else {
            setMessages([]);
          }
        } catch { setMessages([]); }
      }
      setMessagesLoading(false);
    };
    load().catch(e => { console.error("Message load error:", e); setMessagesLoading(false); });
  }, [userId, activePersona]);

  // ── Fetch weak cards once on mount ─────────────────────────────────────────
  useEffect(() => {
    const fetchWeak = async () => {
      const { data } = await supabase
        .from("user_scores")
        .select("scores_json, master_cards!card_id(japanese, reading, english)")
        .eq("user_id", userId)
        .limit(300);
      if (!data) return;
      const sorted = data
        .filter((s: any) => (s.scores_json?.jp_to_en?.total ?? 0) >= 3)
        .sort((a: any, b: any) => (a.scores_json?.jp_to_en?.percent ?? 100) - (b.scores_json?.jp_to_en?.percent ?? 100))
        .slice(0, 50);
      setWeakCards(sorted.map((s: any) => s.master_cards?.japanese).filter(Boolean));
      setWeakCardDetails(
        sorted
          .map((s: any) => ({
            japanese: s.master_cards?.japanese ?? "",
            reading: s.master_cards?.reading ?? "",
            english: s.master_cards?.english ?? "",
          }))
          .filter((c: any) => c.japanese)
      );
    };
    fetchWeak().catch(e => console.error("fetchWeak error:", e));
  }, [userId]);

  // Build the active scenario, injecting weak card details for drill mode
  const getActiveScenario = () => {
    const base = SCENARIOS.find(s => s.id === activeScenario);
    if (activeScenario === "drill") {
      const sample = weakCardDetails.length > 15
        ? [...weakCardDetails].sort(() => Math.random() - 0.5).slice(0, 15)
        : weakCardDetails;
      const cardList = sample.length > 0
        ? sample.map(c => `・${c.japanese}（${c.reading}）= ${c.english}`).join("\n")
        : "（まだ苦手な語彙がありません）";
      return {
        ...base,
        prompt: `今日はイマージョンモードです。以下はこの生徒の苦手語彙リストです：\n${cardList}\n\n【重要】これらの語彙を自然な会話の中でさりげなく使ってください。テスト・クイズ・「〜はどういう意味？」のような直接的な問いかけは絶対にしないこと。代わりに：\n- 自分の返答の中でこれらの単語を自然に使う（例文として会話に溶け込ませる）\n- これらの語彙が出てきそうな話題・質問を選ぶ\n- 生徒が自然にその言葉を使いたくなるような状況を作る\n通常の会話と同じように進め、生徒がドリル中だと気づかないくらい自然に。スコアや正解・不正解の評価は一切しない。`,
      };
    }
    return base;
  };

  // ── Auto-greeting when chat is empty ───────────────────────────────────────
  useEffect(() => {
    if (messagesLoading || messages.length > 0 || greetingFiredRef.current) return;
    greetingFiredRef.current = true;
    const sendGreeting = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [], profile, persona: activePersona, pendingWords: [], weakCards, greeting: true, scenario: getActiveScenario() }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.content) return;
        const greetMsg: Message = { id: uuid(), role: "model", content: data.content, timestamp: Date.now() };
        setMessages([greetMsg]);
        localStorage.setItem(chatStorageKey(activePersona), JSON.stringify([greetMsg]));
        supabase.from("sensei_messages").upsert({ ...greetMsg, user_id: userId, persona: activePersona }, { onConflict: "id" })
          .then(({ error }) => { if (error) console.error("[DB]", error.code, error.message); });
      } catch { /* silent — greeting is best-effort */ }
      finally { setLoading(false); }
    };
    sendGreeting();
  }, [messagesLoading, messages.length, activePersona]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages, loading]);

  // Keep sheetOpenRef in sync so the viewport effect can read it without a stale closure
  useEffect(() => { sheetOpenRef.current = !!tooltip; }, [tooltip]);

  // Debounced Jisho re-lookup when the user edits the word in the tooltip input
  useEffect(() => {
    const word = tooltip?.editWord?.trim();
    if (!word || !kanjiRe.test(word)) return;
    if (jishoDebounceRef.current) clearTimeout(jishoDebounceRef.current);
    jishoDebounceRef.current = setTimeout(() => {
      setTooltip(prev => prev ? { ...prev, jishoLoading: true, jishoMeanings: [], jlpt: [], isCommon: false } : prev);
      fetch(`/api/jisho?word=${encodeURIComponent(word)}`)
        .then(r => r.json())
        .then(d => setTooltip(prev => prev ? {
          ...prev,
          jishoLoading: false,
          reading: d.found ? d.reading : "",
          jishoMeanings: d.found ? d.meanings : [],
          jlpt: d.found ? d.jlpt : [],
          isCommon: d.found ? d.is_common : false,
        } : prev))
        .catch(() => setTooltip(prev => prev ? { ...prev, jishoLoading: false } : prev));
    }, 500);
    return () => { if (jishoDebounceRef.current) clearTimeout(jishoDebounceRef.current); };
  }, [tooltip?.editWord]);

  const WORD_LIST_KEY = `flashkado-word-list-${userId}`;

  useEffect(() => {
    supabase.from("profiles").select("pending_words").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[DB word-list load]", error.code, error.message);
        const dbWords: string[] | null = data?.pending_words ?? null;
        if (dbWords && dbWords.length > 0) {
          setWordList(dbWords);
          localStorage.setItem(WORD_LIST_KEY, JSON.stringify(dbWords));
        } else {
          // Fall back to localStorage if DB returned nothing
          try {
            const saved = localStorage.getItem(WORD_LIST_KEY);
            const parsed: string[] = saved ? JSON.parse(saved) : [];
            setWordList(parsed);
            if (parsed.length > 0) {
              supabase.from("profiles").update({ pending_words: parsed }).eq("id", userId)
                .then(({ error: e }) => { if (e) console.error("[DB word-list restore]", e.code, e.message); });
            }
          } catch { setWordList([]); }
        }
        wordListLoadedRef.current = true;
      });
  }, [userId]);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncWordList = useCallback((newList: string[]) => {
    setWordList(newList);
    localStorage.setItem(`flashkado-word-list-${userId}`, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
        .then(({ error }) => { if (error) console.error("[DB word-list sync]", error.code, error.message); });
    }, 1000);
  }, [userId]);

  // Track visual viewport so the layout stays above the keyboard on iOS + Android.
  // cancelAnimationFrame prevents layout thrash from rapid-fire resize events during keyboard animation.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !containerRef.current) return;
    let rafId: number;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        containerRef.current.style.height = `${vv.height}px`;
        containerRef.current.style.top = `${vv.offsetTop}px`;
        if (!sheetOpenRef.current) bottomRef.current?.scrollIntoView({ behavior: "instant" });
      });
    };
    vv.addEventListener("resize", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  useEffect(() => {
    supabase.from("sensei_profile").select("*").eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [userId]);

  // ── Profile update ──────────────────────────────────────────────────────────
  const updateProfile = async (allMessages: Message[]) => {
    const from = lastAnalyzedIndexRef.current;
    const newMessages = allMessages.slice(from);
    if (newMessages.length < 2) return;
    lastAnalyzedIndexRef.current = allMessages.length;
    try {
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, currentProfile: profile ?? {} }),
      });
      const updated: SenseiProfile = await res.json();
      setProfile(updated);
      supabase.from("sensei_profile").upsert([{ ...updated, user_id: userId }], { onConflict: "user_id" });
    } catch (e) {
      console.error("Profile update failed:", e);
      lastAnalyzedIndexRef.current = from;
    }
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || messagesLoading) return;

    const userMsg: Message = { id: uuid(), role: "user", content: text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(updated));
    supabase.from("sensei_messages").upsert({ ...userMsg, user_id: userId, persona: activePersona }, { onConflict: "id" })
      .then(({ error }) => { if (error) console.error("[DB]", error.code, error.message); });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated.slice(-20), profile, persona: activePersona, pendingWords: activeScenario === "drill" ? wordList : [], weakCards, scenario: getActiveScenario() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.content) throw new Error("Empty response");
      const modelMsg: Message = { id: uuid(), role: "model" as const, content: data.content, timestamp: Date.now() };
      // Attach grammar corrections to the user message that triggered them
      const corrections: string[] = data.corrections ?? [];
      const patchedUpdated: Message[] = corrections.length > 0
        ? [...updated.slice(0, -1), { ...updated[updated.length - 1], corrections }]
        : updated;
      const finalMessages: Message[] = [...patchedUpdated, modelMsg];
      setMessages(finalMessages);
      localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(finalMessages));
      supabase.from("sensei_messages").upsert({ ...modelMsg, user_id: userId, persona: activePersona }, { onConflict: "id" })
        .then(({ error }) => { if (error) console.error("[DB model]", error.code, error.message); });

      // Trim DB to latest 100 messages every 10 exchanges to avoid unbounded growth
      if (finalMessages.filter(m => m.role === "user").length % 10 === 0) {
        supabase.from("sensei_messages")
          .select("id, timestamp")
          .eq("user_id", userId)
          .eq("persona", activePersona)
          .order("timestamp", { ascending: false })
          .limit(200)
          .then(({ data: rows }) => {
            if (rows && rows.length > 100) {
              const toDelete = rows.slice(100).map((r: any) => r.id);
              supabase.from("sensei_messages").delete().in("id", toDelete);
            }
          });
      }
      if (corrections.length > 0) {
        const patchedUser = patchedUpdated[patchedUpdated.length - 1];
        supabase.from("sensei_messages").upsert({ ...patchedUser, user_id: userId, persona: activePersona }, { onConflict: "id" });
      }

      const exchangeCount = finalMessages.filter(m => m.role === "user").length;
      const unanalyzedCount = finalMessages.length - lastAnalyzedIndexRef.current;
      const msSinceLastUpdate = Date.now() - lastProfileUpdateRef.current;
      const cooldownOk = msSinceLastUpdate > 3 * 60 * 1000; // 3 minute cooldown
      if (cooldownOk && ((exchangeCount > 0 && exchangeCount % 8 === 0) || unanalyzedCount >= 24)) {
        lastProfileUpdateRef.current = Date.now();
        localStorage.setItem("sensei_profile_updated_at", String(lastProfileUpdateRef.current));
        updateProfile(finalMessages);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setErrorMsg(detail || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // ── Word tooltip ────────────────────────────────────────────────────────────
  const handleWordClick = useCallback((word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const tooltipH = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const y = spaceBelow > tooltipH ? rect.bottom + 8 : rect.top - tooltipH - 8;
    // Use Intl.Segmenter to extract the first kanji-containing word from the tapped segment.
    // "First" correctly handles both verb conjugations (食べてください → 食べ)
    // and greedy furigana phrases (今日も元気に日本語 → 今日).
    const extractWord = (text: string): string => {
      const seg = getSegmenter();
      if (!seg) return text;
      const first = [...seg.segment(text)].find(s => s.isWordLike && kanjiRe.test(s.segment));
      return first?.segment ?? text;
    };
    const editWord = extractWord(word);
    setTooltip({ word, reading, editWord, x: Math.min(rect.left, window.innerWidth - 260), y: Math.max(8, y), adding: false, knownEnglish: undefined, jishoLoading: true });

    // Supabase deck check
    (async () => {
      const { data: card } = await supabase.from("master_cards").select("id, english").eq("japanese", editWord).maybeSingle();
      if (!card) { setTooltip(prev => prev ? { ...prev, knownEnglish: null } : prev); return; }
      const { data: score } = await supabase.from("user_scores").select("id").eq("user_id", userId).eq("card_id", card.id).maybeSingle();
      setTooltip(prev => prev ? { ...prev, knownEnglish: score ? card.english : null } : prev);
    })();

    // Jisho + example lookup
    fetch(`/api/jisho?word=${encodeURIComponent(editWord)}`)
      .then(r => r.json())
      .then(d => setTooltip(prev => prev ? {
        ...prev,
        jishoLoading: false,
        reading: prev.reading || (d.found ? d.reading : ""),
        jishoMeanings: d.found ? d.meanings : [],
        jlpt: d.found ? d.jlpt : [],
        isCommon: d.found ? d.is_common : false,
        example: d.example ?? null,
      } : prev))
      .catch(() => setTooltip(prev => prev ? { ...prev, jishoLoading: false } : prev));
  }, [userId]);

  // ── Batch add ───────────────────────────────────────────────────────────────
  const addListToDeck = async (text: string) => {
    const words = [...new Set(text.split("\n").map(w => w.trim()).filter(Boolean))];
    if (!words.length || !defaultDeckId) return;
    setBatchAdding(true);

    const performLinking = async (cardIds: string[]) => {
      await Promise.all([
        supabase.from("deck_cards").upsert(cardIds.map(id => ({ deck_id: defaultDeckId, card_id: id })), { onConflict: "deck_id,card_id" }),
        supabase.from("user_scores").upsert(cardIds.map(id => ({ user_id: userId, card_id: id, scores_json: { jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 }, en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 } } })), { onConflict: "user_id,card_id" }),
      ]);
    };

    try {
      let allProcessed: any[] = [];
      const { data: existing } = await supabase.from("master_cards").select("*").in("japanese", words);
      if (existing?.length) { await performLinking(existing.map((c: any) => c.id)); allProcessed = [...existing]; }

      const existingSet = new Set(existing?.map((c: any) => c.japanese) ?? []);
      const wordsForAI = words.filter(w => !existingSet.has(w));

      if (wordsForAI.length > 0) {
        const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: wordsForAI }) });
        if (!res.ok) throw new Error("AI error");
        const items = await res.json();
        const itemsArray = Array.isArray(items) ? items : [items];
        const seen = new Set<string>();
        const deduped = itemsArray
          .map((item: any) => ({ japanese: String(item.japanese).trim(), reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""), english: String(item.english || "").trim(), partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(), exampleSentence: item.exampleSentence || { jp: "", en: "" }, creator_id: userId }))
          .filter((item: any) => { if (seen.has(item.japanese)) return false; seen.add(item.japanese); return true; });
        const { data: newCards, error: mErr } = await supabase.from("master_cards").upsert(deduped, { onConflict: "japanese" }).select("*");
        if (mErr) throw mErr;
        if (newCards?.length) { await performLinking(newCards.map((c: any) => c.id)); allProcessed = [...allProcessed, ...newCards]; }
      }

      syncWordList([]);
      setShowList(false);
      if (allProcessed.length > 0) {
        const deduped = Array.from(new Map(allProcessed.map(c => [c.japanese, c])).values());
        setAddedSummary(deduped);
        setShowSummary(true);

        // Update Sensei profile: append to vocabulary_introduced, keep recently_added as last 20
        const newWords = deduped.map((c: any) => c.japanese);
        setProfile((prev) => {
          const allVocab = [...new Set([...(prev?.vocabulary_introduced ?? []), ...newWords])];
          const recentlyAdded = [...new Set([...newWords, ...(prev?.recently_added ?? [])])].slice(0, 20);
          const updated = { ...(prev ?? {}), vocabulary_introduced: allVocab, recently_added: recentlyAdded };
          supabase.from("sensei_profile").upsert([{ ...updated, user_id: userId }], { onConflict: "user_id" });
          return updated;
        });
      }
    } catch (err) {
      console.error("Batch add failed:", err);
    } finally {
      setBatchAdding(false);
    }
  };


  // ── Clear chat for current persona ─────────────────────────────────────────
  const generateRecap = async () => {
    if (messages.length < 2) return;
    setRecapLoading(true);
    try {
      const res = await fetch("/api/chat-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error("Recap failed");
      setRecap(await res.json());
    } catch { setRecap({ error: true }); }
    finally { setRecapLoading(false); }
  };

  const clearChat = () => {
    if (confirm(`${persona.label}との会話履歴を全て削除しますか？`)) {
      setMessages([]);
      localStorage.removeItem(chatStorageKey(activePersona));
      supabase.from("sensei_messages").delete().eq("user_id", userId).eq("persona", activePersona);
    }
  };

  // ── Text-to-speech ─────────────────────────────────────────────────────────
  const speakMessage = (msgId: string, text: string) => {
    if (speakingId === msgId) {
      stopTTS();
      setSpeakingId(null);
      return;
    }
    const clean = text
      .replace(/\n?---CORRECTIONS---[\s\S]*?---END---/g, "")
      .replace(/[（(][ぁ-んァ-ンっーゃゅょ・]+[）)]/g, "")
      .replace(/\*+/g, "")
      .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
      .trim();
    setSpeakingId(msgId);
    playTTS(clean, "ja-JP", { onEnd: () => setSpeakingId(null) });
  };

  // ── Render message content ──────────────────────────────────────────────────
  const renderContent = (text: string, role: "user" | "model") => {
    if (role === "user") return <span>{text}</span>;
    try {

    const makeWordSpan = (word: string, reading: string, key: string) => (
      <span key={key} className="cursor-pointer active:opacity-60 transition-opacity"
        onClick={(e) => handleWordClick(word, reading, e)}
        onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const dx = Math.abs(e.changedTouches[0].clientX - start.x);
          const dy = Math.abs(e.changedTouches[0].clientY - start.y);
          if (dx < 8 && dy < 8) { e.preventDefault(); handleWordClick(word, reading, e as unknown as React.MouseEvent); }
        }}>
        {word.split("").map((ch, ci) =>
          kanjiRe.test(ch) ? <span key={ci} className="underline decoration-dotted decoration-indigo-400 underline-offset-2">{ch}</span> : ch
        )}
      </span>
    );

    // Render a plain text chunk through furigana + kanji-tapping
    const renderChunk = (chunk: string, kp: string): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      parseFurigana(chunk).forEach((seg, si) => {
        if (seg.type === "annotated") {
          nodes.push(makeWordSpan(seg.text, seg.reading, `${kp}-a${si}`));
        } else {
          const segmenter = getSegmenter();
          const subSegs = segmenter ? [...segmenter.segment(seg.text)] : [{ segment: seg.text, isWordLike: false }];
          subSegs.forEach((sub, subI) => {
            if (sub.isWordLike && kanjiRe.test(sub.segment)) {
              nodes.push(makeWordSpan(sub.segment, "", `${kp}-p${si}-${subI}`));
            } else {
              nodes.push(<span key={`${kp}-p${si}-${subI}`}>{sub.segment}</span>);
            }
          });
        }
      });
      return nodes;
    };

    // Render a line with inline **bold** support
    const renderInline = (line: string, kp: string): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      line.split(/(\*\*[^*]+\*\*)/).forEach((part, pi) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) {
          nodes.push(<strong key={`${kp}-b${pi}`}>{renderChunk(bold[1], `${kp}-b${pi}`)}</strong>);
        } else {
          renderChunk(part, `${kp}-t${pi}`).forEach(n => nodes.push(n));
        }
      });
      return nodes;
    };

    // Split into lines and handle bullet prefixes
    const lines = text.split("\n");
    return (
      <>
        {lines.map((line, li) => {
          const isBullet = /^[*•\-] /.test(line);
          const content = isBullet ? line.replace(/^[*•\-] /, "") : line;
          const addBreak = li < lines.length - 1;
          if (isBullet) {
            return (
              <span key={li} className="flex gap-1.5 items-baseline">
                <span className="text-indigo-400 shrink-0 font-bold">•</span>
                <span>{renderInline(content, `l${li}`)}{addBreak && <br />}</span>
              </span>
            );
          }
          return (
            <span key={li}>
              {renderInline(line, `l${li}`)}
              {addBreak && <br />}
            </span>
          );
        })}
      </>
    );
    } catch {
      // Fallback: render plain text so a bad message never crashes the app
      return <span>{text}</span>;
    }
  };

  return (
    <div ref={containerRef} className="fixed left-0 right-0 top-0 flex flex-col bg-slate-50" style={{ height: "100dvh" }}>

      {/* ── Persona selector ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Choose your sensei</p>
          <div className="flex items-center gap-1">
            {/* Session recap */}
            {recapConfirm ? (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500 font-bold">Recap?</span>
                <button onClick={() => { setRecapConfirm(false); generateRecap(); }}
                  className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 px-1.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors">Yes</button>
                <button onClick={() => setRecapConfirm(false)}
                  className="text-[11px] font-black text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded-lg hover:bg-slate-100 transition-colors">No</button>
              </div>
            ) : (
              <button onClick={() => setRecapConfirm(true)} disabled={recapLoading || messages.length < 2} title="Session recap"
                className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-xl transition-colors text-slate-300 hover:text-amber-500 hover:bg-amber-50 disabled:opacity-30">
                {recapLoading ? <Loader2 size={13} className="animate-spin" /> : <ScrollText size={13} />}
              </button>
            )}
            <button onClick={() => setShowList(true)} className="relative flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors px-2 py-1.5 rounded-xl hover:bg-indigo-50">
              <List size={13} />
              {wordList.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
              )}
            </button>
            <button onClick={() => setShowVoicePicker(true)} title="Change voice"
              className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-xl transition-colors text-slate-300 hover:text-violet-500 hover:bg-violet-50">
              <SlidersHorizontal size={13} />
            </button>
            <button onClick={clearChat} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-xl hover:bg-red-50">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Avatar row */}
        <div className="flex gap-3">
          {PERSONA_ORDER.map((key) => {
            const p = PERSONAS[key];
            const isActive = key === activePersona;
            return (
              <button key={key} onClick={() => switchPersona(key)}
                className={`flex flex-col items-center gap-1.5 flex-1 py-2 px-1 rounded-2xl transition-all active:scale-95 ${isActive ? `${p.bg} ring-2 ${p.ring}` : "hover:bg-slate-50"}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${isActive ? "bg-white shadow-sm" : "bg-slate-100"}`}>
                  {p.emoji}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tight leading-none ${isActive ? p.color : "text-slate-400"}`}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scenario pills */}
        <div className="flex gap-2 overflow-x-auto mt-2.5 pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveScenario(s.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                activeScenario === s.id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <span>{s.emoji}</span>
              <span>{s.labelEn}</span>
              {s.id === "drill" && weakCardDetails.length > 0 && (
                <span className={`text-[9px] font-black rounded-full px-1 ${activeScenario === "drill" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-500"}`}>
                  {weakCardDetails.length}
                </span>
              )}
            </button>
          ))}
        </div>

      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messagesLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={20} className="animate-spin text-slate-300" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">{persona.emoji}</div>
            <p className={`text-base font-black uppercase tracking-widest ${persona.color}`}>{persona.label}</p>
            <p className="text-xs text-slate-400 font-bold mt-1">{persona.desc}</p>
            <p className="text-[10px] text-slate-300 mt-3 uppercase tracking-widest">日本語で話しかけてください</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "model" && (
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 mr-2 mt-1 bg-white border border-slate-100 shadow-sm">
                    {persona.emoji}
                  </div>
                )}
                <div className="flex flex-col items-start gap-1">
                  <div className={`max-w-full rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-lg"
                      : "bg-white border border-slate-100 text-slate-800 shadow-sm rounded-bl-lg"
                  }`}>
                    {renderContent(
                      msg.role === "model"
                        ? msg.content.replace(/\n?---CORRECTIONS---[\s\S]*?---END---/g, "").trim()
                        : msg.content,
                      msg.role
                    )}
                  </div>
                  {msg.role === "model" && (
                    <button
                      onClick={() => speakMessage(msg.id, msg.content)}
                      className={`ml-1 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl transition-colors ${speakingId === msg.id ? "text-indigo-500 bg-indigo-50" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}>
                      {speakingId === msg.id ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      {speakingId === msg.id ? "Stop" : "Listen"}
                    </button>
                  )}
                </div>
              </div>
              {msg.role === "user" && Array.isArray(msg.corrections) && msg.corrections.length > 0 && (
                <div className="flex justify-end mt-1.5">
                  <div className="max-w-[85%] bg-rose-50 border border-rose-100 rounded-2xl rounded-tr-sm px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-2">📝 Grammar Note</p>
                    {msg.corrections.map((c, i) => (
                      <p key={i} className="text-xs text-rose-700 font-medium leading-relaxed">{c}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 mr-2 mt-1 bg-white border border-slate-100 shadow-sm">
              {persona.emoji}
            </div>
            <div className="bg-white border border-slate-100 shadow-sm rounded-3xl rounded-bl-lg px-5 py-4 flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Word tooltip (bottom sheet) ── */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setTooltip(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-2xl font-black text-slate-800">{tooltip.editWord}</div>
                  {tooltip.jlpt && tooltip.jlpt.length > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{tooltip.jlpt[0].toUpperCase()}</span>
                  )}
                  {tooltip.isCommon && (
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">common</span>
                  )}
                </div>
                <div className="text-sm text-indigo-500 font-bold mt-0.5">{tooltip.reading}</div>
                {tooltip.knownEnglish && (
                  <div className="mt-1 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    ✓ in your deck
                  </div>
                )}
              </div>
              <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 mt-1 shrink-0"><X size={16} /></button>
            </div>

            {/* Jisho meanings */}
            {tooltip.jishoLoading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                <Loader2 size={11} className="animate-spin" />
                <span>Looking up definition…</span>
              </div>
            )}
            {!tooltip.jishoLoading && tooltip.jishoMeanings && tooltip.jishoMeanings.length > 0 && (
              <div className="mb-3 pb-3 border-b border-slate-100">
                {tooltip.jishoMeanings.map((m, i) => (
                  <div key={i} className="mb-1">
                    {m.pos && <span className="text-[9px] text-slate-400 font-bold mr-1">{m.pos}</span>}
                    <span className="text-xs text-slate-700">{m.definition}</span>
                  </div>
                ))}
              </div>
            )}
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Word to add</label>
            <input
              type="text"
              value={tooltip.editWord}
              onChange={(e) => setTooltip((prev) => prev ? { ...prev, editWord: e.target.value } : prev)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="e.g. 食べる"
            />
            <button
              onClick={() => { const word = tooltip.editWord.trim(); if (word && !wordList.includes(word)) syncWordList([...wordList, word]); setTooltip(null); }}
              disabled={!tooltip.editWord.trim()}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40">
              <List size={11} /> Add to List
            </button>
          </div>
        </>
      )}

      {/* ── Error modal ── */}
      {errorMsg && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setErrorMsg(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-base font-black text-red-500">エラーが発生しました</div>
              <button onClick={() => setErrorMsg(null)} className="text-slate-300 hover:text-slate-500"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed break-all">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg(null)}
              className="mt-4 w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
              閉じる
            </button>
          </div>
        </>
      )}

      {/* ── Summary modal ── */}
      {showSummary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">Words Added</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{addedSummary.length} new {addedSummary.length === 1 ? "entry" : "entries"}</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {addedSummary.map((word, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                    <span className="text-indigo-600 font-black text-xl">{word.japanese[0]}</span>
                  </div>
                  <div className="flex-1 flex flex-col text-left">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-slate-800">{word.japanese}</span>
                      <span className="text-xs font-bold text-rose-500 uppercase tracking-tighter">{word.reading}</span>
                    </div>
                    <p className="text-sm text-slate-600 font-medium mt-0.5 leading-tight pr-10">{word.english}</p>
                    {word.partOfSpeech && <span className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md self-start">{word.partOfSpeech}</span>}
                  </div>
                  <button onClick={async () => {
                    await Promise.all([
                      supabase.from("deck_cards").delete().eq("deck_id", defaultDeckId).eq("card_id", word.id),
                      supabase.from("user_scores").delete().eq("card_id", word.id).eq("user_id", userId),
                    ]);
                    setAddedSummary(prev => prev.filter(c => c.id !== word.id));
                  }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowSummary(false)} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session recap modal ── */}
      {recap && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase italic tracking-tighter">Session Recap</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{persona.label} · {messages.filter(m => m.role === "user").length} exchanges</p>
              </div>
              <button onClick={() => setRecap(null)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            {recap.error ? (
              <p className="p-6 text-sm text-slate-400 text-center">Could not generate recap. Try again after a longer conversation.</p>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {recap.words_covered?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Words Covered</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recap.words_covered.map((w: string, i: number) => <span key={i} className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-xl">{w}</span>)}
                    </div>
                  </div>
                )}
                {recap.grammar_points?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Grammar Practiced</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recap.grammar_points.map((g: string, i: number) => <span key={i} className="bg-violet-50 text-violet-700 text-xs font-bold px-2.5 py-1 rounded-xl">{g}</span>)}
                    </div>
                  </div>
                )}
                {recap.corrections?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Corrections</p>
                    <div className="space-y-1.5">
                      {recap.corrections.map((c: string, i: number) => <p key={i} className="text-xs text-slate-600 bg-rose-50 px-3 py-2 rounded-xl font-medium">{c}</p>)}
                    </div>
                  </div>
                )}
                {recap.strong_moments?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Well Done</p>
                    <div className="space-y-1.5">
                      {recap.strong_moments.map((s: string, i: number) => <p key={i} className="text-xs text-slate-600 bg-emerald-50 px-3 py-2 rounded-xl font-medium">{s}</p>)}
                    </div>
                  </div>
                )}
                {recap.encouragement && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
                    <p className="text-sm text-amber-800 font-bold">{recap.encouragement}</p>
                  </div>
                )}
              </div>
            )}
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setRecap(null)} className="w-full py-3 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-700 transition-all active:scale-[0.98]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Voice picker modal ── */}
      {showVoicePicker && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase italic tracking-tighter">Voice</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Japanese TTS · affects all audio</p>
              </div>
              <button onClick={() => setShowVoicePicker(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {VOICE_OPTIONS.map((v) => {
                const isActive = selectedVoice === v.id;
                return (
                  <div key={v.id} onClick={() => { setSelectedVoice(v.id); setVoice(v.id); }}
                    className={`cursor-pointer rounded-2xl border-2 p-4 transition-all active:scale-95 ${isActive ? "border-violet-400 bg-violet-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                    <div className={`text-xs font-black uppercase tracking-widest ${isActive ? "text-violet-600" : "text-slate-700"}`}>{v.label}</div>
                    <div className={`text-[10px] font-bold mt-0.5 ${v.gender === "Female" ? "text-pink-500" : "text-blue-500"}`}>{v.gender}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{v.desc}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); playTTS("こんにちは！よろしくお願いします。", "ja-JP", { voice: v.id }); }}
                      className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-violet-600 transition-colors">
                      ▶ Preview
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="p-4 pt-0">
              <button onClick={() => setShowVoicePicker(false)} className="w-full py-3 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-700 transition-all active:scale-[0.98]">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Word list modal ── */}
      {showList && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase italic tracking-tighter">Word List</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{wordList.length} word{wordList.length !== 1 ? "s" : ""} · one per line</p>
              </div>
              <button onClick={() => setShowList(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="p-4">
              <textarea defaultValue={wordList.join("\n")}
                onChange={(e) => syncWordList(e.target.value.split("\n").map(w => w.trim()).filter(Boolean))}
                rows={8}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono"
                placeholder={"食べる\n勉強\n彼女\n…"} />
            </div>
            <div className="p-4 pt-0 flex gap-2">
              <button onClick={() => syncWordList([])} className="px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all">Clear</button>
              <button onClick={() => addListToDeck(wordList.join("\n"))} disabled={batchAdding || wordList.length === 0}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                {batchAdding ? <><Loader2 size={13} className="animate-spin" /> Adding…</> : <><Plus size={13} /> Add All to Deck</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="bg-white border-t border-slate-100 px-4 pt-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea ref={textareaRef} value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); sendMessage(); } }}
            placeholder="日本語で話しかけてください…"
            rows={1}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-colors overflow-y-auto"
            style={{ maxHeight: "10rem" }} />
          <button onClick={sendMessage} disabled={!input.trim() || loading || messagesLoading}
            className="bg-indigo-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-300 mt-2 font-medium uppercase tracking-widest">
          Tap underlined kanji · Add to deck
        </p>
      </div>
    </div>
  );
}
