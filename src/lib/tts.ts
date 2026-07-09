// Google TTS client — caches audio blobs in memory for the session.
// Japanese uses Google TTS API. English falls back to SpeechSynthesis to save quota.

export const VOICE_OPTIONS = [
  { id: "ja-JP-Wavenet-A", label: "Wavenet A", gender: "Female", desc: "Soft & gentle" },
  { id: "ja-JP-Wavenet-B", label: "Wavenet B", gender: "Male",   desc: "Deep & formal" },
  { id: "ja-JP-Wavenet-C", label: "Wavenet C", gender: "Male",   desc: "Conversational" },
  { id: "ja-JP-Wavenet-D", label: "Wavenet D", gender: "Male",   desc: "Direct & clear" },
] as const;

export type VoiceId = typeof VOICE_OPTIONS[number]["id"];
export const VOICE_STORAGE_KEY = "flashkado-tts-voice";
export const DEFAULT_VOICE: VoiceId = "ja-JP-Wavenet-A";

export function getVoice(): VoiceId {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  const saved = localStorage.getItem(VOICE_STORAGE_KEY);
  return (VOICE_OPTIONS.some(v => v.id === saved) ? saved : DEFAULT_VOICE) as VoiceId;
}

export function setVoice(voiceId: VoiceId) {
  localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
  cache.clear(); // invalidate cached audio when voice changes
}

const cache = new Map<string, string>(); // key → objectURL
const pending = new Map<string, Promise<string>>();
let currentAudio: HTMLAudioElement | null = null;

export function stopTTS() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

async function fetchAudio(text: string, lang: string, voice?: string): Promise<string> {
  const resolvedVoice = voice ?? getVoice();
  const key = `${resolvedVoice}:${lang}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let promise = pending.get(key);
  if (!promise) {
    promise = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, voice: resolvedVoice }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`TTS ${r.status}`);
        const blob = await r.blob();
        return URL.createObjectURL(blob);
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
  }

  const url = await promise;
  cache.set(key, url);
  return url;
}

function speechSynthFallback(text: string, lang: string, rate = 0.85, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.resume();
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang === lang);
  if (voice) utter.voice = voice;
  if (onEnd) utter.onend = onEnd;
  utter.onerror = onEnd ?? null;
  synth.speak(utter);
}

export async function playTTS(
  text: string,
  lang: "ja-JP" | "en-US" = "ja-JP",
  opts: { onEnd?: () => void; voice?: VoiceId } = {}
): Promise<void> {
  stopTTS();
  if (!text.trim()) return;

  if (lang === "en-US") {
    speechSynthFallback(text, lang, 0.9, opts.onEnd);
    return;
  }

  try {
    const url = await fetchAudio(text, lang, opts.voice);
    const audio = new Audio(url);
    currentAudio = audio;
    if (opts.onEnd) audio.addEventListener("ended", opts.onEnd, { once: true });
    audio.addEventListener("ended", () => { if (currentAudio === audio) currentAudio = null; }, { once: true });
    audio.addEventListener("error", () => {
      if (currentAudio === audio) currentAudio = null;
      opts.onEnd?.();
    }, { once: true });
    await audio.play();
  } catch {
    speechSynthFallback(text, lang, 0.85, opts.onEnd);
  }
}

export function speak(text: string, lang: "ja-JP" | "en-US" = "ja-JP") {
  playTTS(text, lang).catch(() => {});
}
