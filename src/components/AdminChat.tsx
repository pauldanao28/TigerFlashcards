"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Send, Trash2, X, Loader2, List, Plus, Volume2, VolumeX, BookOpen, SlidersHorizontal, ChevronLeft } from "lucide-react";
import { speak, playTTS, stopTTS, getVoice, setVoice, VOICE_OPTIONS, VoiceId } from "@/lib/tts";

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

const CONFIRM_COPY: Record<"back" | "sync" | "quiz", { title: string; body: string; action: string }> = {
  back: { title: "Leave the chat?", body: "You'll return to the home screen. Your conversation is saved.", action: "Leave" },
  sync: { title: "Sync your profile?", body: "Sensei will re-read this conversation to update what it knows about you.", action: "Sync" },
  quiz: { title: "Start the grammar quiz?", body: "A short quiz based on your recent mistakes and profile.", action: "Start" },
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
  personal_facts?: string[];
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
  compounds?: { word: string; reading: string; meaning: string; jlpt: string[]; is_common: boolean }[];
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
  const router = useRouter();
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
  const [confirmAction, setConfirmAction] = useState<"back" | "sync" | "quiz" | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>(() => getVoice());
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  type QuizQuestion =
    | { type: "grammar";  sentence: string; blank_hint: string; choices: string[]; answer: string; explanation: string }
    | { type: "reading";  japanese: string; choices: string[]; answer: string; explanation: string }
    | { type: "writing";  english: string; answer: string; hint?: string; explanation: string };
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizWritingInput, setQuizWritingInput] = useState("");
  const [quizWritingSubmitted, setQuizWritingSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [quizWrong, setQuizWrong] = useState<{ mistake: string; correct: string; reason: string }[]>([]);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSynced, setProfileSynced] = useState<"ok" | "err" | false>(false);
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
      let result = await supabase
        .from("sensei_messages")
        .select("id, role, content, timestamp")
        .eq("user_id", userId)
        .eq("persona", activePersona)
        .order("timestamp", { ascending: false })
        .limit(100);
      if (result.data) result = { ...result, data: [...result.data].reverse() };
      const { data, error } = result;

      const normalizeMsg = (m: any): Message => ({
        ...m,
        content: m.role === "model" ? cleanContent(m.content ?? "") : (m.content ?? ""),
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
        .slice(0, 20);
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
      const sample = weakCardDetails.length > 20
        ? [...weakCardDetails].sort(() => Math.random() - 0.5).slice(0, 20)
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
        const greetMsg: Message = { id: uuid(), role: "model", content: cleanContent(data.content), timestamp: Date.now() };
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

  // Cancel any pending debounce and write immediately — used when closing the list panel
  // so a quick close right after typing can't lose the edit.
  const flushWordList = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    supabase.from("profiles").update({ pending_words: wordList }).eq("id", userId)
      .then(({ error }) => { if (error) console.error("[DB word-list flush]", error.code, error.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, wordList]);

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
    const newMessages = allMessages.slice(from).slice(-30);
    if (newMessages.length < 2) return;
    lastAnalyzedIndexRef.current = allMessages.length;
    try {
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, currentProfile: profile ?? {} }),
      });
      const data = await res.json();
      const { corrections, ...updated } = data as SenseiProfile & { corrections?: { mistake: string; correct: string; reason: string }[] };
      setProfile(updated as SenseiProfile);
      supabase.from("sensei_profile").upsert([{ ...updated, user_id: userId }], { onConflict: "user_id" })
        .then(({ error }) => { if (error) console.error("[sensei_profile upsert]", error.code, error.message, error.details); });
      if (Array.isArray(corrections) && corrections.length > 0) {
        supabase.from("grammar_corrections").insert(
          corrections.map(c => ({ user_id: userId, persona: activePersona, mistake: c.mistake, correct: c.correct, reason: c.reason }))
        ).then(({ error }) => { if (error) console.error("[grammar_corrections sync]", error.code, error.message); });
      }
    } catch (e) {
      console.error("Profile update failed:", e);
      lastAnalyzedIndexRef.current = from;
    }
  };

  const syncProfile = async () => {
    if (profileSyncing || messages.length < 2) return;
    setProfileSyncing(true);
    try {
      await updateProfile(messages);
      setProfileSynced("ok");
    } catch {
      setProfileSynced("err");
    } finally {
      setProfileSyncing(false);
      setTimeout(() => setProfileSynced(false), 2500);
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
      const modelMsg: Message = { id: uuid(), role: "model" as const, content: cleanContent(data.content), timestamp: Date.now() };
      const finalMessages: Message[] = [...messages, userMsg, modelMsg];
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

    // Jisho lookup — compounds mode for single kanji, full lookup otherwise
    const isSingleKanji = editWord.length === 1 && kanjiRe.test(editWord);
    const jishoUrl = isSingleKanji
      ? `/api/jisho?word=${encodeURIComponent(editWord)}&compounds=true`
      : `/api/jisho?word=${encodeURIComponent(editWord)}`;
    fetch(jishoUrl)
      .then(r => r.json())
      .then(d => setTooltip(prev => prev ? {
        ...prev,
        jishoLoading: false,
        ...(isSingleKanji
          ? { compounds: d.compounds ?? [] }
          : {
              reading: prev.reading || (d.found ? d.reading : ""),
              jishoMeanings: d.found ? d.meanings : [],
              jlpt: d.found ? d.jlpt : [],
              isCommon: d.found ? d.is_common : false,
              example: d.example ?? null,
            }),
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

  const openQuiz = async () => {
    setShowQuiz(true);
    setQuizLoading(true);
    setQuizQuestions([]);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizScore(0);
    setQuizDone(false);
    setQuizWrong([]);
    setQuizWritingInput("");
    setQuizWritingSubmitted(false);
    try {
      const { data: mistakes } = await supabase
        .from("grammar_corrections")
        .select("mistake, correct, reason")
        .eq("user_id", userId)
        .limit(20);
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, recentMistakes: mistakes ?? [] }),
      });
      const data = await res.json();
      if (Array.isArray(data.questions)) setQuizQuestions(data.questions);
    } catch {}
    setQuizLoading(false);
  };

  const clearChat = () => {
    if (confirm(`${persona.label}との会話履歴を全て削除しますか？`)) {
      setMessages([]);
      localStorage.removeItem(chatStorageKey(activePersona));
      supabase.from("sensei_messages").delete().eq("user_id", userId).eq("persona", activePersona);
    }
  };

  // ── Content cleanup (strips old ---CORRECTIONS--- blocks and raw JSON wrapper) ─
  const cleanContent = (text: string): string => {
    let s = text.trim();
    for (let i = 0; i < 4; i++) {
      if (!s.startsWith("{")) break;
      // 1. Try direct JSON parse
      try {
        const p = JSON.parse(s);
        if (typeof p?.content === "string") { s = p.content.trim(); continue; }
      } catch {}
      // 2. JSON.parse failed (e.g. unescaped newlines) — sanitize and retry
      try {
        const sanitized = s.replace(/[\x00-\x1F\x7F]/g, (c) => {
          if (c === "\n") return "\\n";
          if (c === "\r") return "\\r";
          if (c === "\t") return "\\t";
          return "";
        });
        const p = JSON.parse(sanitized);
        if (typeof p?.content === "string") {
          s = p.content.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim();
          continue;
        }
      } catch {}
      // 3. Regex fallback — extract "content":"..." even from totally malformed JSON
      const m = s.match(/"content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);
      if (m) {
        try { s = JSON.parse('"' + m[1] + '"').trim(); } catch { s = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim(); }
        continue;
      }
      break;
    }
    return s.replace(/\n?---CORRECTIONS---[\s\S]*?---END---/g, "").trim();
  };

  // ── Text-to-speech ─────────────────────────────────────────────────────────
  const ttsClean = (text: string) =>
    cleanContent(text)
      .replace(/[（(][ぁ-んァ-ンっーゃゅょ・]+[）)]/g, "")
      .replace(/\*+/g, "")
      .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
      .trim();

  const speakMessage = (msgId: string, text: string) => {
    if (speakingId?.startsWith(msgId)) {
      stopTTS();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msgId);
    playTTS(ttsClean(text), "ja-JP", { onEnd: () => setSpeakingId(null) });
  };

  // ── Render message content ──────────────────────────────────────────────────
  const renderContent = (text: string, role: "user" | "model", msgId?: string) => {
    if (role === "user") return <span>{text}</span>;
    try {

    const makeWordSpan = (word: string, reading: string, key: string) => (
      <span key={key} className="cursor-pointer active:opacity-60 transition-opacity"
        onClick={(e) => { e.stopPropagation(); handleWordClick(word, reading, e); }}
        onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const dx = Math.abs(e.changedTouches[0].clientX - start.x);
          const dy = Math.abs(e.changedTouches[0].clientY - start.y);
          if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); handleWordClick(word, reading, e as unknown as React.MouseEvent); }
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

    // Split a text chunk into sentences at 。！？… boundaries
    const splitSentences = (s: string): string[] => {
      const result: string[] = [];
      let cur = "";
      for (const ch of s) {
        cur += ch;
        if ("。！？…".includes(ch)) { result.push(cur); cur = ""; }
      }
      if (cur.trim()) result.push(cur);
      return result.length > 0 ? result : [s];
    };

    // Wrap a sentence in a tappable span (if msgId provided)
    const wrapSentence = (nodes: React.ReactNode[], sent: string, sentId: string) => {
      if (!msgId) return <span key={sentId}>{nodes}</span>;
      const fullId = `${msgId}-${sentId}`;
      const playing = speakingId === fullId;
      return (
        <span key={sentId}
          className={`rounded transition-colors ${playing ? "bg-indigo-50 text-indigo-700" : "active:bg-slate-100"}`}
          onClick={() => {
            if (playing) { stopTTS(); setSpeakingId(null); return; }
            stopTTS();
            const clean = sent.replace(/[（(][ぁ-んァ-ンっーゃゅょ・]+[）)]/g, "").replace(/\*+/g, "").trim();
            setSpeakingId(fullId);
            playTTS(clean, "ja-JP", { onEnd: () => setSpeakingId(null) });
          }}>
          {nodes}
        </span>
      );
    };

    // Split into lines and handle bullet prefixes
    const lines = text.split("\n");
    return (
      <>
        {lines.map((line, li) => {
          const isBullet = /^[*•\-] /.test(line);
          const content = isBullet ? line.replace(/^[*•\-] /, "") : line;
          const addBreak = li < lines.length - 1;
          const sentences = splitSentences(content);
          const rendered = sentences.map((sent, si) =>
            wrapSentence(renderInline(sent, `l${li}-s${si}`), sent, `${li}-${si}`)
          );
          if (isBullet) {
            return (
              <span key={li} className="flex gap-1.5 items-baseline">
                <span className="text-indigo-400 shrink-0 font-bold">•</span>
                <span>{rendered}{addBreak && <br />}</span>
              </span>
            );
          }
          return (
            <span key={li}>
              {rendered}
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
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmAction("back")} className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all">
              <ChevronLeft size={14} />
              <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* Manual profile sync */}
            <button onClick={() => setConfirmAction("sync")} disabled={profileSyncing || messages.length < 2} title="Sync profile"
              className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-xl transition-colors disabled:opacity-30 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50">
              {profileSyncing
                ? <Loader2 size={13} className="animate-spin text-emerald-500" />
                : profileSynced === "ok"
                  ? <span className="text-[11px] font-black text-emerald-500">✓</span>
                  : profileSynced === "err"
                    ? <span className="text-[11px] font-black text-red-400">✕</span>
                    : <BookOpen size={13} />}
            </button>
            <button onClick={() => setShowList(true)} className="relative flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors px-2 py-1.5 rounded-xl hover:bg-indigo-50">
              <List size={13} />
              {wordList.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
              )}
            </button>
            {/* Grammar quiz */}
            <button onClick={() => setConfirmAction("quiz")} title="Grammar quiz"
              className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-xl transition-colors text-slate-300 hover:text-emerald-500 hover:bg-emerald-50">
              <span className="text-[13px]">📝</span>
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
                      msg.role === "model" ? cleanContent(msg.content) : msg.content,
                      msg.role,
                      msg.role === "model" ? msg.id : undefined
                    )}
                  </div>
                  {msg.role === "model" && (
                    <button
                      onClick={() => speakMessage(msg.id, msg.content)}
                      className={`ml-1 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl transition-colors ${speakingId?.startsWith(msg.id) ? "text-indigo-500 bg-indigo-50" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}>
                      {speakingId?.startsWith(msg.id) ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      {speakingId?.startsWith(msg.id) ? "Stop" : "Listen"}
                    </button>
                  )}
                </div>
              </div>
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
          <div className="fixed inset-0 z-[350] bg-black/20" onClick={() => setTooltip(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-[360] bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
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
                  <button onClick={() => speak(tooltip.editWord, "ja-JP")}
                    className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-50">
                    <Volume2 size={11} /> Listen
                  </button>
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

            {/* Jisho lookup results */}
            {tooltip.jishoLoading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                <Loader2 size={11} className="animate-spin" />
                <span>Looking up…</span>
              </div>
            )}
            {/* Compound words for single kanji */}
            {!tooltip.jishoLoading && tooltip.compounds && tooltip.compounds.length > 0 && (
              <div className="mb-3 pb-3 border-b border-slate-100">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Words using 「{tooltip.editWord}」</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {tooltip.compounds.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-black text-slate-800">{c.word}</span>
                        <span className="text-xs text-indigo-500 font-bold ml-1.5">{c.reading}</span>
                        {c.jlpt?.[0] && <span className="ml-1.5 bg-amber-100 text-amber-700 text-[8px] font-black px-1 py-0.5 rounded-full">{c.jlpt[0].toUpperCase()}</span>}
                        <p className="text-[10px] text-slate-500 truncate">{c.meaning}</p>
                      </div>
                      <button
                        onClick={() => { if (!wordList.includes(c.word)) syncWordList([...wordList, c.word]); }}
                        disabled={wordList.includes(c.word)}
                        className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors active:scale-95 ${wordList.includes(c.word) ? "bg-emerald-50 text-emerald-600 cursor-default" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                        {wordList.includes(c.word) ? "Added" : "+ Add"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Regular word meanings */}
            {!tooltip.jishoLoading && !tooltip.compounds?.length && tooltip.jishoMeanings && tooltip.jishoMeanings.length > 0 && (
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

      {/* ── Action confirmation modal ── */}
      {confirmAction && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmAction(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-slate-800 mb-1">{CONFIRM_COPY[confirmAction].title}</p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">{CONFIRM_COPY[confirmAction].body}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all">
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action === "back") router.push("/");
                  else if (action === "sync") syncProfile();
                  else if (action === "quiz") openQuiz();
                }}
                className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm">
                {CONFIRM_COPY[confirmAction].action}
              </button>
            </div>
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

      {/* ── Grammar Quiz (full-screen) ── */}
      {showQuiz && (
        <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-base">📝</span>
              <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Grammar Quiz</span>
              {!quizLoading && quizQuestions.length > 0 && !quizDone && (
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 ml-1">
                  {quizIndex + 1} / {quizQuestions.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowList(true)} className="relative p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
                <List size={16} className="text-slate-500" />
                {wordList.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
                )}
              </button>
              <button onClick={() => setShowQuiz(false)} className="p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
          </div>

          {/* Loading */}
          {quizLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Generating quiz…</p>
            </div>
          )}

          {/* Error */}
          {!quizLoading && quizQuestions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
              <span className="text-5xl">😓</span>
              <p className="text-slate-600 font-bold text-sm">Failed to generate quiz.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowQuiz(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
                  Close
                </button>
                <button onClick={openQuiz} className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {!quizLoading && quizDone && (() => {
            const pct = quizScore / quizQuestions.length;
            return (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full">
                <div className="text-center mb-8">
                  <div className="text-6xl mb-4">{pct >= 0.8 ? "🏆" : pct >= 0.5 ? "💪" : "📚"}</div>
                  <h2 className="text-4xl font-black text-slate-900 mb-1">
                    {quizScore}<span className="text-slate-300 font-bold text-2xl"> / {quizQuestions.length}</span>
                  </h2>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-1">
                    {Math.round(pct * 100)}% correct · {pct >= 0.8 ? "Excellent!" : pct >= 0.5 ? "Good work!" : "Keep practicing!"}
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setShowQuiz(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                    Done
                  </button>
                  <button onClick={openQuiz}
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">
                    Try Again
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Questions */}
          {!quizLoading && !quizDone && quizQuestions.length > 0 && (() => {
            const q = quizQuestions[quizIndex];
            const isLast = quizIndex + 1 >= quizQuestions.length;
            const advance = (wrong?: { mistake: string; correct: string; reason: string }) => {
              const nextWrong = wrong ? [...quizWrong, wrong] : quizWrong;
              if (wrong) setQuizWrong(nextWrong);
              if (isLast) {
                setQuizDone(true);
                if (nextWrong.length > 0) {
                  supabase.from("grammar_corrections").insert(
                    nextWrong.map(w => ({ user_id: userId, persona: activePersona, mistake: w.mistake, correct: w.correct, reason: w.reason }))
                  );
                }
              } else {
                setQuizIndex(i => i + 1);
                setQuizSelected(null);
                setQuizWritingInput("");
                setQuizWritingSubmitted(false);
              }
            };
            const advanceBtn = (wrong?: { mistake: string; correct: string; reason: string }) => (
              <button onClick={() => advance(wrong)} className="w-full py-4 bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
                {isLast ? "See Results" : "Next →"}
              </button>
            );

            return (
              <div className="flex-1 flex flex-col px-5 py-5 max-w-lg mx-auto w-full min-h-0 overflow-y-auto">
                {/* Progress bar */}
                <div className="mb-5 shrink-0">
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${(quizIndex / quizQuestions.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* ── Grammar: fill-in-the-blank ── */}
                {q.type === "grammar" && (() => {
                  const answered = quizSelected !== null;
                  const isCorrect = quizSelected === q.answer;
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-3">Fill in the blank</p>
                        {q.blank_hint && <p className="text-[11px] text-slate-400 font-bold mb-2">{renderContent(q.blank_hint, "model")}</p>}
                        <p className="text-xl leading-relaxed text-slate-800 font-medium">{renderContent(q.sentence, "model")}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {q.choices.map((choice) => {
                          let style = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";
                          if (answered) {
                            if (choice === q.answer) style = "bg-emerald-50 border-emerald-400 text-emerald-700";
                            else if (choice === quizSelected) style = "bg-red-50 border-red-400 text-red-700";
                            else style = "bg-white border-slate-200 text-slate-400";
                          }
                          return (
                            <button key={choice}
                              onClick={(e) => { if ((e.target as HTMLElement).closest("[data-word]")) return; if (!answered) { setQuizSelected(choice); if (choice === q.answer) setQuizScore(s => s + 1); } }}
                              className={`px-4 py-4 rounded-2xl border-2 text-sm font-black transition-all ${style}`}>
                              {renderContent(choice, "model")}
                            </button>
                          );
                        })}
                      </div>
                      {answered && (
                        <div className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                          <p className="font-black mb-1">{isCorrect ? "✓ Correct!" : <span>✗ Answer: {renderContent(q.answer, "model")}</span>}</p>
                          <p className="text-xs leading-relaxed">{renderContent(q.explanation, "model")}</p>
                        </div>
                      )}
                      {answered && advanceBtn(isCorrect ? undefined : { mistake: quizSelected!, correct: q.answer, reason: q.sentence })}
                    </div>
                  );
                })()}

                {/* ── Reading: JP → EN translation ── */}
                {q.type === "reading" && (() => {
                  const answered = quizSelected !== null;
                  const isCorrect = quizSelected === q.answer;
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mb-3">Translate to English</p>
                        <p className="text-xl leading-relaxed text-slate-800 font-medium">{renderContent(q.japanese, "model")}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {q.choices.map((choice) => {
                          let style = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-left";
                          if (answered) {
                            if (choice === q.answer) style = "bg-emerald-50 border-emerald-400 text-emerald-700 text-left";
                            else if (choice === quizSelected) style = "bg-red-50 border-red-400 text-red-700 text-left";
                            else style = "bg-white border-slate-200 text-slate-400 text-left";
                          }
                          return (
                            <button key={choice} disabled={answered}
                              onClick={() => { setQuizSelected(choice); if (choice === q.answer) setQuizScore(s => s + 1); }}
                              className={`px-4 py-4 rounded-2xl border-2 text-sm font-bold transition-all ${style}`}>
                              {choice}
                            </button>
                          );
                        })}
                      </div>
                      {answered && (
                        <div className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                          <p className="font-black mb-1">{isCorrect ? "✓ Correct!" : `✗ Answer: ${q.answer}`}</p>
                          <p className="text-xs leading-relaxed">{renderContent(q.explanation, "model")}</p>
                        </div>
                      )}
                      {answered && advanceBtn(isCorrect ? undefined : { mistake: quizSelected!, correct: q.answer, reason: q.japanese })}
                    </div>
                  );
                })()}

                {/* ── Writing: EN → JP free text + self-grade ── */}
                {q.type === "writing" && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-3">Write in Japanese</p>
                      <p className="text-xl leading-relaxed text-slate-800 font-medium">{q.english}</p>
                      {q.hint && <p className="text-[11px] text-amber-600 font-bold mt-3">💡 {renderContent(q.hint, "model")}</p>}
                    </div>
                    {!quizWritingSubmitted ? (
                      <>
                        <textarea
                          value={quizWritingInput}
                          onChange={e => setQuizWritingInput(e.target.value)}
                          placeholder="日本語で書いてください..."
                          rows={3}
                          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-amber-400 resize-none bg-white"
                        />
                        <button
                          disabled={!quizWritingInput.trim()}
                          onClick={() => setQuizWritingSubmitted(true)}
                          className="w-full py-4 bg-amber-500 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all disabled:opacity-40">
                          Check Answer
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Model answer</p>
                          <p className="text-base font-bold text-slate-800">{renderContent(q.answer, "model")}</p>
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{renderContent(q.explanation, "model")}</p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Did you get it right?</p>
                        <div className="flex gap-3">
                          <button onClick={() => { setQuizScore(s => s + 1); advance(); }}
                            className="flex-1 py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black border-b-4 border-emerald-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest">
                            ✓ Got it
                          </button>
                          <button onClick={() => advance({ mistake: quizWritingInput, correct: q.answer, reason: q.english })}
                            className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest">
                            ✗ Missed
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
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
              <button onClick={() => { flushWordList(); setShowList(false); }} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
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
