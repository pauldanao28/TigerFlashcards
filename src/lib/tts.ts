// TTS split:
//   speak()   → SpeechSynthesis (used by Flashcard for lightweight, no-quota word pronunciation)
//   playTTS() → Gemini TTS API route (used by AdminChat sensei messages)

import { authedFetch } from "@/lib/authedFetch";

export const VOICE_OPTIONS = [
  { id: "Aoede",  label: "Aoede",  gender: "Female", desc: "Natural & warm" },
  { id: "Leda",   label: "Leda",   gender: "Female", desc: "Mature & warm" },
  { id: "Puck",   label: "Puck",   gender: "Male",   desc: "Upbeat & expressive" },
  { id: "Charon", label: "Charon", gender: "Male",   desc: "Calm & deep" },
] as const;

export type VoiceId = typeof VOICE_OPTIONS[number]["id"];
export const VOICE_STORAGE_KEY = "flashkado-tts-voice";
export const DEFAULT_VOICE: VoiceId = "Aoede";

export function getVoice(): VoiceId {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  const saved = localStorage.getItem(VOICE_STORAGE_KEY);
  return (VOICE_OPTIONS.some(v => v.id === saved) ? saved : DEFAULT_VOICE) as VoiceId;
}

export function setVoice(voiceId: VoiceId) {
  localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
  cache.clear();
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

// Flashcard word pronunciation — browser SpeechSynthesis, no API quota used
export function speak(text: string, lang: "ja-JP" | "en-US" = "ja-JP") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.resume();
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  const voice = synth.getVoices().find((v) => v.lang === lang);
  if (voice) utter.voice = voice;
  synth.speak(utter);
}

// AdminChat sensei messages — Gemini TTS route, cached per session
async function fetchAudio(text: string, voice?: string): Promise<string> {
  const resolvedVoice = voice ?? getVoice();
  const key = `${resolvedVoice}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let promise = pending.get(key);
  if (!promise) {
    promise = authedFetch("/api/tts", {
      method: "POST",
      body: JSON.stringify({ text, voice: resolvedVoice }),
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
    const url = await fetchAudio(text, opts.voice);
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
