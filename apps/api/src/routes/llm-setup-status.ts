import { checkUnlockPhrase, lowModelOf, type LlmSetupStatus, type LlmSetupTestResponse, type StoredLlmSetup } from '@freechesscoach/shared';
import { ValidationError } from '../lib/errors.js';

export function assertTestsPassed(tests: LlmSetupTestResponse): asserts tests is LlmSetupTestResponse & { protocol: StoredLlmSetup['protocol']; low: { ok: true }; high: { ok: true } } {
  const failures = [
    tests.low.ok ? null : `low model: ${tests.low.error ?? 'test failed'}`,
    tests.high.ok ? null : `high model: ${tests.high.error ?? 'test failed'}`,
    tests.voice && !tests.voice.ok ? `voice model: ${tests.voice.error ?? 'test failed'}` : null
  ].filter((failure): failure is string => failure !== null);
  if (tests.protocol === null || failures.length > 0) {
    throw new ValidationError(failures.join('; ') || 'The endpoint did not match an OpenAI or Anthropic API format.');
  }
}

export function statusFor(configured: boolean, setup: StoredLlmSetup | null): LlmSetupStatus {
  return {
    configured,
    unlocked: setup !== null,
    ...(setup
      ? {
          endpoint: setup.endpoint,
          protocol: setup.protocol,
          ...(setup.lowProtocol ? { lowProtocol: setup.lowProtocol } : {}),
          ...(setup.highProtocol ? { highProtocol: setup.highProtocol } : {}),
          ...(setup.localType ? { localType: setup.localType } : {}),
          lowModel: lowModelOf(setup),
          highModel: setup.highModel,
          ...(setup.voiceModel ? { voiceModel: setup.voiceModel } : {}),
          ...(setup.useFlex !== undefined ? { useFlex: setup.useFlex } : {}),
          ...(setup.reasoning ? { reasoning: setup.reasoning } : {})
        }
      : {}),
    voiceAvailable: setup?.voiceModel !== undefined
  };
}

export function formatIssues(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join('; ');
}

/** The setup as saved after a passing test: each model's detected format. */
export function withDetectedProtocols(
  setup: Omit<StoredLlmSetup, 'protocol' | 'lowProtocol' | 'highProtocol'> & { protocol?: StoredLlmSetup['protocol'] },
  tests: LlmSetupTestResponse & { protocol: StoredLlmSetup['protocol'] }
): StoredLlmSetup {
  return { ...setup, protocol: tests.protocol, lowProtocol: tests.low.protocol, highProtocol: tests.high.protocol };
}

/** Refuses a new unlock phrase that an attacker would guess early — leaked
 * passwords, l33t variants, keyboard runs, or the user's own name/email. */
export async function assertStrongUnlockPhrase(phrase: string, user: { email: string; displayName: string }): Promise<void> {
  const verdict = await checkUnlockPhrase(phrase, identityWords(user));
  if (!verdict.ok) throw new ValidationError(verdict.problem ?? 'This unlock phrase is too easy to guess.');
}

function identityWords({ email, displayName }: { email: string; displayName: string }): string[] {
  const local = email.split('@')[0] ?? '';
  return [email, local, ...local.split(/[._+-]+/), displayName, ...displayName.split(/\s+/)].filter((word) => word.length >= 3);
}
