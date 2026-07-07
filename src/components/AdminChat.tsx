"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Send, Trash2, Plus, X, Loader2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: number;
}

interface Tooltip {
  word: string;
  reading: string;        // Always available instantly — parsed from （ふりがな）
  meaning: string | null; // Fetched async from word-info API
  loadingMeaning: boolean;
  x: number;
  y: number;
  added: boolean;
  adding: boolean;
}

// Segment types after parsing Gemini's 漢字（ふりがな） format
type Segment =
  | { type: "annotated"; text: string; reading: string }
  | { type: "plain"; text: string };

const STORAGE_KEY = "flashkado-sensei-chat";

// Parses text like "今日（きょう）はいい天気（てんき）ですね" into segments.
// Supports both full-width （）and half-width () parentheses.
function parseFurigana(text: string): Segment[] {
  const parts: Segment[] = [];
  // Match: non-whitespace/non-bracket word followed by （kana-only reading）
  const regex = /([^\s（(、。！？\n「」『』【】〔〕…・　]+)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "plain", text: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "annotated", text: match[1], reading: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "plain", text: text.slice(lastIndex) });
  }
  return parts;
}

export default function AdminChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  // Cache meanings so we don't re-fetch the same word
  const [meaningCache, setMeaningCache] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fetch user's default deck ID once
  useEffect(() => {
    supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  // Dismiss tooltip on outside click
  useEffect(() => {
    const handler = () => setTooltip(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated.slice(-20) }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "model",
          content: data.content || "エラーが発生しました。",
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "model",
          content: "エラーが発生しました。もう一度試してください。",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleWordClick = useCallback(
    async (word: string, reading: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = Math.min(rect.left, window.innerWidth - 280);
      const y = rect.bottom + window.scrollY + 8;

      // Show tooltip immediately with the reading already known
      const cachedMeaning = meaningCache[word] ?? null;
      setTooltip({
        word,
        reading,
        meaning: cachedMeaning,
        loadingMeaning: !cachedMeaning,
        x,
        y,
        added: false,
        adding: false,
      });

      // Fetch meaning in background if not cached
      if (!cachedMeaning) {
        try {
          const res = await fetch("/api/word-info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word }),
          });
          const data = await res.json();
          const meaning = data.meaning || "";
          setMeaningCache((prev) => ({ ...prev, [word]: meaning }));
          setTooltip((prev) =>
            prev?.word === word ? { ...prev, meaning, loadingMeaning: false } : prev
          );
        } catch {
          setTooltip((prev) =>
            prev?.word === word ? { ...prev, loadingMeaning: false } : prev
          );
        }
      }
    },
    [meaningCache]
  );

  const addWordToDeck = async () => {
    if (!tooltip || !defaultDeckId) return;
    setTooltip((prev) => prev ? { ...prev, adding: true } : prev);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: [tooltip.word] }),
      });
      const cards = await res.json();
      if (!cards?.[0]) throw new Error("No card data");

      const { data: upserted, error } = await supabase
        .from("master_cards")
        .upsert([{ ...cards[0], creator_id: userId, is_public: false }], { onConflict: "japanese" })
        .select("id")
        .single();

      if (error) throw error;

      await Promise.all([
        supabase.from("deck_cards").upsert(
          [{ deck_id: defaultDeckId, card_id: upserted.id }],
          { onConflict: "deck_id,card_id" }
        ),
        supabase.from("user_scores").upsert(
          [{
            user_id: userId,
            card_id: upserted.id,
            scores_json: {
              jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
              en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
            },
          }],
          { onConflict: "user_id,card_id" }
        ),
      ]);

      setTooltip((prev) => prev ? { ...prev, adding: false, added: true } : prev);
    } catch (err) {
      console.error("Add to deck failed:", err);
      setTooltip((prev) => prev ? { ...prev, adding: false } : prev);
    }
  };

  const clearChat = () => {
    if (confirm("会話履歴を全て削除しますか？")) {
      setMessages([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const renderContent = (text: string, role: "user" | "model") => {
    if (role === "user") return <span>{text}</span>;

    const segments = parseFurigana(text);
    return (
      <>
        {segments.map((seg, i) =>
          seg.type === "annotated" ? (
            <span
              key={i}
              className="cursor-pointer rounded px-0.5 transition-colors underline decoration-dotted decoration-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              onClick={(e) => handleWordClick(seg.text, seg.reading, e)}
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">
            先生 · Sensei
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Japanese Language Partner · Admin Only
          </p>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50"
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">先生</div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              日本語で話しかけてください
            </p>
            <p className="text-xs text-slate-300 mt-2">
              Tap any underlined kanji word to see its reading · meaning · add to deck
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-lg"
                  : "bg-white border border-slate-100 text-slate-800 shadow-sm rounded-bl-lg"
              }`}
            >
              {renderContent(msg.content, msg.role)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm rounded-3xl rounded-bl-lg px-5 py-4 flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Word tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 min-w-[190px] max-w-[260px]"
          style={{ left: tooltip.x, top: tooltip.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xl font-black text-slate-800">{tooltip.word}</div>
              {/* Reading is always instant — no loading state */}
              <div className="text-sm text-indigo-600 font-bold mt-0.5">{tooltip.reading}</div>
              {/* Meaning loads async */}
              {tooltip.loadingMeaning ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <Loader2 size={11} className="animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">Loading meaning…</span>
                </div>
              ) : tooltip.meaning ? (
                <div className="text-xs text-slate-500 mt-0.5">{tooltip.meaning}</div>
              ) : null}
            </div>
            <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 shrink-0 mt-0.5">
              <X size={14} />
            </button>
          </div>

          <button
            onClick={addWordToDeck}
            disabled={tooltip.adding || tooltip.added}
            className={`mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              tooltip.added
                ? "bg-green-50 text-green-600 cursor-default"
                : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
            }`}
          >
            {tooltip.adding ? (
              <><Loader2 size={11} className="animate-spin" /> Adding…</>
            ) : tooltip.added ? (
              "✓ Added to Deck"
            ) : (
              <><Plus size={11} /> Add to Deck</>
            )}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-slate-100 px-4 py-4">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="日本語で話しかけてください… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all max-h-40 overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-indigo-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-300 mt-2 font-medium uppercase tracking-widest">
          Tap any underlined kanji to see furigana · meaning · add to deck
        </p>
      </div>
    </div>
  );
}
