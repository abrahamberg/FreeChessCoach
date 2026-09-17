import { LlmSetupStatusSchema, type LlmSetupStatus } from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, describeApiError } from '../api/client.js';

export interface UseUnlockLlmSetupResult {
  unlock: (unlockPhrase: string) => void;
  reset: () => void;
  isPending: boolean;
  isSuccess: boolean;
  errorMessage: string | undefined;
}

/** Wraps POST /api/users/me/llm-setup/unlock — shared by Settings' own
 * unlock popup and the coaching session's (useSessionPageData), so both get
 * identical correct/wrong/checking feedback from one place rather than two
 * independent mutations drifting apart. */
export function useUnlockLlmSetup(): UseUnlockLlmSetupResult {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (unlockPhrase: string) => apiPost('/api/users/me/llm-setup/unlock', { unlockPhrase }, LlmSetupStatusSchema),
    onSuccess: (status: LlmSetupStatus) => queryClient.setQueryData(['llm-setup'], status)
  });
  return {
    unlock: (unlockPhrase) => mutation.mutate(unlockPhrase),
    reset: () => mutation.reset(),
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage: describeApiError(mutation.error)
  };
}
