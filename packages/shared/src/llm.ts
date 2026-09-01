import { z } from 'zod';

/** The two wire formats supported by the user-supplied endpoint. */
export const LlmProtocolSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic']);
export type LlmProtocol = z.infer<typeof LlmProtocolSchema>;

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

/** The only plaintext setup shape. It is encrypted before it reaches the
 * database or the temporary unlock cache. */
export const LlmSetupSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url('Endpoint must be a complete URL')
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Endpoint must use HTTP or HTTPS')
    .refine((value) => {
      const url = new URL(value);
      return url.username === '' && url.password === '' && url.hash === '';
    }, 'Endpoint must not contain credentials or a fragment'),
  apiKey: z.string().trim().min(1, 'API key cannot be empty').max(4096, 'API key is too long'),
  lowModel: ModelIdSchema,
  highModel: ModelIdSchema,
  voiceModel: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    ModelIdSchema.optional()
  )
});
export type LlmSetup = z.infer<typeof LlmSetupSchema>;

export const StoredLlmSetupSchema = LlmSetupSchema.extend({ protocol: LlmProtocolSchema });
export type StoredLlmSetup = z.infer<typeof StoredLlmSetupSchema>;

export const SaveLlmSetupRequestSchema = LlmSetupSchema.extend({
  unlockPhrase: z.string().trim().min(8, 'Unlock phrase must be at least 8 characters').max(256, 'Unlock phrase is too long')
});
export type SaveLlmSetupRequest = z.infer<typeof SaveLlmSetupRequestSchema>;

export const UnlockLlmSetupRequestSchema = z.object({
  unlockPhrase: z.string().trim().min(1, 'Unlock phrase cannot be empty').max(256, 'Unlock phrase is too long')
});

export const LlmModelTestResultSchema = z.object({
  model: z.string(),
  ok: z.boolean(),
  error: z.string().optional()
});
export type LlmModelTestResult = z.infer<typeof LlmModelTestResultSchema>;

export const LlmSetupTestResponseSchema = z.object({
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
  lowModel: z.string().optional(),
  highModel: z.string().optional(),
  voiceModel: z.string().optional(),
  voiceAvailable: z.boolean()
});
export type LlmSetupStatus = z.infer<typeof LlmSetupStatusSchema>;
