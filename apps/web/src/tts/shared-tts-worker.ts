import type { KokoroVoiceId } from './persona-voices.js';

export interface TtsWorkerLike {
  postMessage(message: TtsSpeakMessage, transfer?: Transferable[]): void;
  onmessage: ((event: { data: TtsWorkerMessage }) => void) | null;
  terminate(): void;
}

/** Sent from the client to kokoro-worker.ts. */
export interface TtsSpeakMessage {
  type: 'speak';
  id: string;
  text: string;
  voice: KokoroVoiceId;
}

/** Posted by kokoro-worker.ts as it lazily loads the model on the first
 * speak() call, purely informational (no handshake gating — the worker
 * queues its own model load internally, so the client can post a speak
 * request immediately). */
export interface TtsStatusMessage {
  type: 'status';
  status: 'loading' | 'ready';
}

export interface TtsResultMessage {
  type: 'result';
  id: string;
  /** WAV bytes (RawAudio#toWav()), transferred rather than copied. */
  audio: ArrayBuffer;
}

export interface TtsErrorMessage {
  type: 'error';
  id: string;
  message: string;
}

export type TtsWorkerMessage = TtsStatusMessage | TtsResultMessage | TtsErrorMessage;

export type TtsInstallStatus = 'absent' | 'loading' | 'ready';

export interface SpeakRequest {
  text: string;
  voice: KokoroVoiceId;
}

export interface SharedTtsWorkerOptions {
  createWorker?: () => TtsWorkerLike;
}

function defaultCreateWorker(): TtsWorkerLike {
  return new Worker(new URL('./kokoro-worker.ts', import.meta.url), { type: 'module' }) as unknown as TtsWorkerLike;
}

interface QueuedSpeak {
  request: TtsSpeakMessage;
  resolve: (audio: ArrayBuffer) => void;
  reject: (error: Error) => void;
}

/** Owns the single Kokoro TTS Worker — one model instance for the whole app,
 * same reasoning as SharedEngineWorker for Stockfish. Serializes speak()
 * calls: onnxruntime-web can only run one inference at a time here. Unlike
 * SharedEngineWorker there's no UCI handshake to wait on — the worker queues
 * its own (one-time) model load internally, so a speak request can be posted
 * immediately; `status` is purely informational for the UI. */
export class SharedTtsWorker {
  private worker: TtsWorkerLike | null = null;
  private readonly createWorker: () => TtsWorkerLike;
  private ttsStatus: TtsInstallStatus = 'absent';
  private readonly listeners = new Set<(status: TtsInstallStatus) => void>();
  private active = false;
  private currentResolve: ((audio: ArrayBuffer) => void) | null = null;
  private currentReject: ((error: Error) => void) | null = null;
  private readonly pending: QueuedSpeak[] = [];

  constructor(options: SharedTtsWorkerOptions = {}) {
    this.createWorker = options.createWorker ?? defaultCreateWorker;
  }

  get status(): TtsInstallStatus {
    return this.ttsStatus;
  }

  /** Notifies on every status change and immediately with the current value,
   * so a component mounting mid-load still renders the right thing. Returns
   * an unsubscribe. */
  subscribe(listener: (status: TtsInstallStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.ttsStatus);
    return () => this.listeners.delete(listener);
  }

  speak(request: SpeakRequest): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pending.push({ request: { type: 'speak', id, text: request.text, voice: request.voice }, resolve, reject });
      this.ensureWorker();
      this.pump();
    });
  }

  private setStatus(status: TtsInstallStatus): void {
    if (this.ttsStatus === status) return;
    this.ttsStatus = status;
    for (const listener of this.listeners) listener(status);
  }

  private rejectPending(error: unknown): void {
    const reason = error instanceof Error ? error : new Error(String(error));
    while (this.pending.length > 0) this.pending.shift()?.reject(reason);
  }

  private ensureWorker(): void {
    if (this.worker) return;

    let worker: TtsWorkerLike;
    try {
      worker = this.createWorker();
    } catch (error) {
      // Mirrors SharedEngineWorker: constructing the Worker can fail outright
      // (no Worker global in tests/SSR) — report absent and let the next
      // speak() retry rather than throwing out of here.
      this.setStatus('absent');
      this.rejectPending(error);
      return;
    }

    this.worker = worker;
    worker.onmessage = (event) => this.handleMessage(event.data);
  }

  private handleMessage(data: TtsWorkerMessage): void {
    if (data.type === 'status') {
      this.setStatus(data.status);
      return;
    }
    this.active = false;
    const resolve = this.currentResolve;
    const reject = this.currentReject;
    this.currentResolve = null;
    this.currentReject = null;
    if (data.type === 'result') resolve?.(data.audio);
    else reject?.(new Error(data.message));
    this.pump();
  }

  private pump(): void {
    if (this.active || this.pending.length === 0) return;
    const worker = this.worker;
    if (!worker) return;
    const next = this.pending.shift();
    if (!next) return;
    this.active = true;
    this.currentResolve = next.resolve;
    this.currentReject = next.reject;
    worker.postMessage(next.request);
  }
}
