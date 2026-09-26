import {
  CLOUD_PROVIDER_PRESETS,
  DEFAULT_LOCAL_ENDPOINTS,
  cloudProviderOf,
  type CloudProvider,
  type LlmSetup,
  type LlmSetupStatus,
  type LocalLlmType,
  type TierReasoning
} from '@freechesscoach/shared';
import { useMemo, useState } from 'react';

const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_CLOUD_ENDPOINT = CLOUD_PROVIDER_PRESETS[DEFAULT_PROVIDER].endpoint;

export type SetupKind = 'cloud' | 'local';

export interface LlmSetupDraft {
  kind: SetupKind;
  /** Which cloud provider; `other` is typed in by hand. */
  provider: CloudProvider;
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
  /** Fills the provider's URL and default models. */
  setProvider(provider: CloudProvider): void;
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
  if (!status.configured || status.highModel === undefined) return newCloudDraft();
  const kind: SetupKind = status.protocol === 'local' ? 'local' : 'cloud';
  const localType = status.localType ?? 'lm-studio';
  const fallbackEndpoint = kind === 'local' ? localEndpointFor(localType, DEFAULT_LOCAL_ENDPOINTS['lm-studio']) : DEFAULT_CLOUD_ENDPOINT;
  const highModel = status.highModel;
  // Blank means "same as the high model".
  const lowModel = status.lowModel && status.lowModel !== highModel ? status.lowModel : '';
  const endpoint = status.endpoint ?? fallbackEndpoint;
  return {
    kind,
    provider: cloudProviderOf(endpoint),
    endpoint,
    apiKey: '',
    lowModel,
    highModel,
    voiceModel: status.voiceModel ?? '',
    useFlex: status.useFlex ?? false,
    localType,
    localToken: '',
    advanced: (kind === 'local' && lowModel !== '') || status.reasoning !== undefined,
    reasoning: status.reasoning ?? {}
  };
}

function newCloudDraft(): LlmSetupDraft {
  return withProvider(
    {
      kind: 'cloud',
      provider: DEFAULT_PROVIDER,
      endpoint: '',
      apiKey: '',
      lowModel: '',
      highModel: '',
      voiceModel: '',
      useFlex: false,
      localType: 'lm-studio',
      localToken: '',
      advanced: false,
      reasoning: {}
    },
    DEFAULT_PROVIDER
  );
}

/** A named provider brings its URL, models, voice and (OpenAI only) Flex,
 * pre-checked. `other` keeps what was typed, minus a named provider's URL. */
export function withProvider(current: LlmSetupDraft, provider: CloudProvider): LlmSetupDraft {
  if (provider === 'other') {
    const wasPreset = cloudProviderOf(current.endpoint) !== 'other';
    return { ...current, provider, endpoint: wasPreset ? '' : current.endpoint, useFlex: false };
  }
  const preset = CLOUD_PROVIDER_PRESETS[provider];
  return {
    ...current,
    provider,
    endpoint: preset.endpoint,
    highModel: preset.highModel,
    lowModel: preset.lowModel,
    voiceModel: preset.voiceModel ?? '',
    useFlex: preset.supportsFlex
  };
}

/** Flex is an OpenAI service tier; no other provider has it. */
export function supportsFlex(provider: CloudProvider): boolean {
  return provider !== 'other' && CLOUD_PROVIDER_PRESETS[provider].supportsFlex;
}

/** Cloud voice needs OpenAI's speech API: offered for OpenAI and for a
 * hand-typed endpoint (which may be OpenAI-compatible), not the others. */
export function supportsVoice(provider: CloudProvider): boolean {
  return provider === 'other' || CLOUD_PROVIDER_PRESETS[provider].voiceModel !== null;
}

/** The connect step's state. Every default that depends on another field
 * (the endpoint on a kind or server-type change, the models on a kind
 * change) is applied in these handlers, never in an effect — so opening a
 * saved setup never overwrites it. */
export function useLlmSetupDraft(status: LlmSetupStatus, initialKind?: SetupKind): LlmSetupDraftApi {
  const [draft, setDraft] = useState<LlmSetupDraft>(() => {
    const saved = initialDraft(status);
    return status.configured || !initialKind ? saved : switchKind(saved, initialKind);
  });
  // Stable across renders (they only use the functional setState form), so
  // components can list them as effect dependencies.
  const actions = useMemo(() => {
    const update = (patch: Partial<LlmSetupDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    return {
      update,
      setKind: (kind: SetupKind) => setDraft((current) => switchKind(current, kind)),
      setProvider: (provider: CloudProvider) => setDraft((current) => withProvider(current, provider)),
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
  if (LOCAL_DEFAULTS.has(current.endpoint) || current.endpoint === '') return withProvider({ ...current, kind }, current.provider === 'other' ? DEFAULT_PROVIDER : current.provider);
  return { ...current, kind, provider: cloudProviderOf(current.endpoint) };
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
    voiceModel: supportsVoice(draft.provider) && draft.voiceModel ? draft.voiceModel : undefined,
    useFlex: supportsFlex(draft.provider) && draft.useFlex,
    reasoning
  };
}

function hasReasoning(draft: LlmSetupDraft): boolean {
  return draft.advanced && (draft.reasoning.standard !== undefined || draft.reasoning.light !== undefined);
}
