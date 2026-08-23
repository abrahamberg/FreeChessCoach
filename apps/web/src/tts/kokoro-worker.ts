import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import type { KokoroVoiceId } from './persona-voices.js';
import type { TtsSpeakMessage, TtsWorkerMessage } from './shared-tts-worker.js';

// This app's tsconfig includes the "DOM" lib for the main thread (React
// components use window/document types), which conflicts with "webworker"
// lib globals if both are referenced in the same TS program — so `self` is
// typed by hand here instead of relying on DedicatedWorkerGlobalScope.
interface WorkerGlobalLike {
  postMessage(message: TtsWorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: { data: TtsSpeakMessage }) => void) | null;
}

const ctx = self as unknown as WorkerGlobalLike;

// See ../../README or the spike notes in the coach-voice plan: this is the
// same model id kokoro-js's own README uses. q8 quantization trades a little
// quality for a much smaller download than the fp32 default.
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// device left unspecified (-> WASM, single-threaded, no COOP/COEP needed —
// see the plan) deliberately, not as an oversight: WebGPU was tried here and
// reverted. onnxruntime-web's WebGPU execution provider doesn't fully cover
// this model's ops (VerifyEachNodeIsAssignedToAnEp warnings at runtime, some
// nodes silently falling back) and produced corrupted/garbled audio on real
// hardware, while also being slower to first-load (bigger fp32 weights +
// shader compilation). WASM q8 is slower per call but the only backend
// confirmed to produce correct audio.
let ttsPromise: Promise<KokoroTTS> | null = null;

// TEMPORARY diagnostic logging — remove once the real-world latency/cutoff
// issue this is instrumenting is root-caused and fixed.
const startedAt = performance.now();
function log(...args: unknown[]): void {
  console.log(`[kokoro-worker +${Math.round(performance.now() - startedAt)}ms]`, ...args);
}

function loadModel(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    log('model load starting', {
      crossOriginIsolated: (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency
    });
    ctx.postMessage({ type: 'status', status: 'loading' });
    const promise = KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8' }).then((tts) => {
      log('model load finished');
      ctx.postMessage({ type: 'status', status: 'ready' });
      return tts;
    });
    ttsPromise = promise;
    // A failed load shouldn't stay cached as a rejected promise forever —
    // let the next speak() attempt retry.
    promise.catch(() => {
      if (ttsPromise === promise) ttsPromise = null;
    });
  }
  return ttsPromise;
}

// stream() (vs. generate()) synthesizes sentence-by-sentence, yielding each
// chunk as it's ready — lets the client start playing the first sentence in
// a few seconds instead of waiting for the whole (often multi-sentence)
// coach reply to finish generating before any sound plays. Total synthesis
// time is the same; only time-to-first-audio improves.
//
// stream() takes a TextSplitterStream, not a plain string, even though the
// type signature allows a bare string — kokoro-js's own README only
// documents the TextSplitterStream form (push text incrementally as an LLM
// produces it, then close() once done). Passing a string directly hung
// forever with zero chunks yielded and no error: whatever internal stream it
// creates from the string is apparently never closed, so the generator just
// waits for more input that never arrives. We already have the whole text
// upfront, so push it once and close immediately.
async function handleSpeak(id: string, text: string, voice: KokoroVoiceId): Promise<void> {
  log('handleSpeak start', { textLength: text.length, text });
  try {
    const tts = await loadModel();
    const splitter = new TextSplitterStream();
    splitter.push(text);
    splitter.close();
    let index = 0;
    for await (const { text: chunkText, audio } of tts.stream(splitter, { voice })) {
      log('chunk ready', { index, chunkText, durationSec: audio.audio.length / audio.sampling_rate });
      const wav = audio.toWav();
      ctx.postMessage({ type: 'chunk', id, index, audio: wav }, [wav]);
      index += 1;
    }
    log('stream done', { totalChunks: index });
    ctx.postMessage({ type: 'done', id });
  } catch (error) {
    log('error', error);
    ctx.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
}

ctx.onmessage = (event) => {
  const { id, text, voice } = event.data;
  void handleSpeak(id, text, voice);
};
