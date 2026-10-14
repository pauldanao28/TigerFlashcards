"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MonitorPlay, Pause, Play, Plus, Repeat, RotateCcw, X } from "lucide-react";
import TappableText from "@/components/TappableText";
import NewWordsPanel from "@/components/NewWordsPanel";
import WordLookupSheet from "@/components/WordLookupSheet";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useWordMining } from "@/hooks/useWordMining";
import { formatDuration, formatTime, parseDuration, parseTime, parseTranscript, parseYouTubeUrl, type CaptionLine } from "@/lib/transcript";

// YouTube player states (YT.PlayerState)
const PLAYING = 1;

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
interface SavedSession { url: string; transcript: string; start: string; end: string; endMode?: EndMode; length?: string }

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
 * underline, Jisho lookup, amber = not in deck, rose = weak. Optional start/end
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
  const [loop, setLoop] = useState(false);
  const [tab, setTab] = useState<"captions" | "words">("captions");

  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
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

  const TRANSCRIPT_ERROR = "Couldn't find timestamps in the transcript. Copy it from YouTube's “Show transcript” panel with timestamps on.";

  // Parses the transcript and loads its deck highlights. Returns false if it has no timestamps.
  const applyTranscript = (raw: string): boolean => {
    const parsedLines = parseTranscript(raw);
    if (parsedLines.length === 0) return false;
    setLines(parsedLines);
    mining.loadWordStatus(parsedLines.map((l) => l.text).join("\n"));
    return true;
  };

  // ── Start ── (the transcript is optional — without one it's just the player + clip controls)
  const handleStart = () => {
    setInputError(null);
    const parsedUrl = parseYouTubeUrl(urlInput);
    if (!parsedUrl) { setInputError("Paste a YouTube link, e.g. https://www.youtube.com/watch?v=…"); return; }
    if (transcriptInput.trim()) {
      if (!applyTranscript(transcriptInput)) { setInputError(TRANSCRIPT_ERROR); return; }
    } else {
      setLines([]);
    }
    if (parsedUrl.start !== null && !startInput) setStartInput(formatTime(parsedUrl.start));
    setVideoId(parsedUrl.id);
    setPlayerError(null);
    setCurrentTime(0);
    setTab("captions");
    setPhase("watching");
  };

  // Transcript pasted after starting (from the captions side)
  const [lateTranscriptError, setLateTranscriptError] = useState<string | null>(null);
  const handleAddTranscript = () => {
    setLateTranscriptError(null);
    if (!applyTranscript(transcriptInput)) setLateTranscriptError(TRANSCRIPT_ERROR);
  };

  // Persist the session whenever the inputs that define it change.
  useEffect(() => {
    if (phase !== "watching") return;
    saveSession(userId, { url: urlInput, transcript: transcriptInput, start: startInput, end: endInput, endMode, length: lengthInput });
  }, [phase, userId, urlInput, transcriptInput, startInput, endInput, endMode, lengthInput]);

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
          onStateChange: (e) => setPlaying(e.data === PLAYING),
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

  // Poll playback position: drives caption sync and enforces the clip's end (or loops).
  const clipRef = useRef({ start, end, loop });
  useEffect(() => { clipRef.current = { start, end, loop }; }, [start, end, loop]);
  useEffect(() => {
    if (phase !== "watching") return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const t = p.getCurrentTime();
      setCurrentTime(t);
      const { start: s, end: e, loop: l } = clipRef.current;
      if (e !== null && t >= e && p.getPlayerState() === PLAYING) {
        if (l) p.seekTo(s, true);
        else p.pauseVideo();
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

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

  const playLine = (t: number) => {
    seek(t);
    playerRef.current?.playVideo();
  };

  // Tapping a word pauses the video so there's time to read the lookup.
  const handleWordTap = (word: string, e: React.MouseEvent | React.TouchEvent) => {
    playerRef.current?.pauseVideo();
    openLookup(word, "", e);
  };

  const backToInput = () => {
    closeLookup();
    mining.clearNewWords();
    setPhase("input");
  };

  // Start + End/Length fields. Shown before starting and under the video ("Now" buttons
  // only make sense once the player exists).
  const renderClipFields = (withNow: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-2">
        <TimeField
          label="Start"
          value={startInput}
          placeholder="0:00"
          onChange={setStartInput}
          onSetNow={withNow ? () => setStartInput(formatTime(currentTime)) : undefined}
        />
        {endMode === "end" ? (
          <TimeField
            label={<EndModeToggle mode={endMode} onChange={switchEndMode} />}
            value={endInput}
            placeholder="end of video"
            onChange={setEndInput}
            onSetNow={withNow ? () => setEndInput(formatTime(currentTime)) : undefined}
            onClear={endInput ? () => setEndInput("") : undefined}
          />
        ) : (
          <TimeField
            label={<EndModeToggle mode={endMode} onChange={switchEndMode} />}
            value={lengthInput}
            placeholder="minutes, e.g. 3"
            onChange={setLengthInput}
            onClear={lengthInput ? () => setLengthInput("") : undefined}
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
    </>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={phase === "watching" ? backToInput : onClose}
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
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90"><X size={16} /></button>
        </div>
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
          <h2 className="text-xl font-black text-slate-900 mb-1">Watch YouTube in Japanese</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Pick the part you want to watch. Add the transcript and captions play beside the video — tap any word to look it up, and pick out the ones you don&apos;t have yet.
          </p>

          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">YouTube link</label>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="mt-1 w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />

          <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Part to watch <span className="text-slate-300">· optional</span></p>
            {renderClipFields(false)}
          </div>

          <label className="block mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Transcript with timestamps <span className="text-slate-300">· optional</span>
          </label>
          <textarea
            value={transcriptInput}
            onChange={(e) => setTranscriptInput(e.target.value)}
            rows={9}
            placeholder={"0:00\n今日はいい天気ですね\n0:04\nどこに行きたい？\n…"}
            className="mt-1 w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
          />

          <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed">
            <p className="font-black text-indigo-600 uppercase tracking-widest text-[10px] mb-1.5">Getting the transcript</p>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>Open the video on youtube.com and expand the description (<b>…more</b>).</li>
              <li>Click <b>Show transcript</b> and choose <b>Japanese</b> at the bottom of the panel.</li>
              <li>Select all the lines (timestamps included), copy, and paste here.</li>
            </ol>
            <p className="mt-1.5 text-slate-400">Skip it to just watch — you can paste a transcript later. No “Show transcript” on YouTube means the video has no captions.</p>
          </div>

          {inputError && <p className="text-rose-500 font-bold text-xs mt-3">{inputError}</p>}

          <button
            onClick={handleStart}
            disabled={!urlInput.trim()}
            className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            <Play size={16} /> Start Watching
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
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-slate-900">
                  <p className="text-white text-sm font-bold">{playerError}</p>
                </div>
              )}
            </div>

            <div className="px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  aria-label={playing ? "Pause" : "Play"}
                  className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center active:scale-90 transition-all shadow-md shadow-indigo-200"
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  onClick={playFromStart}
                  aria-label="Play from start"
                  className="w-11 h-11 shrink-0 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 transition-all"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  onClick={() => setLoop((v) => !v)}
                  aria-pressed={loop}
                  className={`h-11 px-3 shrink-0 rounded-2xl flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest active:scale-90 transition-all ${loop ? "bg-indigo-50 text-indigo-600 border border-indigo-200" : "bg-slate-100 text-slate-500"}`}
                >
                  <Repeat size={14} /> Loop
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
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">No captions yet</p>
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
                  {key === "captions" ? "Captions" : `Not in deck · ${mining.newWords.length}`}
                </button>
              ))}
            </div>

            {tab === "captions" ? (
              <div ref={captionsRef} className="relative flex-1 min-h-0 overflow-y-auto px-3 py-3">
                {lines.map((line, i) => {
                  const active = i === activeIndex;
                  return (
                    <div
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el; }}
                      className={`flex gap-3 items-start rounded-2xl px-3 py-2.5 mb-1 border-l-4 transition-colors ${active ? "bg-indigo-50 border-indigo-500" : "border-transparent"} ${inClip(line.t) ? "" : "opacity-40"}`}
                    >
                      <button
                        onClick={() => playLine(line.t)}
                        className={`shrink-0 mt-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${active ? "text-indigo-600 bg-white" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
                        aria-label={`Play from ${formatTime(line.t)}`}
                      >
                        {formatTime(line.t)}
                      </button>
                      <p className={`text-lg leading-[2.1] break-words ${active ? "text-slate-900" : "text-slate-600"}`}>
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
    </div>
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
