import {
  LlmSetupStatusSchema,
  LlmSetupTestResponseSchema,
  type LlmModelsChange,
  type LlmSetupStatus,
  type UpdateLlmModelsRequest
} from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost } from '../../api/client.js';

/** The Change models wizard's two requests: test the new models with the
 * saved key (no phrase), then save them (phrase required; tested again). */
export function useChangeModels() {
  const queryClient = useQueryClient();
  const test = useMutation({
    mutationFn: (change: LlmModelsChange) => apiPost('/api/users/me/llm-setup/test-models', change, LlmSetupTestResponseSchema)
  });
  const save = useMutation({
    mutationFn: (request: UpdateLlmModelsRequest) => apiPatch('/api/users/me/llm-setup', request, LlmSetupStatusSchema),
    onSuccess: (status: LlmSetupStatus) => queryClient.setQueryData(['llm-setup'], status)
  });
  return { test, save };
}
