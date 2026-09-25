import { LlmSetupTestResponseSchema, type LlmSetup, type LlmSetupStatus } from '@freechesscoach/shared';
import { useIsFetching, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { apiDelete, apiPost, apiPostVoid, apiPut, describeApiError } from '../../api/client.js';
import { useUnlockLlmSetup } from '../../hooks/useUnlockLlmSetup.js';
import { LlmSetupForm } from './LlmSetupForm.js';
import type { SetupKind } from './useLlmSetupDraft.js';
import { UnlockPhraseModal } from './UnlockPhraseModal.js';

export interface LlmSetupSectionProps {
  status: LlmSetupStatus;
  /** Which kind of AI the form opens on when nothing is saved yet. */
  initialKind?: SetupKind;
}

/** The AI setup wizard plus everything it needs to talk to the API (test,
 * save, lock, delete, unlock). Shared by Settings and the welcome flow so
 * both save the setup exactly the same way. */
export function LlmSetupSection({ status, initialKind }: LlmSetupSectionProps): ReactNode {
  const queryClient = useQueryClient();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const unlock = useUnlockLlmSetup();
  const isRefreshing = useIsFetching({ queryKey: ['llm-setup'] }) > 0;
  const refreshStatus = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['llm-setup'] });

  const testMutation = useMutation({
    mutationFn: (setup: LlmSetup) => apiPost('/api/users/me/llm-setup/test', setup, LlmSetupTestResponseSchema)
  });
  const saveMutation = useMutation({
    mutationFn: ({ setup, unlockPhrase }: { setup: LlmSetup; unlockPhrase: string }) =>
      apiPut('/api/users/me/llm-setup', { ...setup, unlockPhrase }),
    onSuccess: refreshStatus
  });
  const lockMutation = useMutation({
    mutationFn: () => apiPostVoid('/api/users/me/llm-setup/lock'),
    onSuccess: refreshStatus
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiDelete('/api/users/me/llm-setup'),
    onSuccess: refreshStatus
  });

  return (
    <>
      <LlmSetupForm
        key={`${status.configured}-${status.unlocked}-${status.protocol ?? 'none'}`}
        status={status}
        initialKind={initialKind}
        onTest={(setup) => testMutation.mutate(setup)}
        onSave={(setup, unlockPhrase) => saveMutation.mutate({ setup, unlockPhrase })}
        onUnlockClick={() => setShowUnlockModal(true)}
        onLock={() => lockMutation.mutate()}
        onDelete={() => deleteMutation.mutate()}
        onStartEditing={() => {
          testMutation.reset();
          saveMutation.reset();
        }}
        testResult={testMutation.data}
        isTesting={testMutation.isPending}
        testError={describeApiError(testMutation.error)}
        // Keeps the loader up through the post-save refetch (the `key`
        // above only changes once that lands), so the phrase form can't
        // flash back on screen between "saved" and the summary view.
        isSaving={saveMutation.isPending || (saveMutation.isSuccess && isRefreshing)}
        saveError={describeApiError(saveMutation.error)}
      />
      {showUnlockModal && (
        <UnlockPhraseModal
          onClose={() => {
            setShowUnlockModal(false);
            unlock.reset();
          }}
          onUnlock={unlock.unlock}
          onUnlocked={() => {
            setShowUnlockModal(false);
            unlock.reset();
          }}
          isPending={unlock.isPending}
          isSuccess={unlock.isSuccess}
          errorMessage={unlock.errorMessage}
        />
      )}
    </>
  );
}
