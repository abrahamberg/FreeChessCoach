import { APICallError } from 'ai';

/** Buckets for the provider failures a BYOK coaching turn can hit mid-stream.
 * Distinct from HttpError (lib/errors.ts): those are OUR validation failures
 * returned before the stream starts; this classifies failures from the
 * student's own provider account once streaming is underway. */
export type LlmErrorKind = 'spend_limit' | 'auth' | 'rate_limit' | 'context_length' | 'overloaded' | 'timeout' | 'unknown';

export interface ClassifiedLlmError {
  kind: LlmErrorKind;
  /** Shown verbatim in the assistant bubble in place of a reply — must tell
   * a BYOK student what to actually go do, not just "something went wrong",
   * since the fix (billing page, Settings, wait it out) differs per kind. */
  userMessage: string;
  /** One line for server logs — the kind plus enough of the provider's own
   * status/message to triage without printing the whole error object. */
  logSummary: string;
}

const GENERIC_MESSAGE = 'Something went wrong generating a reply. Try sending your message again.';

/** Classifies a mid-stream provider error (`streamText`'s `onError`) into a
 * kind with an actionable, student-facing message. Provider error shapes
 * aren't standardized across OpenAI/Anthropic/local endpoints, so this reads
 * both the structured `APICallError` fields (status code, response body) and
 * falls back to matching the message text — never throws on an unrecognized
 * shape, since a classification failure must not crash the error path itself. */
export function classifyLlmError(error: unknown): ClassifiedLlmError {
  const statusCode = APICallError.isInstance(error) ? error.statusCode : undefined;
  const text = describeError(error);

  if (isSpendLimitError(text)) {
    return {
      kind: 'spend_limit',
      userMessage:
        "Your AI provider account has hit its spend or quota limit. Check your provider's billing settings (e.g. OpenAI's usage limits page), then try again.",
      logSummary: `spend_limit (status ${statusCode ?? 'n/a'})`
    };
  }
  if (isAuthError(statusCode, text)) {
    return {
      kind: 'auth',
      userMessage: 'Your API key was rejected. Check the key saved in Settings.',
      logSummary: `auth (status ${statusCode ?? 'n/a'})`
    };
  }
  if (isRateLimitError(statusCode, text)) {
    return {
      kind: 'rate_limit',
      userMessage: "Your AI provider is rate-limiting requests right now. Wait a moment, then try sending your message again.",
      logSummary: `rate_limit (status ${statusCode ?? 'n/a'})`
    };
  }
  if (isContextLengthError(text)) {
    return {
      kind: 'context_length',
      userMessage: 'This conversation has grown too long for the model to respond to. Starting a fresh session should fix it.',
      logSummary: `context_length (status ${statusCode ?? 'n/a'})`
    };
  }
  if (isOverloadedError(statusCode, text)) {
    return {
      kind: 'overloaded',
      userMessage: "Your AI provider's servers are overloaded right now. Try again in a moment.",
      logSummary: `overloaded (status ${statusCode ?? 'n/a'})`
    };
  }
  if (isTimeoutError(text)) {
    return {
      kind: 'timeout',
      userMessage: "The AI provider didn't respond in time. Try sending your message again.",
      logSummary: 'timeout'
    };
  }
  return { kind: 'unknown', userMessage: GENERIC_MESSAGE, logSummary: text.slice(0, 200) };
}

/** The error's own message plus, for an `APICallError`, its raw response
 * body — providers put the actionable detail (spend limit, quota code) in
 * the body, not always in the SDK's own summarized `message`. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  if (APICallError.isInstance(error) && error.responseBody) parts.push(error.responseBody);
  return parts.join(' ');
}

function isSpendLimitError(text: string): boolean {
  return /spend limit|billing hard limit|exceeded your current quota|insufficient_quota|billing_not_active/i.test(text);
}

function isAuthError(statusCode: number | undefined, text: string): boolean {
  if (statusCode === 401 || statusCode === 403) return true;
  return /invalid api key|incorrect api key|authentication_error|no auth credentials/i.test(text);
}

// Checked after spend-limit/auth: OpenAI and Anthropic both use 429 for
// plain rate limiting AND for quota/billing failures, so the more specific
// checks above must win first.
function isRateLimitError(statusCode: number | undefined, text: string): boolean {
  if (statusCode === 429) return true;
  return /rate limit|rate_limit_error|rate_limit_exceeded/i.test(text);
}

function isContextLengthError(text: string): boolean {
  return /context_length_exceeded|maximum context length|context window/i.test(text);
}

function isOverloadedError(statusCode: number | undefined, text: string): boolean {
  if (statusCode !== undefined && statusCode >= 500) return true;
  return /overloaded_error|server is overloaded/i.test(text);
}

function isTimeoutError(text: string): boolean {
  return /timed out|timeout error|etimedout/i.test(text);
}
