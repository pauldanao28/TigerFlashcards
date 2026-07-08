"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Send, Trash2, X, Loader2, List, Plus } from "lucide-react";

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
}

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
  notes?: string;
}

interface Tooltip {
  word: string;
  reading: string;
  editWord: string;
  x: number;
  y: number;
  adding: boolean;
}

type Segment =
  | { type: "annotated"; text: string; reading: string }
  | { type: "plain"; text: string };

// ── Furigana parser ───────────────────────────────────────────────────────────
// Tappable if word STARTS with kanji — allows okurigana suffix (食べる, 頑張って).
// Rejects words where kana precedes kanji (お願い) or no kanji at all (ありがとう).
// Furigana parentheses are always stripped so they never appear in chat text.
function parseFurigana(text: string): Segment[] {
  const parts: Segment[] = [];
  const regex = /([^\s（(、。！？\n「」『』【】〔〕…・　]+)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g;
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
  const [activePersona, setActivePersona] = useState<PersonaKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(PERSONA_STORAGE_KEY) as PersonaKey | null;
      if (saved && PERSONA_ORDER.includes(saved)) return saved;
    }
    return "senpai";
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SenseiProfile | null>(null);
  const [wordList, setWordList] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);
  const [addedSummary, setAddedSummary] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const lastAnalyzedIndexRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastProfileUpdateRef = useRef(0);
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
    lastAnalyzedIndexRef.current = 0;
  };

  // ── Load messages for active persona ───────────────────────────────────���───
  useEffect(() => {
    const stored = localStorage.getItem("sensei_profile_updated_at");
    if (stored) lastProfileUpdateRef.current = parseInt(stored, 10);
  }, []);

  useEffect(() => {
    const load = async () => {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("sensei_messages")
        .select("id, role, content, timestamp")
        .eq("user_id", userId)
        .eq("persona", activePersona)
        .order("timestamp", { ascending: true });

      if (!error && data && data.length > 0) {
        const loaded = data as Message[];
        setMessages(loaded);
        localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(loaded));
      } else {
        try {
          const saved = localStorage.getItem(chatStorageKey(activePersona));
          if (saved) {
            const parsed: Message[] = JSON.parse(saved);
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
    load();
  }, [userId, activePersona]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Track visual viewport so the layout stays above the keyboard on iOS + Android
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !containerRef.current) return;
    const update = () => {
      if (!containerRef.current) return;
      containerRef.current.style.height = `${vv.height}px`;
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  useEffect(() => {
    supabase.from("sensei_profile").select("*").eq("user_id", userId).single()
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
    if (!text || loading) return;

    const userMsg: Message = { id: uuid(), role: "user", content: text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(updated));
    supabase.from("sensei_messages").insert({ ...userMsg, user_id: userId, persona: activePersona });
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated.slice(-20), profile, persona: activePersona }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.content) throw new Error("Empty response");
      const modelMsg: Message = { id: uuid(), role: "model" as const, content: data.content, timestamp: Date.now() };
      const finalMessages = [...updated, modelMsg];
      setMessages(finalMessages);
      localStorage.setItem(chatStorageKey(activePersona), JSON.stringify(finalMessages));
      supabase.from("sensei_messages").insert({ ...modelMsg, user_id: userId, persona: activePersona });

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
    const tooltipH = 170;
    const spaceBelow = window.innerHeight - rect.bottom;
    const y = spaceBelow > tooltipH ? rect.bottom + 8 : rect.top - tooltipH - 8;
    const editWord = word.replace(/^[ぁ-んァ-ヿ]+/, "") || word;
    setTooltip({ word, reading, editWord, x: Math.min(rect.left, window.innerWidth - 260), y: Math.max(8, y), adding: false });
  }, []);

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

      setWordList([]);
      setShowList(false);
      if (allProcessed.length > 0) {
        setAddedSummary(Array.from(new Map(allProcessed.map(c => [c.japanese, c])).values()));
        setShowSummary(true);
      }
    } catch (err) {
      console.error("Batch add failed:", err);
    } finally {
      setBatchAdding(false);
    }
  };


  // ── Clear chat for current persona ─────────────────────────────────────────
  const clearChat = () => {
    if (confirm(`${persona.label}との会話履歴を全て削除しますか？`)) {
      setMessages([]);
      localStorage.removeItem(chatStorageKey(activePersona));
      supabase.from("sensei_messages").delete().eq("user_id", userId).eq("persona", activePersona);
    }
  };

  // ── Render message content ──────────────────────────────────────────────────
  const renderContent = (text: string, role: "user" | "model") => {
    if (role === "user") return <span>{text}</span>;
    const segments = parseFurigana(text);
    return (
      <>
        {segments.map((seg, i) => {
          if (seg.type !== "annotated") return <span key={i}>{seg.text}</span>;
          const isKanji = (ch: string) => /[一-龯㐀-䶿々〻]/.test(ch);
          return (
            <span key={i} className="cursor-pointer active:opacity-60 transition-opacity"
              onClick={(e) => handleWordClick(seg.text, seg.reading, e)}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); handleWordClick(seg.text, seg.reading, e as unknown as React.MouseEvent); }
              }}>
              {seg.text.split("").map((ch, ci) =>
                isKanji(ch) ? <span key={ci} className="underline decoration-dotted decoration-indigo-400 underline-offset-2">{ch}</span> : ch
              )}
            </span>
          );
        })}
      </>
    );
  };

  return (
    <div ref={containerRef} className="fixed left-0 right-0 top-0 flex flex-col bg-slate-50" style={{ height: "100dvh" }}>

      {/* ── Persona selector ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Choose your sensei</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowList(true)} className="relative flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors px-2 py-1.5 rounded-xl hover:bg-indigo-50">
              <List size={13} />
              {wordList.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
              )}
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
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "model" && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 mr-2 mt-1 bg-white border border-slate-100 shadow-sm">
                  {persona.emoji}
                </div>
              )}
              <div className={`max-w-[80%] rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-lg"
                  : "bg-white border border-slate-100 text-slate-800 shadow-sm rounded-bl-lg"
              }`}>
                {renderContent(msg.content, msg.role)}
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
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setTooltip(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-2xl font-black text-slate-800">{tooltip.editWord}</div>
                <div className="text-sm text-indigo-500 font-bold mt-0.5">{tooltip.reading}</div>
              </div>
              <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 mt-1"><X size={16} /></button>
            </div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Word to add</label>
            <input
              type="text"
              value={tooltip.editWord}
              onChange={(e) => setTooltip((prev) => prev ? { ...prev, editWord: e.target.value } : prev)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="e.g. 食べる"
              autoFocus
            />
            <button
              onClick={() => { const word = tooltip.editWord.trim(); if (word && !wordList.includes(word)) setWordList(prev => [...prev, word]); setTooltip(null); }}
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
                onChange={(e) => setWordList(e.target.value.split("\n").map(w => w.trim()).filter(Boolean))}
                rows={8}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono"
                placeholder={"食べる\n勉強\n彼女\n…"} />
            </div>
            <div className="p-4 pt-0 flex gap-2">
              <button onClick={() => setWordList([])} className="px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all">Clear</button>
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="日本語で話しかけてください…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all max-h-40 overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
          <button onClick={sendMessage} disabled={!input.trim() || loading}
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
