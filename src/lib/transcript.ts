// Helpers for the Watch view: parse a pasted YouTube transcript into timed caption lines,
// and pull the video id / start time out of a YouTube link.

export interface CaptionLine {
  t: number;    // start time in seconds
  text: string;
}

const TIME_ONLY = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;
const TIME_THEN_TEXT = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;
const SRT_CUE = /^((?:\d{1,2}:)?\d{1,2}:\d{2})[.,]\d{1,3}\s*-->/;
// Screen-reader labels YouTube's transcript panel sometimes includes when copied
// ("1 minute, 5 seconds", "1分5秒") — not caption text.
const DURATION_LABEL = /^(\d+\s*(hours?|minutes?|seconds?|時間|分|秒)[,、\s]*)+$/i;

/** "1:23" → 83, "1:02:03" → 3723, "83" → 83. Returns null if it isn't a time. */
export function parseTime(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(parseFloat(v));
  const m = v.match(TIME_ONLY);
  if (!m) return null;
  return (m[1] ? parseInt(m[1]) * 3600 : 0) + parseInt(m[2]) * 60 + parseInt(m[3]);
}

/** 83 → "1:23", 3723 → "1:02:03" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Parses YouTube's "Show transcript" copy (timestamp on its own line, then the text),
 * "0:05 text" on one line, or SRT/VTT subtitle files. Lines before the first
 * timestamp are ignored; consecutive text lines under one timestamp are joined.
 */
export function parseTranscript(raw: string): CaptionLine[] {
  const out: CaptionLine[] = [];
  let current: CaptionLine | null = null;
  const flush = () => {
    if (current && current.text.trim()) out.push({ t: current.t, text: current.text.trim() });
    current = null;
  };

  const isSrt = raw.includes("-->");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "WEBVTT" || DURATION_LABEL.test(line)) continue;

    const srt = line.match(SRT_CUE);
    if (srt) { flush(); current = { t: parseTime(srt[1]) ?? 0, text: "" }; continue; }

    if (TIME_ONLY.test(line)) { flush(); current = { t: parseTime(line) ?? 0, text: "" }; continue; }

    const inline = line.match(TIME_THEN_TEXT);
    if (inline) { flush(); current = { t: parseTime(inline[1]) ?? 0, text: inline[2] }; continue; }

    // SRT cue index numbers
    if (isSrt && /^\d+$/.test(line)) continue;

    if (current) current.text += (current.text ? " " : "") + line;
  }
  flush();
  return out.sort((a, b) => a.t - b.t);
}

/** Video id (and ?t= start, if any) from any common YouTube link form, or a bare id. */
export function parseYouTubeUrl(input: string): { id: string; start: number | null } | null {
  const v = input.trim();
  if (/^[\w-]{11}$/.test(v)) return { id: v, start: null };
  let url: URL;
  try { url = new URL(v.startsWith("http") ? v : `https://${v}`); } catch { return null; }

  let id: string | null = null;
  if (url.hostname === "youtu.be") id = url.pathname.slice(1, 12);
  else if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com")) {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;

  // t=90, t=90s, t=1m30s
  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  let start: number | null = null;
  if (t) {
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (m && (m[1] || m[2] || m[3])) start = (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
  }
  return { id, start };
}
