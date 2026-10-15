"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MonitorPlay, Play, Plus, Repeat, RotateCcw, Sparkles, Trash2, Upload, X } from "lucide-react";
import TappableText from "@/components/TappableText";
import NewWordsPanel from "@/components/NewWordsPanel";
import LineStudyBar, { type StudyRate } from "@/components/LineStudyBar";
import LineExplainSheet from "@/components/LineExplainSheet";
import { useLineExplain } from "@/hooks/useLineExplain";
import { useAppAlert } from "@/context/AlertContext";
import { deleteSavedVideo, getSavedVideo, listSavedVideos, saveVideo, thumbnailUrl, updateVideo, type SavedVideo } from "@/lib/watchVideos";
import AddedWordsSummary from "@/components/AddedWordsSummary";
import WordLookupSheet from "@/components/WordLookupSheet";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useWordMining } from "@/hooks/useWordMining";
import { formatDuration, formatTime, parseDuration, parseTime, parseTranscript, parseYouTubeUrl, type CaptionLine } from "@/lib/transcript";

// YouTube player states (YT.PlayerState)
const PLAYING = 1;

// A transcript gives each line's start but not when the last one ends — play a bit past it.
const LAST_LINE_PAD = 5;

// The IFrame API script is global — load it once and share the promise.
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

const PLAYER_ERRORS: Record<number, string> = {
  2: "That doesn't look like a valid video.",
  5: "This video can't be played here.",
  100: "Video not found — it may be private or removed.",
  101: "The owner doesn't allow this video to be embedded in other sites.",
  150: "The owner doesn't allow this video to be embedded in other sites.",
};

// Last video per user, so reopening Watch picks up where you left off. Convenience only —
// browser storage can be unavailable, so every access is guarded.
const storageKey = (userId: string) => `flashkado-watch-last-${userId}`;
interface SavedSession { url: string; transcript: string; start: string; end: string; endMode?: EndMode; length?: string; clipManual?: boolean }

// The clip ends either at a fixed time ("end") or a number of minutes after the start ("length").
type EndMode = "end" | "length";
function loadSaved(userId: string): SavedSession | null {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null"); } catch { return null; }
}
function saveSession(userId: string, s: SavedSession) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(s)); } catch { /* ignore */ }
}

/**
 * Watch a YouTube video with its Japanese captions beside it (below it on phones).
 * Captions come from the transcript the user pastes (YouTube's "Show transcript"),
 * stay in sync with playback, and use the Reader's tap-to-lookup text: dotted
 * underline, Jisho lookup, violet = not in deck, rose = weak. Optional start/end
 * times limit playback (and the "Not in your deck" list) to one part of the video.
 */
export default function WatchView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const mining = useWordMining(userId);
  const { lookup, openLookup, setEditWord, closeLookup } = useWordLookup(userId);

  const [phase, setPhase] = useState<"input" | "watching">("input");
  const [urlInput, setUrlInput] = useState("");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const [videoId, setVideoId] = useState<string | null>(null);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [endMode, setEndMode] = useState<EndMode>("end");
  const [lengthInput, setLengthInput] = useState("");
  // Until the user sets the clip themselves, it follows the transcript's first → last timestamp.
  const [clipManual, setClipManual] = useState(false);
  const [loop, setLoop] = useState(false);
  // Line-by-line study: pause at the end of every caption line, playback speed
  const [autoPause, setAutoPause] = useState(false);
  const [rate, setRate] = useState<StudyRate>(1);
  const [tab, setTab] = useState<"captions" | "words">("captions");

  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const autoPlayRef = useRef(false); // play as soon as the player is ready (set by Start Watching)
  const captionsRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Prefill from the last session
  useEffect(() => {
    const saved = loadSaved(userId);
    if (!saved) return;
    setUrlInput(saved.url);
    setTranscriptInput(saved.transcript);
    setStartInput(saved.start);
    setEndInput(saved.end);
    setEndMode(saved.endMode ?? "end");
    setLengthInput(saved.length ?? "");
    setClipManual(saved.clipManual ?? false);
  }, [userId]);

  const start = parseTime(startInput) ?? 0;
  const endParsed = parseTime(endInput);
  const lengthParsed = parseDuration(lengthInput);
  const end = endMode === "length"
    ? (lengthParsed !== null ? start + lengthParsed : null)
    : (endParsed !== null && endParsed > start ? endParsed : null);

  // Carry the current clip over when switching, so End 3:00 ⇄ Length 2 (from 1:00) stay in step.
  const switchEndMode = (mode: EndMode) => {
    if (mode === endMode) return;
    if (mode === "length") setLengthInput(end !== null ? formatDuration(end - start) : "");
    else setEndInput(end !== null ? formatTime(end) : "");
    setEndMode(mode);
  };

  // Clip = the transcript's first timestamp → a little past its last one.
  const applyTranscriptRange = (parsed: CaptionLine[]) => {
    if (parsed.length === 0) return;
    const first = parsed[0].t;
    const last = parsed[parsed.length - 1].t + LAST_LINE_PAD;
    setStartInput(formatTime(first));
    if (endMode === "length") setLengthInput(formatDuration(last - first));
    else setEndInput(formatTime(last));
  };

  // Parsed once per edit — the playback poll re-renders several times a second.
  const pastedLines = useMemo(() => parseTranscript(transcriptInput), [transcriptInput]);

  useEffect(() => {
    if (clipManual) return;
    applyTranscriptRange(pastedLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastedLines, clipManual]);

  // Typing a time or pressing "Now" takes the clip off auto.
  const manual = <T,>(setter: (v: T) => void) => (v: T) => { setClipManual(true); setter(v); };

  const inClip = useCallback((t: number) => t >= start && (end === null || t < end), [start, end]);

  // Captions that fall inside the clip — what the "Not in your deck" list is built from.
  const clipText = useMemo(() => lines.filter((l) => inClip(l.t)).map((l) => l.text).join("\n"), [lines, inClip]);

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= currentTime + 0.25) idx = i; else break;
    }
    return idx;
  }, [lines, currentTime]);

  const TRANSCRIPT_ERROR = "Couldn't find timestamps in the transcript — captions need them to sync with the video. Copy it with timestamps on (or upload a .srt file). Plain text without timestamps works in the Reader instead.";

  // Parses the transcript and loads its deck highlights. Returns false if it has no timestamps.
  const applyTranscript = (raw: string): boolean => {
    const parsedLines = parseTranscript(raw);
    if (parsedLines.length === 0) return false;
    setLines(parsedLines);
    mining.loadWordStatus(parsedLines.map((l) => l.text).join("\n"));
    return true;
  };

  // ── Start ── (the transcript is optional — without one it's just the player + clip controls)
  // Takes the values explicitly so a saved video can start in the same tick its fields are set.
  const startWith = (url: string, transcript: string, startField: string) => {
    setInputError(null);
    const parsedUrl = parseYouTubeUrl(url);
    if (!parsedUrl) { setInputError("Paste a YouTube link, e.g. https://www.youtube.com/watch?v=…"); return; }
    if (transcript.trim()) {
      if (!applyTranscript(transcript)) { setInputError(TRANSCRIPT_ERROR); return; }
    } else {
      setLines([]);
    }
    if (parsedUrl.start !== null && !startField) setStartInput(formatTime(parsedUrl.start));
    autoPlayRef.current = true;
    setVideoTitle(null);
    setVideoId(parsedUrl.id);
    setPlayerError(null);
    setCurrentTime(0);
    setTab("captions");
    setPhase("watching");
  };
  // New video: link + transcript are both required, and it's saved before it plays.
  const [savingNew, setSavingNew] = useState(false);
  const handleStart = async () => {
    setInputError(null);
    const parsedUrl = parseYouTubeUrl(urlInput);
    if (!parsedUrl) { setInputError("Paste a YouTube link, e.g. https://www.youtube.com/watch?v=…"); return; }
    if (!transcriptInput.trim()) { setInputError("Paste the captions with timestamps, or upload a .srt / .txt file."); return; }
    const parsedLines = parseTranscript(transcriptInput);
    if (parsedLines.length === 0) { setInputError(TRANSCRIPT_ERROR); return; }
    setSavingNew(true);
    const id = await saveVideo(userId, parsedUrl.id, { url: urlInput, transcript: transcriptInput, line_count: parsedLines.length });
    setSavingNew(false);
    if (!id) { setInputError("Couldn't save the video — check your connection and try again."); return; }
    savedIdRef.current = id;
    resumeRef.current = null;
    startWith(urlInput, transcriptInput, startInput);
  };

  // ── Saved videos (watch_videos) — synced across devices, with resume ──
  const { showConfirm } = useAppAlert();
  const [savedVideos, setSavedVideos] = useState<Omit<SavedVideo, "transcript">[]>([]);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [openingSaved, setOpeningSaved] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const resumeRef = useRef<number | null>(null); // seek here once the player is ready

  // (Re)load the list whenever the start screen shows. If the table isn't there yet
  // (migration not applied) the list just stays empty.
  useEffect(() => {
    if (phase !== "input") return;
    listSavedVideos(userId).then(setSavedVideos).catch(() => setSavedVideos([]));
  }, [phase, userId]);

  const openSaved = async (id: string) => {
    setOpeningSaved(id);
    try {
      const v = await getSavedVideo(id);
      if (!v) return;
      setUrlInput(v.url);
      setTranscriptInput(v.transcript);
      setStartInput(v.start_input);
      setEndInput(v.end_input);
      setEndMode(v.end_mode);
      setLengthInput(v.length_input);
      setClipManual(v.clip_manual);
      resumeRef.current = v.last_position;
      startWith(v.url, v.transcript, v.start_input);
    } catch {
      setInputError("Couldn't open that video — try again.");
    } finally {
      setOpeningSaved(null);
    }
  };

  const removeSaved = async (v: Omit<SavedVideo, "transcript">) => {
    const ok = await showConfirm(`Remove “${v.title ?? "this video"}” and its transcript from My videos?`, { confirmLabel: "Remove", danger: true });
    if (!ok) return;
    try {
      await deleteSavedVideo(v.id);
      setSavedVideos((prev) => prev.filter((x) => x.id !== v.id));
    } catch {
      setInputError("Couldn't remove that video — try again.");
    }
  };

  // Save (upsert) whenever what defines the session changes — debounced.
  useEffect(() => {
    if (phase !== "watching" || !videoId) return;
    const t = setTimeout(async () => {
      const id = await saveVideo(userId, videoId, {
        url: urlInput,
        transcript: transcriptInput,
        line_count: lines.length,
        start_input: startInput,
        end_input: endInput,
        end_mode: endMode,
        length_input: lengthInput,
        clip_manual: clipManual,
        ...(videoTitle ? { title: videoTitle } : {}),
      });
      if (id) savedIdRef.current = id;
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, userId, videoId, urlInput, transcriptInput, lines.length, startInput, endInput, endMode, lengthInput, clipManual, videoTitle]);

  // Resume position: every 15s while playing, plus on pause and when leaving.
  const savePosition = () => {
    const p = playerRef.current;
    if (!savedIdRef.current || !p || typeof p.getCurrentTime !== "function") return;
    updateVideo(savedIdRef.current, { last_position: p.getCurrentTime() });
  };
  useEffect(() => {
    if (phase !== "watching") return;
    const id = setInterval(() => { if (playerRef.current?.getPlayerState?.() === PLAYING) savePosition(); }, 15000);
    return () => clearInterval(id);
  }, [phase]);

  // Transcript pasted after starting (from the captions side)
  const [lateTranscriptError, setLateTranscriptError] = useState<string | null>(null);
  const handleAddTranscript = () => {
    setLateTranscriptError(null);
    if (!applyTranscript(transcriptInput)) { setLateTranscriptError(TRANSCRIPT_ERROR); return; }
    // The clip just moved to the transcript's range — play from its start.
    const first = pastedLines[0]?.t;
    if (!clipManual && first !== undefined && playerRef.current) {
      playerRef.current.seekTo(first, true);
      playerRef.current.playVideo();
    }
  };

  // More captions pasted while watching (e.g. the next screenful copied with Lens) —
  // appended to the transcript, overlaps dropped by the parser.
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreInput, setMoreInput] = useState("");
  const [moreMessage, setMoreMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const handleAddMore = () => {
    if (parseTranscript(moreInput).length === 0) {
      setMoreMessage({ ok: false, text: TRANSCRIPT_ERROR });
      return;
    }
    const combined = `${transcriptInput.trimEnd()}\n${moreInput.trim()}`;
    const before = lines.length;
    setTranscriptInput(combined);
    applyTranscript(combined);
    const added = parseTranscript(combined).length - before;
    setMoreInput("");
    setMoreMessage({ ok: true, text: added > 0 ? `Added ${added} new line${added !== 1 ? "s" : ""}` : "Nothing new — those lines were already here" });
  };

  // Persist the session whenever the inputs that define it change.
  useEffect(() => {
    if (phase !== "watching") return;
    saveSession(userId, { url: urlInput, transcript: transcriptInput, start: startInput, end: endInput, endMode, length: lengthInput, clipManual });
  }, [phase, userId, urlInput, transcriptInput, startInput, endInput, endMode, lengthInput, clipManual]);

  // Rebuild the word list when the clip range changes (debounced — no AI, just the tokenizer).
  useEffect(() => {
    if (phase !== "watching" || !clipText) return;
    const t = setTimeout(() => mining.loadNewWords(clipText), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clipText]);

  // ── YouTube player ──
  useEffect(() => {
    if (phase !== "watching" || !videoId) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT) return;
      // The API replaces the element it's given, so hand it a fresh child each time.
      const el = document.createElement("div");
      playerHostRef.current.replaceChildren(el);
      playerRef.current = new window.YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(start) },
        events: {
          onReady: (e) => {
            try { e.target.setPlaybackRate(rate); } catch { /* unsupported rate */ }
            const title = e.target.getVideoData?.().title;
            if (title) setVideoTitle(title);
            // Resume a saved video where it was left, if that's still inside the clip.
            const resume = resumeRef.current;
            resumeRef.current = null;
            if (resume !== null && resume > start + 1 && (end === null || resume < end - 1)) e.target.seekTo(resume, true);
            if (!autoPlayRef.current) return;
            autoPlayRef.current = false;
            e.target.playVideo(); // browsers may still block this — the Play button covers that
          },
          onStateChange: (e) => {
            setPlaying(e.data === PLAYING);
            if (e.data === 2) savePosition(); // paused
          },
          onError: (e) => setPlayerError(PLAYER_ERRORS[e.data] ?? "This video can't be played."),
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
      setPlaying(false);
    };
    // Only recreate for a new video — start/end are enforced by the poll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, videoId]);

  // Index of the caption line playing at time t (no look-ahead), -1 before the first.
  const lineIndexAt = (list: CaptionLine[], t: number) => {
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].t <= t) idx = i; else break;
    }
    return idx;
  };

  // Poll playback position: drives caption sync, enforces the clip's end (or loops), and
  // pauses at each line boundary when "Pause each line" is on.
  const clipRef = useRef({ start, end, loop, autoPause, lines });
  useEffect(() => { clipRef.current = { start, end, loop, autoPause, lines }; }, [start, end, loop, autoPause, lines]);
  const lastLineRef = useRef<number | null>(null); // line playback was last in (auto-pause)
  useEffect(() => {
    if (phase !== "watching") return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const t = p.getCurrentTime();
      setCurrentTime(t);
      if (p.getPlayerState() !== PLAYING) return;
      const { start: s, end: e, loop: l, autoPause: ap, lines: ls } = clipRef.current;
      if (e !== null && t >= e) {
        if (l) { p.seekTo(s, true); lastLineRef.current = lineIndexAt(ls, s); }
        else p.pauseVideo();
        return;
      }
      const idx = lineIndexAt(ls, t);
      if (ap && lastLineRef.current !== null && idx > lastLineRef.current) {
        // Crossed into the next line — stop there, rewound to its exact start so it plays whole.
        p.pauseVideo();
        p.seekTo(ls[idx].t, true);
      }
      lastLineRef.current = idx;
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // Playback speed — applied whenever it changes (and on player ready, below).
  useEffect(() => {
    try { playerRef.current?.setPlaybackRate(rate); } catch { /* player not ready yet */ }
  }, [rate]);

  // Keep the active caption in view — but not while the lookup sheet is open.
  useEffect(() => {
    if (activeIndex < 0 || lookup) return;
    const el = lineRefs.current[activeIndex];
    const box = captionsRef.current;
    if (!el || !box) return;
    // Measure on screen rather than via offsetTop — offsetTop depends on which ancestor is
    // positioned, and subtracting the box's own offset scrolled too far up.
    const lineTop = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: lineTop - box.clientHeight / 3, behavior: "smooth" });
  }, [activeIndex, lookup]);

  // ── Controls ──
  const seek = (t: number) => {
    playerRef.current?.seekTo(t, true);
    setCurrentTime(t);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) { p.pauseVideo(); return; }
    const t = p.getCurrentTime();
    if (t < start || (end !== null && t >= end)) p.seekTo(start, true);
    p.playVideo();
  };

  const playFromStart = () => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(start, true);
    p.playVideo();
  };

  // Jump to caption line i and play it (auto-pause, if on, stops at its end).
  const playLineIndex = (i: number) => {
    const line = lines[i];
    if (!line) return;
    seek(line.t);
    lastLineRef.current = i;
    playerRef.current?.playVideo();
  };
  const currentLine = () => Math.max(lineIndexAt(lines, currentTime), 0);
  const prevLine = () => playLineIndex(Math.max(currentLine() - 1, 0));
  const nextLine = () => playLineIndex(Math.min(currentLine() + 1, lines.length - 1));
  const repeatLine = () => playLineIndex(currentLine());

  // ── Explain this line (AI) — pauses the video; ‹ › in the sheet step through lines ──
  const { explain, openExplain, closeExplain } = useLineExplain();
  const explainLine = (i: number) => {
    if (!lines[i]) return;
    playerRef.current?.pauseVideo();
    const context = [...lines.slice(Math.max(0, i - 2), i), ...lines.slice(i + 1, i + 3)].map((l) => l.text).join("\n");
    openExplain(i, lines[i].text, context);
  };

  // Tapping a word pauses the video so there's time to read the lookup.
  const handleWordTap = (word: string, e: React.MouseEvent | React.TouchEvent) => {
    playerRef.current?.pauseVideo();
    openLookup(word, "", e);
  };

  const backToInput = () => {
    savePosition();
    savedIdRef.current = null;
    closeLookup();
    mining.clearNewWords();
    setPhase("input");
  };

  // Start + End/Length fields. Shown before starting and under the video ("Now" buttons
  // only make sense once the player exists).
  const hasTranscriptRange = pastedLines.length > 0;
  const renderClipFields = (withNow: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-2">
        <TimeField
          label="Start"
          value={startInput}
          placeholder="0:00"
          onChange={manual(setStartInput)}
          onSetNow={withNow ? () => manual(setStartInput)(formatTime(currentTime)) : undefined}
        />
        {endMode === "end" ? (
          <TimeField
            label={<EndModeToggle mode={endMode} onChange={switchEndMode} />}
            value={endInput}
            placeholder="end of video"
            onChange={manual(setEndInput)}
            onSetNow={withNow ? () => manual(setEndInput)(formatTime(currentTime)) : undefined}
            onClear={endInput ? () => manual(setEndInput)("") : undefined}
          />
        ) : (
          <TimeField
            label={<EndModeToggle mode={endMode} onChange={switchEndMode} />}
            value={lengthInput}
            placeholder="minutes, e.g. 3"
            onChange={manual(setLengthInput)}
            onClear={lengthInput ? () => manual(setLengthInput)("") : undefined}
            isValid={(v) => parseDuration(v) !== null}
          />
        )}
      </div>
      {endMode === "end" && endParsed !== null && endParsed <= start && (
        <p className="text-[10px] font-bold text-rose-500 -mt-1">End must be after start — playing to the end of the video.</p>
      )}
      {endMode === "length" && end !== null && (
        <p className="text-[10px] font-bold text-slate-400 -mt-1">
          Plays {formatTime(start)} → {formatTime(end)} ({formatDuration(end - start)} min)
        </p>
      )}
      {hasTranscriptRange && (
        clipManual ? (
          <button
            onClick={() => setClipManual(false)}
            className="self-start -mt-1 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700"
          >
            ↺ Use transcript range
          </button>
        ) : (
          <p className="text-[10px] font-bold text-indigo-400 -mt-1">Set from your transcript&apos;s first and last timestamps</p>
        )
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={phase === "watching" ? backToInput : () => { savePosition(); onClose(); }}
          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
        >
          <ChevronLeft size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">{phase === "watching" ? "New Video" : "Back"}</span>
        </button>
        <div className="flex items-center gap-2">
          <MonitorPlay size={15} className="text-indigo-500" />
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Watch</span>
        </div>
        <div className="w-[92px] flex justify-end">
          <button onClick={() => { savePosition(); onClose(); }} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90"><X size={16} /></button>
        </div>
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
          {savedVideos.length > 0 && (
            <div className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">My videos</p>
              <div className="flex flex-col gap-2">
                {(showAllSaved ? savedVideos : savedVideos.slice(0, 4)).map((v) => {
                  const clip = v.start_input || v.end_input || v.length_input
                    ? `${v.start_input || "0:00"} → ${v.end_mode === "length" && v.length_input ? `+${v.length_input} min` : v.end_input || "end"}`
                    : null;
                  return (
                    <div key={v.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl p-2 shadow-sm">
                      <button
                        onClick={() => openSaved(v.id)}
                        disabled={openingSaved !== null}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbnailUrl(v.video_id)} alt="" className="w-24 shrink-0 aspect-video rounded-xl object-cover bg-slate-100" />
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 leading-snug line-clamp-2">{v.title ?? "YouTube video"}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {openingSaved === v.id ? "Opening…" : [
                              v.line_count > 0 ? `${v.line_count} lines` : "No captions",
                              clip,
                              v.last_position ? `resume ${formatTime(v.last_position)}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => removeSaved(v)}
                        aria-label="Remove video"
                        className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {savedVideos.length > 4 && (
                <button
                  onClick={() => setShowAllSaved((v) => !v)}
                  className="mt-2 text-[10px] font-black uppercase tracking-widest text-indigo-500"
                >
                  {showAllSaved ? "Show fewer" : `Show all ${savedVideos.length}`}
                </button>
              )}
            </div>
          )}

          <h2 className="text-xl font-black text-slate-900 mb-1">{savedVideos.length > 0 ? "Add a video" : "Watch YouTube in Japanese"}</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Paste the link and its captions — it&apos;s saved to My videos so you can come back to it on any device.
          </p>

          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">YouTube link</label>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="mt-1 w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />

          <div className="mt-4 flex items-center justify-between gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Captions with timestamps</label>
            <TranscriptFileButton onLoad={setTranscriptInput} />
          </div>
          <textarea
            value={transcriptInput}
            onChange={(e) => setTranscriptInput(e.target.value)}
            rows={9}
            placeholder={"Paste captions, or upload a .srt / .txt file\n\n0:00\n今日はいい天気ですね\n0:04\nどこに行きたい？"}
            className="mt-1 w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
          />

          <details className="mt-2 text-xs text-slate-500 leading-relaxed">
            <summary className="cursor-pointer font-bold text-indigo-600">How do I get the captions?</summary>
            <ol className="list-decimal pl-4 mt-1.5 space-y-0.5">
              <li>Open the video on youtube.com and expand the description (<b>…more</b>).</li>
              <li>Click <b>Show transcript</b> and choose <b>Japanese</b> at the bottom of the panel.</li>
              <li>Select all the lines (timestamps included), copy, and paste here.</li>
              <li>Or <b>Upload</b> a .srt or .txt (with timestamps) file.</li>
            </ol>
          </details>

          {inputError && <p className="text-rose-500 font-bold text-xs mt-3">{inputError}</p>}

          <button
            onClick={handleStart}
            disabled={!urlInput.trim() || !transcriptInput.trim() || savingNew}
            className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            <Play size={16} /> {savingNew ? "Saving…" : "Watch"}
          </button>
        </div>
      )}

      {/* WATCHING PHASE — side by side on md+, stacked (video pinned on top) on phones */}
      {phase === "watching" && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Video + controls */}
          <div className="shrink-0 md:w-[58%] md:overflow-y-auto md:border-r border-slate-100 bg-white">
            <div className="relative w-full aspect-video bg-black">
              <div ref={playerHostRef} className="absolute inset-0" />
              {playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-slate-900">
                  <p className="text-white text-sm font-bold">{playerError}</p>
                  {videoId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}${start > 0 ? `&t=${Math.floor(start)}s` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all"
                    >
                      Open on YouTube
                    </a>
                  )}
                  {lines.length > 0 && <p className="text-slate-400 text-xs">Your captions below still work for reading and looking up words.</p>}
                </div>
              )}
            </div>

            <div className="px-4 py-3 flex flex-col gap-3">
              <LineStudyBar
                playing={playing}
                onPlayPause={togglePlay}
                onPrev={prevLine}
                onNext={nextLine}
                onRepeat={repeatLine}
                autoPause={autoPause}
                onToggleAutoPause={() => setAutoPause((v) => !v)}
                rate={rate}
                onRate={setRate}
                position={lines.length > 0 ? { index: activeIndex, total: lines.length } : undefined}
                lineControls={lines.length > 0}
                onExplain={() => explainLine(currentLine())}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={playFromStart}
                  className="h-8 px-2.5 shrink-0 rounded-xl bg-slate-100 text-slate-500 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  <RotateCcw size={12} /> Clip start
                </button>
                <button
                  onClick={() => setLoop((v) => !v)}
                  aria-pressed={loop}
                  className={`h-8 px-2.5 shrink-0 rounded-xl flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all ${loop ? "bg-indigo-50 text-indigo-600 border border-indigo-200" : "bg-slate-100 text-slate-500 border border-transparent"}`}
                >
                  <Repeat size={12} /> Loop clip
                </button>
                <span className="ml-auto font-mono text-xs font-bold text-slate-400">{formatTime(currentTime)}</span>
              </div>

              {renderClipFields(true)}
            </div>
          </div>

          {/* Captions / new words */}
          {lines.length === 0 ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-5 max-w-xl mx-auto">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">No captions yet</p>
                  <TranscriptFileButton onLoad={setTranscriptInput} />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  Paste the transcript from YouTube&apos;s <b>Show transcript</b> (timestamps included) to get synced captions, tap-to-lookup and the words you don&apos;t have.
                </p>
                <textarea
                  value={transcriptInput}
                  onChange={(e) => setTranscriptInput(e.target.value)}
                  rows={7}
                  placeholder={"0:00\n今日はいい天気ですね\n0:04\nどこに行きたい？\n…"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                />
                {lateTranscriptError && <p className="text-rose-500 font-bold text-xs mt-2">{lateTranscriptError}</p>}
                <button
                  onClick={handleAddTranscript}
                  disabled={!transcriptInput.trim()}
                  className="w-full mt-3 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  Add Captions
                </button>
              </div>
            </div>
          ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex gap-1 p-2 border-b border-slate-100 bg-white">
              {(["captions", "words"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === key ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-100"}`}
                >
                  {key === "captions" ? "Captions" : `Not in deck · ${mining.visibleNewWords.length}`}
                </button>
              ))}
            </div>

            {tab === "captions" ? (
              <div ref={captionsRef} className="relative flex-1 min-h-0 overflow-y-auto px-3 py-3">
                <div className="flex items-center gap-4 mb-2 px-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-violet-100 border border-violet-400" /> Not in deck
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-100/70 border border-rose-400" /> Weak
                  </span>
                </div>
                {lines.map((line, i) => {
                  const active = i === activeIndex;
                  return (
                    <div
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el; }}
                      className={`flex gap-3 items-start rounded-2xl px-3 py-2.5 mb-1 border-l-4 transition-colors ${active ? "bg-indigo-50 border-indigo-500" : "border-transparent"} ${inClip(line.t) ? "" : "opacity-40"}`}
                    >
                      <button
                        onClick={() => playLineIndex(i)}
                        className={`shrink-0 mt-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${active ? "text-indigo-600 bg-white" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
                        aria-label={`Play from ${formatTime(line.t)}`}
                      >
                        {formatTime(line.t)}
                      </button>
                      <button
                        onClick={() => explainLine(i)}
                        aria-label="Explain this line"
                        className="shrink-0 mt-1 p-1 rounded-md text-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                      >
                        <Sparkles size={13} />
                      </button>
                      <p className={`flex-1 min-w-0 text-lg leading-[2.1] break-words ${active ? "text-slate-900" : "text-slate-600"}`}>
                        <TappableText
                          text={line.text}
                          keyPrefix={`l${i}`}
                          onWordTap={(word, _reading, e) => handleWordTap(word, e)}
                          getStatus={mining.getWordStatus}
                        />
                      </p>
                    </div>
                  );
                })}

                {/* Add the next chunk of the transcript */}
                <div className="mt-3 mx-1 mb-2 bg-white border border-dashed border-indigo-200 rounded-2xl p-3">
                  {!moreOpen ? (
                    <button
                      onClick={() => { setMoreOpen(true); setMoreMessage(null); }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600"
                    >
                      <Plus size={12} /> Add more captions
                    </button>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-[10px] font-bold text-slate-400">
                          Paste the next part of the transcript (timestamps included). Overlapping lines are skipped.
                        </p>
                        <TranscriptFileButton onLoad={setMoreInput} />
                      </div>
                      <textarea
                        value={moreInput}
                        onChange={(e) => setMoreInput(e.target.value)}
                        rows={5}
                        placeholder={"1:05\n…"}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => { setMoreOpen(false); setMoreInput(""); }}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest"
                        >
                          Done
                        </button>
                        <button
                          onClick={handleAddMore}
                          disabled={!moreInput.trim()}
                          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </>
                  )}
                  {moreMessage && (
                    <p className={`text-[10px] font-bold mt-2 text-center ${moreMessage.ok ? "text-emerald-600" : "text-rose-500"}`}>{moreMessage.text}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <p className="text-[10px] font-bold text-slate-400 px-1 mb-2">
                  {end !== null || start > 0
                    ? `Words from ${formatTime(start)}–${end !== null ? formatTime(end) : "end"}`
                    : "Words from the whole video"}
                </p>
                <NewWordsPanel mining={mining} onWordTap={handleWordTap} />
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {lookup && (
        <WordLookupSheet
          lookup={lookup}
          onClose={closeLookup}
          onEditWord={setEditWord}
          onAdd={mining.addWord}
          isAdded={(w) => mining.addedWords.has(w)}
          adding={mining.addLoading}
          addLabel="Add to Deck"
          addIcon={<Plus size={11} />}
          layerClassName={{ backdrop: "z-[310]", sheet: "z-[320] bottom-0 left-0 right-0" }}
        />
      )}

      {explain && (
        <LineExplainSheet
          explain={explain}
          onClose={closeExplain}
          onPrev={explain.index > 0 ? () => explainLine(explain.index - 1) : undefined}
          onNext={explain.index < lines.length - 1 ? () => explainLine(explain.index + 1) : undefined}
          onAddWord={mining.addWord}
          isAdded={(w) => mining.addedWords.has(w)}
          adding={mining.addLoading}
          position={{ index: explain.index, total: lines.length }}
        />
      )}

      {/* Same "Words added" summary as the Add sheet (Study / Profile) */}
      {mining.showSummary && (
        <AddedWordsSummary
          words={mining.addedWordsSummary}
          onClose={mining.closeSummary}
          onDelete={mining.removeAdded}
          zClassName="z-[330]"
        />
      )}
    </div>
  );
}

// Loads a .txt (with timestamps) or .srt transcript file into a textarea.
function TranscriptFileButton({ onLoad }: { onLoad: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors active:scale-95"
      >
        <Upload size={11} /> Upload
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.srt,text/plain"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          if (!file) return;
          onLoad(await file.text());
        }}
      />
    </>
  );
}

function EndModeToggle({ mode, onChange }: { mode: EndMode; onChange: (m: EndMode) => void }) {
  return (
    <span className="inline-flex gap-0.5 bg-slate-100 rounded-md p-0.5">
      {(["end", "length"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`px-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-colors ${mode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
        >
          {m === "end" ? "End" : "Length"}
        </button>
      ))}
    </span>
  );
}

function TimeField({
  label,
  value,
  placeholder,
  onChange,
  onSetNow,
  onClear,
  isValid = (v) => parseTime(v) !== null,
}: {
  label: React.ReactNode;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSetNow?: () => void;
  onClear?: () => void;
  isValid?: (v: string) => boolean;
}) {
  const invalid = value.trim() !== "" && !isValid(value);
  return (
    <div>
      <div className="h-5 flex items-center text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all ${invalid ? "border-rose-300" : "border-slate-200 focus:border-indigo-400"}`}
          />
          {onClear && (
            <button onClick={onClear} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X size={12} />
            </button>
          )}
        </div>
        {onSetNow && (
          <button
            onClick={onSetNow}
            className="shrink-0 px-2.5 py-2 rounded-xl bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 transition-all"
          >
            Now
          </button>
        )}
      </div>
    </div>
  );
}
