import type { CoachPersona } from '@freechesscoach/shared';
import { chooseNativeVoice } from './native-voices.js';
import { splitIntoSentences } from './splitSentences.js';

/** Whether this browser exposes the Web Speech synthesis API (mobile
 * browsers, desktop Chrome/Edge/Safari; not every Firefox build). */
export function isNativeSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

// Chrome fills getVoices() asynchronously, starting on the first call — ask
// once at load so the list is ready by the first message, not after it.
if (isNativeSpeechSupported()) window.speechSynthesis.getVoices();

/** Reads `text` aloud with the device's built-in voice, in the voice, rate
 * and pitch chosen for `persona` (native-voices.ts), one utterance per
 * sentence — Chrome silently cuts a single long utterance off after ~15 s,
 * and short ones also let a cancel land promptly. Returns a `cancel`
 * function; `onEnd` fires once when the last sentence finishes or any
 * sentence errors, and never fires after `cancel()` (so a click that
 * interrupts one message can't be mistaken for it finishing). Unsupported
 * browsers end immediately. */
export function speakNative(text: string, persona: CoachPersona, onEnd: () => void): () => void {
  if (!isNativeSpeechSupported()) {
    onEnd();
    return () => {};
  }
  const synth = window.speechSynthesis;
  // Empty until the browser has loaded its list (Chrome loads it on the
  // first call); the default voice, with the persona's rate and pitch, is
  // used until then.
  const { voice, rate, pitch } = chooseNativeVoice(persona, synth.getVoices?.() ?? []);
  const sentences = splitIntoSentences(text);
  const parts = sentences.length > 0 ? sentences : [text];
  let cancelled = false;
  let ended = false;

  function end(): void {
    if (cancelled || ended) return;
    ended = true;
    onEnd();
  }

  // Drop anything still queued from an earlier message before starting.
  synth.cancel();
  for (const [index, part] of parts.entries()) {
    const utterance = new SpeechSynthesisUtterance(part);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onerror = () => {
      synth.cancel();
      end();
    };
    if (index === parts.length - 1) utterance.onend = end;
    synth.speak(utterance);
  }

  return () => {
    cancelled = true;
    synth.cancel();
  };
}
