import type { CourseDocument } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import type { TtsClient } from '../../../tts/tts-client.js';
import { audioCacheKey, courseSpeeches, KOKORO_ONLY, openCourseAudioCache, prepareCourseAudio, type AudioCache, type SpokenAudio } from './prepare-audio.js';


function course(): CourseDocument {
  return {
    version: 1,
    kind: 'trap',
    title: 'T',
    promise: '',
    learnerSide: 'black',
    levelBand: 'novice',
    coachPersona: 'commander',
    startFen: 'start',
    nodes: [],
    lines: [],
    chapters: [],
    episodes: [
      {
        id: 'e1', role: 'hook', focus: '', startNodeId: 'n1', endNodeId: 'n1', drillNodeIds: [],
        plies: [{ nodeId: 'n1', text: 'Six... Bb4 pins it.', arrows: [], course: true, video: false }]
      },
      // The same words again are synthesised once; a video move with no words is skipped.
      {
        id: 'e2', role: 'bait', focus: '', startNodeId: 'n2', endNodeId: 'n2', drillNodeIds: [],
        plies: [{ nodeId: 'n2', text: '  ', arrows: [], course: false, video: true }, { nodeId: 'n3', text: 'Greed loses.', arrows: [], course: false, video: true }]
      }
    ],
    takeaways: [],
    hookOptions: [],
    clipLinks: {},
    video: { title: 'Greed', thumbnailText: 'Greed', hook: 'Greed loses.', outro: '' }
  };
}

function fakeClient(fail = false): TtsClient & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    mimeType: 'audio/wav',
    speak: vi.fn(({ text }, onChunk) => {
      texts.push(text);
      if (fail) return Promise.reject(new Error('voice down'));
      onChunk(0, new TextEncoder().encode(`${text}#0`).buffer);
      onChunk(1, new TextEncoder().encode(`${text}#1`).buffer);
      return Promise.resolve();
    })
  };
}

function memoryCache(): AudioCache & { entries: Map<string, SpokenAudio> } {
  const entries = new Map<string, SpokenAudio>();
  return { entries, get: (key) => Promise.resolve(entries.get(key)), set: (key, audio) => Promise.resolve(void entries.set(key, audio)) };
}

describe('prepareCourseAudio', () => {
  test('the video hook, the video lines and the course lines, each text synthesised once, chunks kept in order', async () => {
    const client = fakeClient();
    const progress: string[] = [];

    const audio = await prepareCourseAudio({ document: course(), backend: 'browser', cache: memoryCache(), client, onProgress: ({ done, total }) => progress.push(`${done}/${total}`) });

    expect(courseSpeeches(course()).map((speech) => speech.key)).toEqual(['video:hook', 'note:e1:n1', 'clip:e2:n3']);
    expect([...audio.keys()]).toEqual(['video:hook', 'note:e1:n1', 'clip:e2:n3']);
    expect(client.texts).toHaveLength(2);
    expect(client.texts[1]).not.toContain('Bb4');
    expect(new TextDecoder().decode(audio.get('clip:e2:n3')!.chunks[1])).toBe('Greed loses.#1');
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
  });

  test('cached sentences are not synthesised again; the voice is part of the key', async () => {
    const cache = memoryCache();
    await prepareCourseAudio({ document: course(), backend: 'browser', cache, client: fakeClient() });
    const again = fakeClient();

    await prepareCourseAudio({ document: course(), backend: 'browser', cache, client: again });
    expect(again.texts).toEqual([]);

    await prepareCourseAudio({ document: { ...course(), coachPersona: 'scholar' }, backend: 'browser', cache, client: again });
    expect(again.texts).toHaveLength(2);
    expect(cache.entries.has(audioCacheKey('browser', 'scholar', 'Greed loses.'))).toBe(true);
  });

  test("the video's tempting moves and outro, then the reel's lines, each with its key", () => {
    const document = course();
    document.episodes[1]!.plies[1] = { ...document.episodes[1]!.plies[1]!, tempting: [{ san: 'Qxc3+', why: 'It gives the win away.' }] };
    document.video = { title: 'Greed', thumbnailText: 'Greed', hook: '', outro: 'Would you take it?' };
    document.reel = {
      style: 'highlight', startNodeId: 'n1', climaxNodeId: 'n2', endNodeId: 'n2', hook: 'A trap in eight.', topText: 'Black to play',
      beats: [{ nodeId: 'n2', say: 'Mate.', caption: 'Mate' }], payoff: 'Mate', cta: 'Follow for a trap a day.', loop: ''
    };
    expect(courseSpeeches(document).map((speech) => speech.key)).toEqual([
      'note:e1:n1', 'tempting:e2:n3:0', 'clip:e2:n3', 'video:outro', 'reel:hook', 'reel:beat:n2', 'reel:cta'
    ]);
  });

  test('nothing comes back unless every sentence has audio', async () => {
    await expect(prepareCourseAudio({ document: course(), backend: 'local', cache: memoryCache(), client: fakeClient(true) })).rejects.toThrow('voice down');
  });

  test('only Kokoro voices a course: OpenAI and the device voice are refused', async () => {
    for (const backend of ['openai', 'native'] as never[]) {
      await expect(prepareCourseAudio({ document: course(), backend, cache: memoryCache(), client: fakeClient() })).rejects.toThrow(KOKORO_ONLY);
    }
  });

  test('the cache works without IndexedDB', async () => {
    const cache = openCourseAudioCache();
    const audio = { mimeType: 'audio/wav', chunks: [new ArrayBuffer(4)] };
    await cache.set('k', audio);
    expect(await cache.get('k')).toBe(audio);
  });
});
