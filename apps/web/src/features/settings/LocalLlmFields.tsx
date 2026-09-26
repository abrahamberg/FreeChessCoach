import type { LlmModelsResponse, LocalLlmType } from '@freechesscoach/shared';
import { useEffect, type ReactNode } from 'react';
import { ModelField } from './ModelField.js';
import { ThinkingLevelFields } from './ThinkingLevelFields.js';
import type { LlmSetupDraftApi } from './useLlmSetupDraft.js';
import { useLocalModels } from './useLocalModels.js';

/** Below this the coach's prompt and tools alone don't fit (see the API's
 * LOCAL_MIN_CONTEXT_TOKENS, which the connection test also checks). */
const MIN_CONTEXT_TOKENS = 16_384;

const SERVER_HELP: Record<LocalLlmType, string> = {
  'lm-studio': 'In LM Studio, start the server in the Developer tab and turn on "Enable CORS" in its server settings, so this site may call it.',
  ollama: 'Ollama only answers sites listed in OLLAMA_ORIGINS: set it to include this site\'s address and restart Ollama.',
  other: 'Any OpenAI-compatible server works if it allows requests from this site (CORS).'
};

/** LM Studio / Ollama on the user's own machine, reached through this tab —
 * the server never sees the user's localhost directly. */
export function LocalLlmFields({ api }: { api: LlmSetupDraftApi }): ReactNode {
  const { draft, update, setLocalType, setLocalModel } = api;
  const modelsQuery = useLocalModels(draft.endpoint, draft.advanced ? draft.localToken : '', true);
  const listed = modelsQuery.data;
  const models = listed?.models ?? [];

  // Fill an empty model with what the server has loaded (else its first
  // model); never replace a model the user or the saved setup chose.
  useEffect(() => {
    const pick = listed?.loadedModel ?? listed?.models[0];
    if (pick && draft.highModel === '') setLocalModel(pick);
  }, [listed, draft.highModel, setLocalModel]);

  return (
    <>
      <label htmlFor="llm-local-type">Local server</label>
      <select id="llm-local-type" value={draft.localType} onChange={(event) => setLocalType(event.target.value as LocalLlmType)}>
        <option value="lm-studio">LM Studio</option>
        <option value="ollama">Ollama</option>
        <option value="other">Other (OpenAI-compatible)</option>
      </select>
      <label htmlFor="llm-endpoint">Local API URL</label>
      <input id="llm-endpoint" type="url" value={draft.endpoint} onChange={(event) => update({ endpoint: event.target.value })} required />
      <p className="settings-page__hint">{SERVER_HELP[draft.localType]} Your browser may also ask to let this site reach your local network.</p>

      <ModelField id="llm-high-model" label={draft.advanced ? 'High model (the coach)' : 'Model'} value={draft.highModel} models={models}
        onChange={(model) => (draft.advanced ? update({ highModel: model }) : setLocalModel(model))} />
      {draft.advanced && (
        <ModelField id="llm-low-model" label="Low model (optional, summaries)" value={draft.lowModel} models={models} optional onChange={(lowModel) => update({ lowModel })} />
      )}
      <ModelListStatus query={modelsQuery} onRetry={() => void modelsQuery.refetch()} />
      <ContextHint listed={listed} model={draft.highModel} />

      <label className="llm-setup-form__checkbox" htmlFor="llm-advanced">
        <input id="llm-advanced" type="checkbox" checked={draft.advanced} onChange={(event) => update({ advanced: event.target.checked })} />
        Advanced (separate low/high models, token, thinking level)
      </label>
      {draft.advanced && (
        <>
          {draft.lowModel !== '' && draft.lowModel !== draft.highModel && (
            <p className="settings-page__hint">Two different models means your local server swaps between them, which is slow on one GPU. One model for both is usually better.</p>
          )}
          <label htmlFor="llm-local-token">Token (optional)</label>
          <input id="llm-local-token" type="password" value={draft.localToken} onChange={(event) => update({ localToken: event.target.value })}
            placeholder="Only if your local server requires one" />
          <ThinkingLevelFields reasoning={draft.reasoning} onChange={(reasoning) => update({ reasoning })} isLocal />
        </>
      )}
    </>
  );
}

function ModelListStatus({ query, onRetry }: { query: ReturnType<typeof useLocalModels>; onRetry: () => void }): ReactNode {
  if (query.isFetching) return <p className="settings-page__hint">Asking your local server for its models…</p>;
  const error = query.data?.error ?? (query.error ? 'Could not ask your local server for its models.' : null);
  if (!error) return null;
  return (
    <p className="settings-page__hint llm-setup-form__error" role="alert">
      {error}{' '}
      <button type="button" className="btn-ghost" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}

function ContextHint({ listed, model }: { listed: LlmModelsResponse | undefined; model: string }): ReactNode {
  if (!listed?.contextLength || listed.loadedModel !== model || listed.contextLength >= MIN_CONTEXT_TOKENS) return null;
  return (
    <p className="settings-page__hint llm-setup-form__error">
      {model} is loaded with a {listed.contextLength}-token context. The coach needs about {MIN_CONTEXT_TOKENS} (32768 recommended): reload the model with a larger context length.
    </p>
  );
}
