import { KokoroTTS } from 'kokoro-js';
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

function loadModel(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    ctx.postMessage({ type: 'status', status: 'loading' });
    const promise = KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8' }).then((tts) => {
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

async function handleSpeak(id: string, text: string, voice: KokoroVoiceId): Promise<void> {
  try {
    const tts = await loadModel();
    const raw = await tts.generate(text, { voice });
    const wav = raw.toWav();
    ctx.postMessage({ type: 'result', id, audio: wav }, [wav]);
  } catch (error) {
    ctx.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
}

ctx.onmessage = (event) => {
  const { id, text, voice } = event.data;
  void handleSpeak(id, text, voice);
};
