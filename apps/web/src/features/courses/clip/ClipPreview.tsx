import { COACH_PERSONA_INFO, type CourseDocument } from '@freechesscoach/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../../../components/Modal.js';
import { personaPlaybackRate } from '../../../tts/persona-voices.js';
import { audioLengths, ClipPlayer } from './clip-player.js';
import { loadClipAssets, type ClipAssets } from './draw-frame.js';
import { recordClip, type RecordedClip } from './record-clip.js';
import { buildClipTimeline, CLIP_SIZES, defaultClipFormat, type ClipFormat } from './timeline.js';
import { useClipAudio } from './useClipAudio.js';
import { COURSE_VOICE_LABELS, useCourseVoice, type CourseVoice } from './useCourseVoice.js';
import './ClipPreview.css';

export interface ClipPreviewProps {
  document: CourseDocument;
  slug: string;
  onClose: () => void;
}

/** Task 81.2, "Preview clip": the draft's clip played live on the canvas
 * with the coach's voice, in either format, and recorded from the same
 * playback. Unsaved edits are included. */
export function ClipPreview({ document, slug, onClose }: ClipPreviewProps): ReactNode {
  const { voice: backend, setVoice: setPicked, voices, ready } = useCourseVoice();
  const audio = useClipAudio(document, backend);
  const [format, setFormat] = useState<ClipFormat>(defaultClipFormat(document.kind));
  const [assets, setAssets] = useState<ClipAssets | null>(null);

  useEffect(() => {
    let live = true;
    void loadClipAssets().then((loaded) => live && setAssets(loaded));
    return () => {
      live = false;
    };
  }, []);

  let status: string | null = null;
  if (!ready) status = 'Loading…';
  else if (audio.status === 'preparing') status = `Making the coach's voice: ${audio.progress.done} of ${audio.progress.total || '…'} sentences`;
  else if (audio.status === 'error') status = audio.message;
  else if (!assets) status = 'Loading the board…';

  return (
    <Modal title="Preview clip" onClose={onClose}>
      <div className="clip-preview">
        <div className="clip-preview__formats" role="radiogroup" aria-label="Format">
          {(['vertical', 'landscape'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={format === option}
              className={format === option ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setFormat(option)}
            >
              {option === 'vertical' ? '9:16 reel' : '16:9 YouTube'}
            </button>
          ))}
        </div>
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
          <ClipStage key={format} document={document} slug={slug} format={format} context={audio.context} buffers={audio.buffers} assets={assets} playbackRate={personaPlaybackRate(document.coachPersona, backend)} />
        )}
      </div>
    </Modal>
  );
}

function ClipStage(props: {
  document: CourseDocument;
  slug: string;
  format: ClipFormat;
  context: AudioContext;
  buffers: Map<string, AudioBuffer>;
  assets: ClipAssets;
  playbackRate: number;
}): ReactNode {
  const { document, format, context, buffers, assets, playbackRate } = props;
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
    return buildClipTimeline({ document, format, audioMs: (key) => lengths.get(key) });
  }, [document, format, buffers, playbackRate]);
  const size = CLIP_SIZES[format];

  useEffect(() => {
    if (!canvas.current) return;
    const created = new ClipPlayer({
      canvas: canvas.current,
      context,
      timeline,
      buffers,
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
  }, [timeline, context, buffers, playbackRate, assets, document, props.slug]);

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
      <canvas ref={canvas} width={size.width} height={size.height} className={`clip-preview__canvas clip-preview__canvas--${format}`} aria-label="Clip preview" />
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
          <a className="btn-secondary" href={recorded.url} download={`${props.slug}-${format === 'vertical' ? '9x16' : '16x9'}.${recorded.extension}`}>
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
