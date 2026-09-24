import {
  DEFAULT_LOCAL_ENDPOINTS,
  type LlmSetup,
  type LlmSetupStatus,
  type LocalLlmType,
  type TierReasoning
} from '@freechesscoach/shared';
import { useMemo, useState } from 'react';

export const DEFAULT_CLOUD_ENDPOINT = 'https://api.openai.com/v1';
/** Powerful enough for the coach and cheap enough for summaries, so one
 * model serves both tiers and the low model is left blank. */
const DEFAULT_MODEL = 'gpt-6-luna';
const DEFAULT_VOICE_MODEL = 'gpt-4o-mini-tts';

export type SetupKind = 'cloud' | 'local';

export interface LlmSetupDraft {
  kind: SetupKind;
  endpoint: string;
  apiKey: string;
  lowModel: string;
  highModel: string;
  voiceModel: string;
  useFlex: boolean;
  localType: LocalLlmType;
  localToken: string;
  /** Advanced: separate low/high models, a token, and thinking levels. */
  advanced: boolean;
  reasoning: TierReasoning;
}

export interface LlmSetupDraftApi {
  draft: LlmSetupDraft;
  update(patch: Partial<LlmSetupDraft>): void;
  setKind(kind: SetupKind): void;
  setLocalType(localType: LocalLlmType): void;
  /** Basic local mode: one model for both tiers. */
  setLocalModel(model: string): void;
  toSetup(): LlmSetup;
}

const LOCAL_DEFAULTS = new Set<string>(Object.values(DEFAULT_LOCAL_ENDPOINTS));

/** The server type's default URL; 'other' has none, so it keeps `current`. */
function localEndpointFor(localType: LocalLlmType, current: string): string {
  return localType === 'other' ? current : DEFAULT_LOCAL_ENDPOINTS[localType];
}

/** Starts from the saved setup, if any (an edit keeps what was saved; the
 * API key is never sent back, so it starts empty). */
export function initialDraft(status: LlmSetupStatus): LlmSetupDraft {
  const kind: SetupKind = status.protocol === 'local' ? 'local' : 'cloud';
  const localType = status.localType ?? 'lm-studio';
  const fallbackEndpoint = kind === 'local' ? localEndpointFor(localType, DEFAULT_LOCAL_ENDPOINTS['lm-studio']) : DEFAULT_CLOUD_ENDPOINT;
  const highModel = status.highModel ?? (kind === 'local' ? '' : DEFAULT_MODEL);
  // Blank means "same as the high model".
  const lowModel = status.lowModel && status.lowModel !== highModel ? status.lowModel : '';
  return {
    kind,
    endpoint: status.endpoint ?? fallbackEndpoint,
    apiKey: '',
    lowModel,
    highModel,
    voiceModel: status.voiceModel ?? (status.configured ? '' : DEFAULT_VOICE_MODEL),
    // Pre-checked for a brand-new setup; a saved setup keeps whatever it had.
    useFlex: status.useFlex ?? !status.configured,
    localType,
    localToken: '',
    advanced: lowModel !== '' || status.reasoning !== undefined,
    reasoning: status.reasoning ?? {}
  };
}

/** The connect step's state. Every default that depends on another field
 * (the endpoint on a kind or server-type change, the models on a kind
 * change) is applied in these handlers, never in an effect — so opening a
 * saved setup never overwrites it. */
export function useLlmSetupDraft(status: LlmSetupStatus): LlmSetupDraftApi {
  const [draft, setDraft] = useState<LlmSetupDraft>(() => initialDraft(status));
  // Stable across renders (they only use the functional setState form), so
  // components can list them as effect dependencies.
  const actions = useMemo(() => {
    const update = (patch: Partial<LlmSetupDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    return {
      update,
      setKind: (kind: SetupKind) => setDraft((current) => switchKind(current, kind)),
      setLocalType: (localType: LocalLlmType) =>
        setDraft((current) => ({
          ...current,
          localType,
          // Only replace an endpoint the user hasn't typed themselves.
          endpoint: LOCAL_DEFAULTS.has(current.endpoint) || current.endpoint === '' ? localEndpointFor(localType, current.endpoint) : current.endpoint
        })),
      setLocalModel: (model: string) => update({ lowModel: '', highModel: model })
    };
  }, []);
  return { draft, ...actions, toSetup: () => toSetup(draft) };
}
function switchKind(current: LlmSetupDraft, kind: SetupKind): LlmSetupDraft {
  if (current.kind === kind) return current;
  if (kind === 'local') {
    return {
      ...current,
      kind,
      endpoint:
        current.endpoint === DEFAULT_CLOUD_ENDPOINT || current.endpoint === ''
          ? localEndpointFor(current.localType, DEFAULT_LOCAL_ENDPOINTS['lm-studio'])
          : current.endpoint,
      lowModel: '',
      highModel: ''
    };
  }
  return {
    ...current,
    kind,
    endpoint: LOCAL_DEFAULTS.has(current.endpoint) || current.endpoint === '' ? DEFAULT_CLOUD_ENDPOINT : current.endpoint,
    lowModel: '',
    highModel: current.highModel || DEFAULT_MODEL
  };
}

function toSetup(draft: LlmSetupDraft): LlmSetup {
  const reasoning = hasReasoning(draft) ? draft.reasoning : undefined;
  if (draft.kind === 'local') {
    return {
      protocol: 'local',
      localType: draft.localType,
      endpoint: draft.endpoint,
      localToken: draft.advanced && draft.localToken ? draft.localToken : undefined,
      lowModel: draft.advanced && draft.lowModel ? draft.lowModel : undefined,
      highModel: draft.highModel,
      reasoning
    };
  }
  return {
    endpoint: draft.endpoint,
    apiKey: draft.apiKey,
    lowModel: draft.lowModel || undefined,
    highModel: draft.highModel,
    voiceModel: draft.voiceModel || undefined,
    useFlex: draft.useFlex,
    reasoning
  };
}

function hasReasoning(draft: LlmSetupDraft): boolean {
  return draft.advanced && (draft.reasoning.standard !== undefined || draft.reasoning.light !== undefined);
}
