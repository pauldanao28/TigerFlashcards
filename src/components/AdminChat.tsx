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

interface WordInfo {
  reading: string;
  meaning: string;
}

interface Tooltip {
  word: string;
  x: number;
  y: number;
  info: WordInfo | null;
  loading: boolean;
  added: boolean;
  adding: boolean;
}

const STORAGE_KEY = "flashkado-sensei-chat";
const JP_REGEX = /[぀-ゟ゠-ヿ一-鿿＀-￯]+/g;

function parseJapanese(text: string) {
  const parts: { text: string; isJapanese: boolean }[] = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(JP_REGEX.source, "g");

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isJapanese: false });
    }
    parts.push({ text: match[0], isJapanese: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isJapanese: false });
  }
  return parts;
}

export default function AdminChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [wordCache, setWordCache] = useState<Record<string, WordInfo>>({});
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fetch user's default deck
  useEffect(() => {
    supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single()
      .then(({ data }) => {
        if (data) setDefaultDeckId(data.id);
      });
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

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    // Send last 20 messages as context
    const context = updatedMessages.slice(-20);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context }),
      });
      const data = await res.json();

      const modelMsg: Message = {
        id: crypto.randomUUID(),
        role: "model",
        content: data.content || "エラーが発生しました。",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, modelMsg]);
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
    async (word: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();

      // Use cached info if available
      if (wordCache[word]) {
        setTooltip({ word, x: rect.left, y: rect.bottom + window.scrollY, info: wordCache[word], loading: false, added: false, adding: false });
        return;
      }

      setTooltip({ word, x: rect.left, y: rect.bottom + window.scrollY, info: null, loading: true, added: false, adding: false });

      try {
        const res = await fetch("/api/word-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word }),
        });
        const info: WordInfo = await res.json();
        setWordCache((prev) => ({ ...prev, [word]: info }));
        setTooltip((prev) => prev?.word === word ? { ...prev, info, loading: false } : prev);
      } catch {
        setTooltip((prev) => prev?.word === word ? { ...prev, loading: false } : prev);
      }
    },
    [wordCache]
  );

  const addWordToDeck = async () => {
    if (!tooltip?.info || !defaultDeckId) return;
    setTooltip((prev) => prev ? { ...prev, adding: true } : prev);

    try {
      // Generate full card data
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: [tooltip.word] }),
      });
      const cards = await res.json();
      if (!cards?.[0]) throw new Error("No card data");

      const card = cards[0];

      // Upsert to master_cards
      const { data: upserted, error: upsertErr } = await supabase
        .from("master_cards")
        .upsert([{ ...card, creator_id: userId, is_public: false }], { onConflict: "japanese" })
        .select("id")
        .single();

      if (upsertErr) throw upsertErr;
      const cardId = upserted.id;

      // Link to deck + init scores
      await Promise.all([
        supabase.from("deck_cards").upsert(
          [{ deck_id: defaultDeckId, card_id: cardId }],
          { onConflict: "deck_id,card_id" }
        ),
        supabase.from("user_scores").upsert(
          [{
            user_id: userId,
            card_id: cardId,
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

    const parts = parseJapanese(text);
    return (
      <>
        {parts.map((part, i) =>
          part.isJapanese ? (
            <span
              key={i}
              className="cursor-pointer rounded px-0.5 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
              onClick={(e) => handleWordClick(part.text, e)}
            >
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
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
              Tap any Japanese word to see its reading and meaning
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
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

        {/* Typing indicator */}
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
          className="fixed z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 min-w-[180px] max-w-[260px]"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 280), top: tooltip.y + 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xl font-black text-slate-800">{tooltip.word}</div>
              {tooltip.loading ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <Loader2 size={12} className="animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">Loading…</span>
                </div>
              ) : tooltip.info ? (
                <>
                  <div className="text-sm text-indigo-600 font-bold mt-0.5">{tooltip.info.reading}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{tooltip.info.meaning}</div>
                </>
              ) : null}
            </div>
            <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 mt-0.5 shrink-0">
              <X size={14} />
            </button>
          </div>

          {tooltip.info && !tooltip.loading && (
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
          )}
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
          Tap any Japanese word in responses to see furigana · meanings · add to deck
        </p>
      </div>
    </div>
  );
}
