import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PARAGRAPH_PAUSE_S } from '../clip/prepare-audio.js';
import { sentenceRanges } from './note-marks.js';
import { translateChessNotationForSpeech } from '../../../tts/sanToSpokenText.js';
import { setVoiceSpeaking } from '../../../sounds/voice-activity.js';

/** Where a note's audio comes from: the uploaded file on the public page, the
 * browser's voice cache in the editor's preview. Null when the note has none. */
export type NoteAudioSource = (episodeId: string, nodeId: string) => Promise<string | null>;

/** One note plays at a time; stepping on stops the last one. Sound can be
 * switched off. Playback starts from the learner's own click, so browsers
 * allow it. */
export function useNoteAudio(
  source: NoteAudioSource,
  /** A note with no audio file is read in the signed-in learner's own chosen voice (Settings);
   * with voice off, or signed out, only the pre-recorded files are heard. */
  fallback?: {
    textOf: (episodeId: string, nodeId: string) => string | null;
    voice: {
      enabled: boolean;
      play: (messageId: string, text: string, onEnd?: () => void) => void;
      stop: () => void;
      spokenIndex: number | null;
      paused: boolean;
      togglePause: () => void;
    };
  }
): {
  /** `delayMs`: wait before speaking (the move's board sound first). */
  play: (episodeId: string, nodeId: string, delayMs?: number) => void;
  stop: () => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  loading: boolean;
  /** How far into a playing recording the voice is (0..1); null when none is playing. */
  progress: number | null;
  /** The sentence the learner's own voice is on (no recording), counted from the note's start. */
  voiceSentence: number | null;
  /** Something is being read and is held part-way: Resume carries on. */
  paused: boolean;
  /** Pauses the read, or carries on from where it was held. */
  togglePause: () => void;
  /** Jumps to `fraction` (0..1) of a recording and plays from there. */
  seek: (fraction: number) => void;
  /** Reads the note again from sentence `index` in the learner's own voice. */
  readFrom: (index: number) => void;
  /** Why the last note could not be voiced (e.g. the preview's voice failed). */
  error: string | null;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const [soundOn, setSound] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef(0);
  const voiceNoteRef = useRef<{ nodeId: string; text: string } | null>(null);
  const voiceBaseRef = useRef(0);
  const chainRef = useRef(0);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const voiceId = useId();

  const stop = useCallback(() => {
    requestRef.current += 1;
    window.clearTimeout(timerRef.current);
    fallbackRef.current?.voice.stop();
    voiceNoteRef.current = null;
    chainRef.current += 1;
    audioRef.current?.pause();
    setProgress(null);
    setLoading(false);
    setError(null);
  }, []);

  /** Speaks the note from character `from`, a paragraph at a time with a pause between them. */
  const speakFrom = useCallback((voice: NonNullable<typeof fallback>['voice'], nodeId: string, text: string, from: number) => {
    const chain = ++chainRef.current;
    const ranges = sentenceRanges(text);
    const paragraphs = [...text.slice(from).matchAll(/[^\n]+/g)]
      .map((match) => ({ start: from + match.index, text: match[0] }))
      .filter((paragraph) => paragraph.text.trim());
    const speak = (at: number): void => {
      const paragraph = paragraphs[at];
      if (!paragraph || chain !== chainRef.current) return;
      voiceBaseRef.current = ranges.filter((range) => range.start < paragraph.start).length;
      // One id per stretch: the voice keeps each id's audio, so a shared one would replay the first.
      voice.play(`course:${nodeId}:${paragraph.start}`, translateChessNotationForSpeech(paragraph.text), () => {
        if (chain !== chainRef.current || at + 1 >= paragraphs.length) return;
        timerRef.current = window.setTimeout(() => speak(at + 1), PARAGRAPH_PAUSE_S * 1000);
      });
    };
    speak(0);
  }, []);

  const play = useCallback(
    (episodeId: string, nodeId: string, delayMs = 0) => {
      stop();
      if (!soundOn) return;
      const request = requestRef.current;
      setLoading(true);
      source(episodeId, nodeId)
        .then((url) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          if (!url) {
            const text = fallback?.textOf(episodeId, nodeId);
            if (!fallback?.voice.enabled || !text) return;
            voiceNoteRef.current = { nodeId, text };
            timerRef.current = window.setTimeout(() => {
              if (request === requestRef.current) speakFrom(fallback.voice, nodeId, text, 0);
            }, delayMs);
            return;
          }
          if (!audioRef.current) {
            const audio = new Audio();
            // Board sounds step aside while a note speaks (docs/plan.md Phase 88).
            audio.addEventListener('playing', () => {
              setVoiceSpeaking(voiceId, true);
              setPaused(false);
            });
            audio.addEventListener('timeupdate', () => setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0));
            // Held part-way keeps its place; the end (or a failure) clears it.
            audio.addEventListener('pause', () => {
              setVoiceSpeaking(voiceId, false);
              setPaused(true);
            });
            for (const event of ['ended', 'error'] as const)
              audio.addEventListener(event, () => {
                setVoiceSpeaking(voiceId, false);
                setProgress(null);
              });
            audioRef.current = audio;
          }
          const audio = audioRef.current;
          audio.src = url;
          timerRef.current = window.setTimeout(() => {
            if (request === requestRef.current) void audio.play().catch(() => undefined);
          }, delayMs);
        })
        .catch((failure: unknown) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          setError(failure instanceof Error ? failure.message : 'Could not play the note.');
        });
    },
    [source, soundOn, stop, voiceId, fallback, speakFrom]
  );

  const togglePause = useCallback(() => {
    const audio = audioRef.current;
    if (voiceNoteRef.current) {
      fallbackRef.current?.voice.togglePause();
      return;
    }
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !(audio.duration > 0)) return;
    audio.currentTime = Math.min(Math.max(fraction, 0), 1) * audio.duration;
    setProgress(fraction);
    void audio.play().catch(() => undefined);
  }, []);

  const readFrom = useCallback(
    (index: number) => {
      const note = voiceNoteRef.current;
      const voice = fallbackRef.current?.voice;
      const from = note ? sentenceRanges(note.text)[Math.max(index, 0)]?.start : undefined;
      if (!note || !voice || from === undefined) return;
      window.clearTimeout(timerRef.current);
      speakFrom(voice, note.nodeId, note.text, from);
    },
    [speakFrom]
  );

  const voiceSentence = fallback?.voice.spokenIndex != null && voiceNoteRef.current ? fallback.voice.spokenIndex + voiceBaseRef.current : null;

  const setSoundOn = useCallback(
    (on: boolean) => {
      if (!on) stop();
      setSound(on);
    },
    [stop]
  );

  useEffect(
    () => () => {
      stop();
      setVoiceSpeaking(voiceId, false);
    },
    [stop, voiceId]
  );
  return { play, stop, soundOn, setSoundOn, loading, progress, voiceSentence, paused: voiceNoteRef.current ? Boolean(fallback?.voice.paused) : paused, togglePause, seek, readFrom, error };
}
