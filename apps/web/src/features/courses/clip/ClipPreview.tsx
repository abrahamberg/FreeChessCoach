import { COACH_PERSONA_INFO, type CourseDocument } from '@freechesscoach/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VolumeOffIcon, VolumeOnIcon } from '../../../components/Icon.js';
import { Modal } from '../../../components/Modal.js';
import { personaPlaybackRate } from '../../../tts/persona-voices.js';
import { audioLengths, ClipPlayer } from './clip-player.js';
import { loadClipAssets, type ClipAssets } from './draw-frame.js';
import { recordClip, type RecordedClip } from './record-clip.js';
import { clipSoundBuffers, type ClipSound } from './clip-sounds.js';
import { buildReelTimeline } from './reel-timeline.js';
import { buildVideoTimeline, CLIP_SIZES, PRODUCT_FORMAT, type ClipProduct } from './timeline.js';
import type { CourseEvals } from '../player/course-move-list.js';
import { useClipAudio } from './useClipAudio.js';
import { COURSE_VOICE_LABELS, useCourseVoice, type CourseVoice } from './useCourseVoice.js';
import './ClipPreview.css';

export interface ClipPreviewProps {
  document: CourseDocument;
  slug: string;
  /** The moves' evaluations (bad and great sounds for either side). */
  evals: CourseEvals;
  onClose: () => void;
}

/** The videos this draft has something for: the YouTube video once a move
 * speaks in it or it has a hook, the reel once it has words. */
export function previewableProducts(document: CourseDocument): ClipProduct[] {
  const video = Boolean(document.video?.hook.trim()) || document.episodes.some((episode) => episode.plies.some((ply) => ply.video));
  const reel = Boolean(document.reel && (document.reel.hook.trim() || document.reel.beats.length));
  return [...(video ? (['video'] as const) : []), ...(reel ? (['reel'] as const) : [])];
}

const PRODUCT_LABELS: Record<ClipProduct, string> = { video: 'YouTube video (16:9)', reel: 'Reel (9:16)' };

/** "Preview": the draft's YouTube video or reel played live on the canvas
 * with the coach's voice, and recorded from the same playback (docs/courses.md
 * §13.3–13.4). Unsaved edits are included. */
export function ClipPreview({ document, slug, evals, onClose }: ClipPreviewProps): ReactNode {
  const { voice: backend, setVoice: setPicked, voices, ready } = useCourseVoice();
  const audio = useClipAudio(document, backend);
  const products = previewableProducts(document);
  const [product, setProduct] = useState<ClipProduct>(products[0] ?? 'video');
  const [assets, setAssets] = useState<ClipAssets | null>(null);
  // Board sounds under the moves (docs/plan.md Phase 88); the recording has
  // them exactly when the preview plays them.
  const [boardSounds, setBoardSounds] = useState(true);
  const [soundBuffers, setSoundBuffers] = useState<Record<ClipSound, AudioBuffer> | null>(null);

  useEffect(() => {
    let live = true;
    void clipSoundBuffers()
      .then((loaded) => live && setSoundBuffers(loaded))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void loadClipAssets().then((loaded) => live && setAssets(loaded));
    return () => {
      live = false;
    };
  }, []);

  // Stable, so the timeline and the player are rebuilt only when it changes.
  const sounds = useMemo(() => (boardSounds && soundBuffers ? { evals, buffers: soundBuffers } : null), [boardSounds, soundBuffers, evals]);

  let status: string | null = null;
  if (!ready) status = 'Loading…';
  else if (audio.status === 'preparing') status = `Making the coach's voice: ${audio.progress.done} of ${audio.progress.total || '…'} sentences`;
  else if (audio.status === 'error') status = audio.message;
  else if (!assets) status = 'Loading the board…';

  return (
    <Modal title="Preview" onClose={onClose}>
      <div className="clip-preview">
        <div className="clip-preview__formats" role="radiogroup" aria-label="Video">
          {products.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={product === option}
              className={product === option ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setProduct(option)}
            >
              {PRODUCT_LABELS[option]}
            </button>
          ))}
        </div>
        <button type="button" className={boardSounds ? 'btn-primary clip-preview__sounds' : 'btn-secondary clip-preview__sounds'} aria-pressed={boardSounds} onClick={() => setBoardSounds(!boardSounds)}>
          {boardSounds ? <VolumeOnIcon width={16} height={16} /> : <VolumeOffIcon width={16} height={16} />}
          Board sounds {boardSounds ? 'on' : 'off'}
        </button>
        <label className="course-field">
          <span>Voice</span>
          <select value={backend} onChange={(event) => setPicked(event.target.value as CourseVoice)}>
            {voices.map((voice) => (
              <option key={voice} value={voice}>
                {COURSE_VOICE_LABELS[voice]}
              </option>
            ))}
          </select>
        </label>
        {status && <p className="clip-preview__status">{status}</p>}
        {audio.status === 'ready' && assets && (
          <ClipStage
            key={product}
            document={document}
            slug={slug}
            product={product}
            context={audio.context}
            buffers={audio.buffers}
            assets={assets}
            playbackRate={personaPlaybackRate(document.coachPersona, backend)}
            sounds={sounds}
          />
        )}
      </div>
    </Modal>
  );
}

function ClipStage(props: {
  document: CourseDocument;
  slug: string;
  product: ClipProduct;
  context: AudioContext;
  buffers: Map<string, AudioBuffer>;
  assets: ClipAssets;
  playbackRate: number;
  sounds: { evals: CourseEvals; buffers: Record<ClipSound, AudioBuffer> } | null;
}): ReactNode {
  const { document, product, context, buffers, assets, playbackRate, sounds } = props;
  const format = PRODUCT_FORMAT[product];
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<ClipPlayer | null>(null);
  const onEnd = useRef<(() => void) | null>(null);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<(RecordedClip & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeline = useMemo(() => {
    const lengths = audioLengths(buffers, playbackRate);
    const options = { document, audioMs: (key: string) => lengths.get(key), sounds: sounds && { evals: sounds.evals } };
    return product === 'reel' ? buildReelTimeline(options) : buildVideoTimeline(options);
  }, [document, product, buffers, playbackRate, sounds]);
  const size = CLIP_SIZES[format];

  useEffect(() => {
    if (!canvas.current) return;
    const created = new ClipPlayer({
      canvas: canvas.current,
      context,
      timeline,
      buffers,
      soundBuffers: sounds?.buffers ?? null,
      playbackRate,
      frame: {
        title: document.title,
        persona: document.coachPersona,
        coachName: COACH_PERSONA_INFO[document.coachPersona].label,
        orientation: document.learnerSide,
        link: `${window.location.host}/learn/${props.slug}`,
        assets
      },
      onTime: setMs,
      onEnd: () => {
        setPlaying(false);
        onEnd.current?.();
      }
    });
    player.current = created;
    return () => created.destroy();
  }, [timeline, context, buffers, sounds, playbackRate, assets, document, props.slug]);

  useEffect(() => () => {
    if (recorded) URL.revokeObjectURL(recorded.url);
  }, [recorded]);

  function toggle(): void {
    const current = player.current;
    if (!current) return;
    if (current.isPlaying) {
      current.pause();
      setPlaying(false);
    } else {
      void current.play();
      setPlaying(true);
    }
  }

  function record(): void {
    const current = player.current;
    if (!current || !canvas.current) return;
    setError(null);
    setRecording(true);
    setPlaying(true);
    recordClip(current, canvas.current, context, (listener) => (onEnd.current = listener))
      .then((clip) => setRecorded({ ...clip, url: URL.createObjectURL(clip.blob) }))
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Recording failed.'))
      .finally(() => {
        onEnd.current = null;
        setRecording(false);
      });
  }

  return (
    <div className="clip-preview__stage">
      <canvas ref={canvas} width={size.width} height={size.height} className={`clip-preview__canvas clip-preview__canvas--${format}`} aria-label="Video preview" />
      <div className="clip-preview__controls">
        <button type="button" className="btn-primary" onClick={toggle} disabled={recording}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          className="clip-preview__scrubber"
          min={0}
          max={timeline.durationMs}
          step={100}
          value={ms}
          disabled={recording}
          aria-label="Position"
          onChange={(event) => {
            const next = Number(event.target.value);
            setMs(next);
            player.current?.seek(next);
          }}
        />
        <span className="clip-preview__time">
          {clock(ms)} / {clock(timeline.durationMs)}
        </span>
      </div>
      <div className="clip-preview__controls">
        <button type="button" className="btn-secondary" onClick={record} disabled={recording}>
          {recording ? 'Recording… (plays to the end)' : 'Record'}
        </button>
        {recorded && (
          <a className="btn-secondary" href={recorded.url} download={`${props.slug}-${product === 'reel' ? 'reel' : 'youtube'}.${recorded.extension}`}>
            Download .{recorded.extension}
          </a>
        )}
      </div>
      {recorded?.extension === 'webm' && <p className="meta">This browser records WebM. YouTube takes it; for Instagram or TikTok, convert it to MP4 or record in Safari.</p>}
      {error && (
        <p className="course-intake__errors" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
