// TTS split:
//   speak()   → SpeechSynthesis (used by Flashcard for lightweight, no-quota word pronunciation)
//   playTTS() → Gemini TTS API route (used by AdminChat sensei messages)

import { authedFetch } from "@/lib/authedFetch";
import { supabase } from "@/lib/supabase";

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

// Whether this user can reach Gemini TTS at all (admin/premium — free tier's daily
// cap is 0, so free users always end up on the browser-speech fallback). Resolved
// once per session and cached, so playTTS can skip straight to the fallback instead
// of awaiting a network round trip that's guaranteed to 429 first. That delay was
// the actual bug behind "tap play, spinner never stops": Safari/iOS only honors
// speechSynthesis.speak() when it's called synchronously inside the click handler
// that triggered it — called after an awaited fetch, it does nothing at all, silently,
// without ever firing onend or onerror, so the caller's "is playing" state never clears.
let ttsEligible: boolean | null = null;
let ttsEligiblePromise: Promise<boolean> | null = null;

export function primeTtsEligibility(userId: string): Promise<boolean> {
  if (ttsEligible !== null) return Promise.resolve(ttsEligible);
  if (!ttsEligiblePromise) {
    ttsEligiblePromise = (async () => {
      try {
        const { data } = await supabase.from("profiles").select("is_admin, is_premium").eq("id", userId).maybeSingle();
        return (ttsEligible = !!(data?.is_admin || data?.is_premium));
      } catch {
        return (ttsEligible = false);
      }
    })();
  }
  return ttsEligiblePromise;
}

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

// Browser voice, one sentence at a time (Reader's read-aloud). Free — no API call.
// Only the latest utterance may report back: cancel() fires onend/onerror on some
// browsers, so the previous one is detached before it's cancelled.
let currentUtter: SpeechSynthesisUtterance | null = null;

export function speakSentence(text: string, { rate = 1, onEnd }: { rate?: number; onEnd?: () => void } = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  stopSentence();
  synth.resume();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang === "ja-JP");
  if (voice) utter.voice = voice;
  utter.onend = () => { if (currentUtter === utter) { currentUtter = null; onEnd?.(); } };
  currentUtter = utter;
  synth.speak(utter);
}

export function stopSentence() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (currentUtter) currentUtter.onend = null;
  currentUtter = null;
  window.speechSynthesis.cancel();
}

// AdminChat sensei messages — Gemini TTS route, cached per session
async function fetchAudio(text: string, voice?: string, isPreview?: boolean): Promise<string> {
  const resolvedVoice = voice ?? getVoice();
  const key = `${resolvedVoice}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let promise = pending.get(key);
  if (!promise) {
    promise = authedFetch("/api/tts", {
      method: "POST",
      body: JSON.stringify({ text, voice: resolvedVoice, isPreview }),
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
  if (typeof window === "undefined" || !window.speechSynthesis) { onEnd?.(); return; }
  const synth = window.speechSynthesis;
  synth.resume();
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang === lang);
  if (voice) utter.voice = voice;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; onEnd?.(); };
  utter.onend = finish;
  utter.onerror = finish;
  synth.speak(utter);
  // Safety net: some mobile browsers silently drop an utterance (no sound, no onend,
  // no onerror) instead of raising an error — without this the caller's "is playing"
  // state would spin forever.
  setTimeout(finish, Math.max(4000, Math.min(20000, text.length * 180)));
}

export async function playTTS(
  text: string,
  lang: "ja-JP" | "en-US" = "ja-JP",
  opts: { onEnd?: () => void; voice?: VoiceId; isPreview?: boolean } = {}
): Promise<void> {
  stopTTS();
  if (!text.trim()) return;

  if (lang === "en-US") {
    speechSynthFallback(text, lang, 0.9, opts.onEnd);
    return;
  }

  // Known-ineligible (the common case — free tier's daily Gemini-TTS cap is 0) — go
  // straight to the browser fallback, synchronously, instead of awaiting a network
  // call that's guaranteed to fail first. See primeTtsEligibility's comment for why
  // that delay itself was the bug.
  if (ttsEligible === false) {
    speechSynthFallback(text, lang, 0.85, opts.onEnd);
    return;
  }

  try {
    const url = await fetchAudio(text, opts.voice, opts.isPreview);
    const audio = new Audio(url);
    currentAudio = audio;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (currentAudio === audio) currentAudio = null;
      opts.onEnd?.();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    // Safety net matching speechSynthFallback's — a stalled/corrupt stream should
    // still release the caller's "is playing" state rather than spin forever.
    setTimeout(finish, 20000);
    await audio.play();
  } catch {
    speechSynthFallback(text, lang, 0.85, opts.onEnd);
  }
}
