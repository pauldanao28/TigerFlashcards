// Helpers for the Watch view: parse a pasted or uploaded transcript (YouTube's copy,
// transcript-downloader .txt, SRT/VTT) into timed caption lines, and pull the video id /
// start time out of a YouTube link.

export interface CaptionLine {
  t: number;    // start time in seconds
  text: string;
}

// A timestamp: 0:05, 00:05, 1:02:03, optionally with milliseconds (00:05.300 / 00:05,300).
const TS = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const TIME_ONLY = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;
// A line that starts with a timestamp, in any of the forms transcript tools produce:
//   0:05 text · [00:05] text · (0:05) text · 00:05.300 text · 0:05 - text · 0:05 - 0:09 text
// The text part may be empty (YouTube's copy puts the text on the next line).
const LEADING_TIME = new RegExp(
  String.raw`^[\[(]?(${TS})[\])]?(?:\s*(?:-->|[-–—~])\s*[\[(]?${TS}[\])]?)?(?:\s*[-–—:|]\s+|\s+|$)(.*)$`,
);
// Screen-reader labels YouTube's transcript panel sometimes includes when copied
// ("1 minute, 5 seconds", "1分5秒") — not caption text.
const DURATION_LABEL = /^(\d+\s*(hours?|minutes?|seconds?|時間|分|秒)[,、\s]*)+$/i;

/** "1:23" → 83, "1:02:03" → 3723, "83" → 83, "00:05.300" → 5. Returns null if it isn't a time. */
export function parseTime(value: string): number | null {
  const v = value.trim().replace(/[.,]\d{1,3}$/, (m) => (/:/.test(value) ? "" : m));
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(parseFloat(v));
  const m = v.match(TIME_ONLY);
  if (!m) return null;
  return (m[1] ? parseInt(m[1]) * 3600 : 0) + parseInt(m[2]) * 60 + parseInt(m[3]);
}

/** A watch length in minutes: "3" → 180, "1.5" → 90, "2:30" → 150. Null if invalid or zero. */
export function parseDuration(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const secs = Math.round(parseFloat(v) * 60);
    return secs > 0 ? secs : null;
  }
  const secs = parseTime(v);
  return secs && secs > 0 ? secs : null;
}

/** 180 → "3", 150 → "2:30" — the inverse of parseDuration, for prefilling the field. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s % 60 === 0 ? String(s / 60) : formatTime(s);
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
 *
 * The transcript can arrive in overlapping chunks (e.g. copied a screen at a time with
 * Google Lens), so lines are de-duplicated by timestamp — keeping the longest text, since
 * a line at the edge of a screenshot can be cut off.
 */
export function parseTranscript(raw: string): CaptionLine[] {
  const out: CaptionLine[] = [];
  let current: CaptionLine | null = null;
  const flush = () => {
    if (current && current.text.trim()) out.push({ t: current.t, text: current.text.trim() });
    current = null;
  };
  // Subtitle files: drop markup (<c>, <00:00:01.500>, <i>) and common HTML entities.
  const cleanText = (t: string) =>
    t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

  const isSubtitleFile = raw.includes("-->");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "WEBVTT" || DURATION_LABEL.test(line)) continue;

    const m = line.match(LEADING_TIME);
    if (m) {
      flush();
      // In SRT/VTT the rest of a "start --> end" line is cue settings, not caption text.
      const rest = line.includes("-->") ? "" : cleanText(m[2] ?? "");
      current = { t: parseTime(m[1]) ?? 0, text: rest };
      continue;
    }

    // SRT cue index numbers
    if (isSubtitleFile && /^\d+$/.test(line)) continue;

    const text = cleanText(line);
    if (current && text) current.text += (current.text ? " " : "") + text;
  }
  flush();

  const byTime = new Map<number, CaptionLine>();
  for (const line of out) {
    const text = line.text.replace(/\s+/g, " ");
    const existing = byTime.get(line.t);
    if (!existing || text.length > existing.text.length) byTime.set(line.t, { t: line.t, text });
  }
  const sorted = [...byTime.values()].sort((a, b) => a.t - b.t);
  if (!isSubtitleFile) return sorted;

  // YouTube's auto-caption files "roll": each cue repeats the previous line before adding
  // the new one. Keep only what's new in each cue.
  const rolled: CaptionLine[] = [];
  for (const line of sorted) {
    const prev = rolled[rolled.length - 1];
    if (prev && line.text === prev.text) continue;
    if (prev && line.text.startsWith(prev.text)) {
      const added = line.text.slice(prev.text.length).trim();
      if (added) rolled.push({ t: line.t, text: added });
      continue;
    }
    rolled.push(line);
  }
  return rolled;
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
