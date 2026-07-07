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
  reading: string;
  x: number;
  y: number;
  adding: boolean;
}

interface AddedCard {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  partOfSpeech?: string;
}

type Segment =
  | { type: "annotated"; text: string; reading: string }
  | { type: "plain"; text: string };

const STORAGE_KEY = "flashkado-sensei-chat";

function parseFurigana(text: string): Segment[] {
  const parts: Segment[] = [];
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
  const [summaryCard, setSummaryCard] = useState<AddedCard | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  useEffect(() => {
    const handler = () => setTooltip(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() };
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
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "model",
        content: data.content || "エラーが発生しました。",
        timestamp: Date.now(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "model",
        content: "エラーが発生しました。もう一度試してください。",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleWordClick = useCallback((word: string, reading: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({
      word,
      reading,
      x: Math.min(rect.left, window.innerWidth - 240),
      y: rect.bottom + window.scrollY + 8,
      adding: false,
    });
  }, []);

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
      const card = cards[0];

      const { data: upserted, error } = await supabase
        .from("master_cards")
        .upsert([{ ...card, creator_id: userId, is_public: false }], { onConflict: "japanese" })
        .select("id")
        .single();

      if (error) throw error;

      await Promise.all([
        supabase.from("deck_cards").upsert(
          [{ deck_id: defaultDeckId, card_id: upserted.id }],
          { onConflict: "deck_id,card_id" }
        ),
        supabase.from("user_scores").upsert(
          [{ user_id: userId, card_id: upserted.id, scores_json: { jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 }, en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 } } }],
          { onConflict: "user_id,card_id" }
        ),
      ]);

      setTooltip(null);
      setSummaryCard({ id: upserted.id, japanese: card.japanese, reading: card.reading, english: card.english, partOfSpeech: card.partOfSpeech });
    } catch (err) {
      console.error("Add to deck failed:", err);
      setTooltip((prev) => prev ? { ...prev, adding: false } : prev);
    }
  };

  const deleteAddedCard = async (cardId: string) => {
    await supabase.from("deck_cards").delete().eq("deck_id", defaultDeckId).eq("card_id", cardId);
    setSummaryCard(null);
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
          <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">先生 · Sensei</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Japanese Language Partner · Admin Only</p>
        </div>
        <button onClick={clearChat} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50">
          <Trash2 size={13} /> Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">先生</div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">日本語で話しかけてください</p>
            <p className="text-xs text-slate-300 mt-2">Tap any underlined kanji to see its reading · add to deck</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-indigo-600 text-white rounded-br-lg"
                : "bg-white border border-slate-100 text-slate-800 shadow-sm rounded-bl-lg"
            }`}>
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

      {/* Word tooltip — reading only + Add to Deck */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 min-w-[180px]"
          style={{ left: tooltip.x, top: tooltip.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-black text-slate-800">{tooltip.word}</div>
              <div className="text-sm text-indigo-600 font-bold mt-0.5">{tooltip.reading}</div>
            </div>
            <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 shrink-0">
              <X size={14} />
            </button>
          </div>
          <button
            onClick={addWordToDeck}
            disabled={tooltip.adding}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-60"
          >
            {tooltip.adding ? <><Loader2 size={11} className="animate-spin" /> Adding…</> : <><Plus size={11} /> Add to Deck</>}
          </button>
        </div>
      )}

      {/* Card summary overlay — same design as Stats page */}
      {summaryCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">Word Added</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">1 new entry</p>
              </div>
              <button onClick={() => setSummaryCard(null)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400">
                ✕
              </button>
            </div>

            {/* Card row */}
            <div className="p-4 bg-slate-50/30">
              <div className="group bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 hover:border-indigo-100 transition-all">
                <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                  <span className="text-indigo-600 font-black text-xl">{summaryCard.japanese[0]}</span>
                </div>
                <div className="flex-1 flex flex-col text-left">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-slate-800">{summaryCard.japanese}</span>
                    <span className="text-xs font-bold text-rose-500 uppercase tracking-tighter">{summaryCard.reading}</span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium mt-0.5 leading-tight pr-10">{summaryCard.english}</p>
                  {summaryCard.partOfSpeech && (
                    <div className="mt-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        {summaryCard.partOfSpeech}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 -mt-1 -mr-1">
                  <button
                    onClick={() => deleteAddedCard(summaryCard.id)}
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
                    title="Remove from deck"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={() => setSummaryCard(null)}
                className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-slate-100 px-4 py-4">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
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
          Tap any underlined kanji to see furigana · add to deck
        </p>
      </div>
    </div>
  );
}
