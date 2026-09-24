import { z } from 'zod';

/** The wire formats a setup can use. The three remote ones are detected per
 * model during setup; `local` is an OpenAI-compatible server on the user's
 * own machine (LM Studio / Ollama), reached through their browser tab. */
export const LlmProtocolSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic', 'local']);
export type LlmProtocol = z.infer<typeof LlmProtocolSchema>;

/** Remote formats in the order setup tries them for each model. */
export const REMOTE_PROTOCOL_ORDER = ['openai-responses', 'anthropic', 'openai-chat'] as const;
export type RemoteLlmProtocol = (typeof REMOTE_PROTOCOL_ORDER)[number];

/** The type of local LLM server when protocol is 'local'. */
export const LocalLlmTypeSchema = z.enum(['lm-studio', 'ollama', 'other']);
export type LocalLlmType = z.infer<typeof LocalLlmTypeSchema>;

/** Default OpenAI-compatible base URL per local server type. */
export const DEFAULT_LOCAL_ENDPOINTS: Record<Exclude<LocalLlmType, 'other'>, string> = {
  'lm-studio': 'http://localhost:1234/v1',
  ollama: 'http://localhost:11434/v1'
};

/** Kept for the model-options layer, which only needs to distinguish the
 * native OpenAI and Anthropic reasoning knobs. */
export const LlmProviderSchema = z.enum(['anthropic', 'openai']);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const ReasoningEffortSchema = z.enum([
  'provider-default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const OpenAiServiceTierSchema = z.enum(['auto', 'default', 'flex', 'priority']);
export type OpenAiServiceTier = z.infer<typeof OpenAiServiceTierSchema>;

const ModelIdSchema = z.string().trim().min(1, 'Model name cannot be empty').max(200, 'Model name is too long');

/** The user's thinking level per tier (Settings → Advanced). Absent means
 * the deployment default (model-options.ts), or Off for a local model. */
export const TierReasoningSchema = z.object({
  standard: ReasoningEffortSchema.optional(),
  light: ReasoningEffortSchema.optional()
});
export type TierReasoning = z.infer<typeof TierReasoningSchema>;

const LlmSetupFieldsSchema = z.object({
  /** `local` for a local server; anything else (or absent) is a remote
   * endpoint whose format is detected per model during setup. */
  protocol: LlmProtocolSchema.optional(),
  /** Which local server (LM Studio / Ollama / other). Required for `local`. */
  localType: LocalLlmTypeSchema.optional(),
  endpoint: z
    .string()
    .trim()
    .url('Endpoint must be a complete URL')
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Endpoint must use HTTP or HTTPS')
    .refine((value) => {
      const url = new URL(value);
      return url.username === '' && url.password === '' && url.hash === '';
    }, 'Endpoint must not contain credentials or a fragment'),
  /** Required for remote endpoints; unused for local ones. */
  apiKey: z.string().trim().min(1, 'API key cannot be empty').max(4096, 'API key is too long').optional(),
  /** Optional bearer token for a local server with auth turned on. */
  localToken: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(4096, 'Token is too long').optional()
  ),
  /** Optional: the cheap model for summaries. Absent means the high model
   * serves both tiers (see `lowModelOf`). */
  lowModel: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    ModelIdSchema.optional()
  ),
  highModel: ModelIdSchema,
  voiceModel: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    ModelIdSchema.optional()
  ),
  /** OpenAI's `flex` service tier: about half the token price in exchange for
   * slower responses. Optional so setups saved before it existed (encrypted
   * JSON, no migration) keep their standard-tier behaviour. */
  useFlex: z.boolean().optional(),
  /** A pre-release build stored a single string here; it is dropped (the
   * deployment default applies) rather than failing to unlock. */
  reasoning: z.preprocess((value) => (typeof value === 'string' ? undefined : value), TierReasoningSchema.optional())
});

function hasRequiredCredentials(data: z.infer<typeof LlmSetupFieldsSchema>): boolean {
  if (data.protocol === 'local') return data.localType !== undefined;
  return data.apiKey !== undefined;
}

const CREDENTIALS_MESSAGE = {
  message: 'An API key is required for a cloud endpoint; a local server type is required for a local one',
  path: ['apiKey']
};

/** The only plaintext setup shape. It is encrypted before it reaches the
 * database or the temporary unlock cache. */
export const LlmSetupSchema = LlmSetupFieldsSchema.refine(hasRequiredCredentials, CREDENTIALS_MESSAGE);
export type LlmSetup = z.infer<typeof LlmSetupSchema>;

/** The model for the light tier: the low model if one was chosen, else the
 * high model. */
export function lowModelOf(setup: { lowModel?: string | undefined; highModel: string }): string {
  return setup.lowModel ?? setup.highModel;
}

/** What is stored after a passing test: `protocol` is the high model's
 * format (setups saved before per-model detection have only this one, used
 * for both), `lowProtocol`/`highProtocol` each model's own. */
export const StoredLlmSetupSchema = LlmSetupFieldsSchema.extend({
  protocol: LlmProtocolSchema,
  lowProtocol: LlmProtocolSchema.optional(),
  highProtocol: LlmProtocolSchema.optional()
}).refine(hasRequiredCredentials, CREDENTIALS_MESSAGE);
export type StoredLlmSetup = z.infer<typeof StoredLlmSetupSchema>;

export const SaveLlmSetupRequestSchema = LlmSetupFieldsSchema.extend({
  unlockPhrase: z.string().trim().min(8, 'Unlock phrase must be at least 8 characters').max(256, 'Unlock phrase is too long')
}).refine(hasRequiredCredentials, CREDENTIALS_MESSAGE);
export type SaveLlmSetupRequest = z.infer<typeof SaveLlmSetupRequestSchema>;

export const UnlockLlmSetupRequestSchema = z.object({
  unlockPhrase: z.string().trim().min(1, 'Unlock phrase cannot be empty').max(256, 'Unlock phrase is too long')
});

export const LlmModelTestResultSchema = z.object({
  model: z.string(),
  ok: z.boolean(),
  /** The format this model answered in (set when `ok`). */
  protocol: LlmProtocolSchema.optional(),
  error: z.string().optional(),
  /** Passed, but with a caveat worth showing (e.g. a small context window). */
  warning: z.string().optional()
});
export type LlmModelTestResult = z.infer<typeof LlmModelTestResultSchema>;

export const LlmSetupTestResponseSchema = z.object({
  /** The high model's format when both text models passed; null otherwise. */
  protocol: LlmProtocolSchema.nullable(),
  low: LlmModelTestResultSchema,
  high: LlmModelTestResultSchema,
  voice: LlmModelTestResultSchema.nullable()
});
export type LlmSetupTestResponse = z.infer<typeof LlmSetupTestResponseSchema>;

export const LlmSetupStatusSchema = z.object({
  configured: z.boolean(),
  unlocked: z.boolean(),
  endpoint: z.string().optional(),
  protocol: LlmProtocolSchema.optional(),
  lowProtocol: LlmProtocolSchema.optional(),
  highProtocol: LlmProtocolSchema.optional(),
  localType: LocalLlmTypeSchema.optional(),
  lowModel: z.string().optional(),
  highModel: z.string().optional(),
  voiceModel: z.string().optional(),
  useFlex: z.boolean().optional(),
  reasoning: TierReasoningSchema.optional(),
  voiceAvailable: z.boolean()
});
export type LlmSetupStatus = z.infer<typeof LlmSetupStatusSchema>;

/** Body of POST /api/users/me/llm-setup/models: asks the user's tab to list a
 * local server's models. The token travels in the body, never the URL. */
export const LocalModelsRequestSchema = z.object({
  endpoint: z.string().trim().url('Endpoint must be a complete URL'),
  token: z.string().trim().max(4096).optional()
});
export type LocalModelsRequest = z.infer<typeof LocalModelsRequestSchema>;

export const LlmModelsResponseSchema = z.object({
  models: z.array(z.string()),
  /** The model the local server reports as loaded, when it can tell. */
  loadedModel: z.string().nullable(),
  /** That model's loaded context window in tokens, when known. */
  contextLength: z.number().int().positive().nullable(),
  error: z.string().optional()
});
export type LlmModelsResponse = z.infer<typeof LlmModelsResponseSchema>;
