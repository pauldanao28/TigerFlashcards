"use client";
import { useCallback, useRef, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { supabase } from "@/lib/supabase";
import type { LineExplanation } from "@/lib/types";

export type { LineExplanation };

export interface LineExplainState {
  index: number;  // which line/sentence (caller's own indexing)
  line: string;
  loading: boolean;
  data: LineExplanation | null;
  error: string | null;
}

/**
 * "Explain this line" for the Reader and Watch. Explanations are cached per line text for
 * the session, so stepping back to a line (or reopening it) doesn't spend another AI call.
 * Also logs each explained line to daily_explained_lines (for a "what did I look up today"
 * export), when a userId is given.
 */
export function useLineExplain(userId?: string) {
  const [explain, setExplain] = useState<LineExplainState | null>(null);
  const cacheRef = useRef(new Map<string, LineExplanation>());

  const openExplain = useCallback(async (
    index: number,
    line: string,
    context: string,
    opts?: { source: "reader" | "watch"; sourceTitle?: string | null },
  ) => {
    const text = line.trim();
    if (!text) return;
    const cached = cacheRef.current.get(text);
    if (cached) { setExplain({ index, line: text, loading: false, data: cached, error: null }); return; }

    setExplain({ index, line: text, loading: true, data: null, error: null });
    try {
      const res = await authedFetch("/api/reader/explain", { method: "POST", body: JSON.stringify({ line: text, context }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't explain this line");
      cacheRef.current.set(text, data);
      // Ignore the result if the user has already moved to another line.
      setExplain((prev) => (prev && prev.line === text ? { ...prev, loading: false, data } : prev));
      if (userId && opts?.source) {
        supabase.rpc("record_explained_line", {
          target_user_id: userId,
          target_source: opts.source,
          target_line: text,
          target_title: opts.sourceTitle ?? null,
        }).then(({ error }) => { if (error) console.error("Error recording explained line:", error); });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't explain this line";
      setExplain((prev) => (prev && prev.line === text ? { ...prev, loading: false, error: message } : prev));
    }
  }, [userId]);

  const closeExplain = useCallback(() => setExplain(null), []);

  return { explain, openExplain, closeExplain };
}
