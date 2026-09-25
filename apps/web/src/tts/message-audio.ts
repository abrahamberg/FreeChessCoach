import type { CoachPersona } from '@freechesscoach/shared';
import type { TtsClient } from './tts-client.js';

/** One message's synthesized audio: object URLs for each chunk received so
 * far (in order), plus whether synthesis is still in flight. */
export interface MessageAudioState {
  urls: string[];
  /** Fixed when synthesis starts, like the persona and backend it came from. */
  playbackRate: number;
  complete: boolean;
  errored: boolean;
}

/** A message whose text can keep arriving while its audio is generated:
 * `append` queues more text to synthesize after everything before it, and
 * `finish` marks the message done so playback can end after the last chunk. */
export interface MessageAudio {
  state: MessageAudioState;
  append: (text: string) => void;
  finish: () => void;
}

export interface MessageAudioOptions {
  client: TtsClient;
  persona: CoachPersona;
  playbackRate: number;
  /** A chunk was added to `state.urls`. */
  onChunk: (state: MessageAudioState) => void;
  /** `state.complete` or `state.errored` just became true. */
  onSettled: (state: MessageAudioState) => void;
}

/** Synthesizes a message piece by piece, strictly in order — never in
 * parallel, since the player plays chunks in the order they land. Each
 * appended piece is one `client.speak` call, so a coach reply that is still
 * streaming in can have its first sentence playing while later sentences are
 * still being written. A piece failing stops the message there; audio
 * already delivered stays playable. */
export function startMessageAudio(options: MessageAudioOptions): MessageAudio {
  const { client, persona } = options;
  const state: MessageAudioState = {
    urls: [],
    playbackRate: options.playbackRate,
    complete: false,
    errored: false
  };
  let chain = Promise.resolve();

  function addChunk(audio: ArrayBuffer): void {
    state.urls.push(URL.createObjectURL(new Blob([audio], { type: client.mimeType })));
    options.onChunk(state);
  }

  function enqueue(step: () => Promise<void> | void): void {
    chain = chain
      .then(async () => {
        if (!state.errored) await step();
      })
      .catch((error: unknown) => {
        console.log('[message-audio] synthesis failed', error);
        state.errored = true;
        options.onSettled(state);
      });
  }

  return {
    state,
    append(text) {
      enqueue(() => client.speak({ text, persona }, (_index, audio) => addChunk(audio)));
    },
    finish() {
      enqueue(() => {
        state.complete = true;
        options.onSettled(state);
      });
    }
  };
}
