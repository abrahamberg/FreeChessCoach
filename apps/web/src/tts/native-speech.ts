import type { CoachPersona } from '@freechesscoach/shared';
import { chooseNativeVoice } from './native-voices.js';
import { splitIntoSentences } from './splitSentences.js';

/** Whether this browser exposes the Web Speech synthesis API (mobile
 * browsers, desktop Chrome/Edge/Safari; not every Firefox build). */
export function isNativeSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

// Chrome fills getVoices() asynchronously, starting on the first call — ask
// once at load so the list is ready by the first message, not after it.
if (isNativeSpeechSupported()) window.speechSynthesis.getVoices();

/** A native read that more sentences can be added to while it plays — how a
 * coach reply still streaming in gets spoken sentence by sentence. `finish`
 * says nothing more is coming, so `onEnd` can fire once the last queued
 * sentence has been heard. */
export interface NativeSpeechQueue {
  append: (sentence: string) => void;
  finish: () => void;
  cancel: () => void;
}

/** Reads sentences aloud with the device's built-in voice, in the voice,
 * rate and pitch chosen for `persona` (native-voices.ts), one utterance per
 * sentence — Chrome silently cuts a single long utterance off after ~15 s,
 * and short ones also let a cancel land promptly. `onEnd` fires once, when
 * the queue is finished and its last sentence is done or any sentence
 * errors, and never after `cancel()` (so a click that interrupts one
 * message can't be mistaken for it finishing). Unsupported browsers end as
 * soon as the queue is finished. */
export function createNativeSpeechQueue(persona: CoachPersona, onEnd: () => void): NativeSpeechQueue {
  const synth = isNativeSpeechSupported() ? window.speechSynthesis : null;
  // Empty until the browser has loaded its list (Chrome loads it on the
  // first call); the default voice, with the persona's rate and pitch, is
  // used until then.
  const { voice, rate, pitch } = chooseNativeVoice(persona, synth?.getVoices?.() ?? []);
  let pending = 0;
  let finished = false;
  let cancelled = false;
  let ended = false;

  function end(): void {
    if (cancelled || ended) return;
    ended = true;
    onEnd();
  }

  function endIfDrained(): void {
    if (finished && pending === 0) end();
  }

  // Drop anything still queued from an earlier message before starting.
  synth?.cancel();

  return {
    append(sentence) {
      if (!synth || ended || cancelled) return;
      const utterance = new SpeechSynthesisUtterance(sentence);
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
      utterance.onend = () => {
        pending -= 1;
        endIfDrained();
      };
      pending += 1;
      synth.speak(utterance);
    },
    finish() {
      finished = true;
      endIfDrained();
    },
    cancel() {
      cancelled = true;
      synth?.cancel();
    }
  };
}

/** Reads a whole, already-finished `text` aloud (see createNativeSpeechQueue).
 * Returns a `cancel` function. */
export function speakNative(text: string, persona: CoachPersona, onEnd: () => void): () => void {
  const queue = createNativeSpeechQueue(persona, onEnd);
  const sentences = splitIntoSentences(text);
  for (const sentence of sentences.length > 0 ? sentences : [text]) queue.append(sentence);
  queue.finish();
  return queue.cancel;
}
