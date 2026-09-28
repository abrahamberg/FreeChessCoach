import type { CoachPersona, CourseDocument, TtsBackend } from '@freechesscoach/shared';
import { resolveTtsClient } from '../../../tts/resolve-tts-client.js';
import { translateChessNotationForSpeech } from '../../../tts/sanToSpokenText.js';
import type { TtsClient } from '../../../tts/tts-client.js';

/** One sentence group the coach says: a clip beat or a course note. */
export interface CourseSpeech {
  /** `beat:<episodeId>:<index>`, `quiz:<episodeId>` (the clip's quiz
   * prompt) or `note:<episodeId>:<nodeId>`. */
  key: string;
  text: string;
}

/** A spoken text's audio: the backend's chunks in order (Kokoro gives one
 * per sentence), all in `mimeType`. */
export interface SpokenAudio {
  mimeType: string;
  chunks: ArrayBuffer[];
}

export interface AudioCache {
  get(key: string): Promise<SpokenAudio | undefined>;
  set(key: string, audio: SpokenAudio): Promise<void>;
}

export interface PrepareProgress {
  done: number;
  total: number;
}

export const NATIVE_VOICE_REFUSED =
  "The device's built-in voice can't be recorded. Pick the browser voice, a local voice or OpenAI in Settings.";

/** Everything the course's coach says, in document order: every beat that
 * has words, the quiz prompt, then every note. */
export function courseSpeeches(document: CourseDocument): CourseSpeech[] {
  return document.episodes.flatMap((episode) => [
    ...episode.beats.flatMap((beat, index) => (beat.say.trim() ? [{ key: `beat:${episode.id}:${index}`, text: beat.say }] : [])),
    ...(episode.quiz?.prompt.trim() ? [{ key: `quiz:${episode.id}`, text: episode.quiz.prompt }] : []),
    ...episode.notes.flatMap((note) => (note.text.trim() ? [{ key: `note:${episode.id}:${note.nodeId}`, text: note.text }] : []))
  ]);
}

/** docs/courses.md §8, "all audio first, then record": synthesises every
 * beat and note with the course coach's voice, one at a time, reusing what
 * the cache already holds. Resolves only once every sentence has audio;
 * any failure rejects the whole run. Identical texts are synthesised once. */
export async function prepareCourseAudio(options: {
  document: CourseDocument;
  backend: TtsBackend;
  cache: AudioCache;
  onProgress?: (progress: PrepareProgress) => void;
  signal?: AbortSignal;
  /** Tests pass a fake; the app resolves the backend's client. */
  client?: TtsClient;
  /** Only these speech keys (publishing voices just the notes missing audio). */
  keys?: Set<string>;
}): Promise<Map<string, SpokenAudio>> {
  const { document, backend, cache, onProgress, signal, keys } = options;
  if (backend === 'native') throw new Error(NATIVE_VOICE_REFUSED);
  const client = options.client ?? resolveTtsClient(backend);
  const persona = document.coachPersona;
  const speeches = courseSpeeches(document).filter((speech) => !keys || keys.has(speech.key));
  const texts = [...new Set(speeches.map((speech) => speech.text))];
  const byText = new Map<string, SpokenAudio>();

  onProgress?.({ done: 0, total: texts.length });
  for (const [index, text] of texts.entries()) {
    signal?.throwIfAborted();
    const key = audioCacheKey(backend, persona, text);
    let audio = await cache.get(key);
    if (!audio) {
      audio = await synthesise(client, persona, text);
      await cache.set(key, audio);
    }
    byText.set(text, audio);
    onProgress?.({ done: index + 1, total: texts.length });
  }
  return new Map(speeches.map((speech) => [speech.key, byText.get(speech.text)!]));
}

/** The cache key: the voice (backend + coach) and the exact text, so an
 * edit only re-synthesises the sentences that changed. */
export function audioCacheKey(backend: TtsBackend, persona: CoachPersona, text: string): string {
  return `${backend}|${persona}|${text}`;
}

async function synthesise(client: TtsClient, persona: CoachPersona, text: string): Promise<SpokenAudio> {
  const chunks: ArrayBuffer[] = [];
  await client.speak({ text: translateChessNotationForSpeech(text), persona }, (index, audio) => {
    chunks[index] = audio;
  });
  const present = chunks.filter(Boolean);
  if (!present.length) throw new Error(`No audio came back for "${text.slice(0, 40)}"`);
  return { mimeType: client.mimeType, chunks: present };
}

const DB_NAME = 'course-audio';
const STORE = 'audio';

/** IndexedDB-backed cache that never fails a run: when storage is missing,
 * blocked or throws (private windows, previews), it falls back to memory. */
export function openCourseAudioCache(): AudioCache {
  const memory = new Map<string, SpokenAudio>();
  let database: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    database ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return database;
  };
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
    const db = await open();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    async get(key) {
      return memory.get(key) ?? ((await run('readonly', (store) => store.get(key))) as SpokenAudio | undefined);
    },
    async set(key, audio) {
      memory.set(key, audio);
      await run('readwrite', (store) => store.put(audio, key));
    }
  };
}
