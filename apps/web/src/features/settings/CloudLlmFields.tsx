import type { ReactNode } from 'react';
import type { LlmSetupDraftApi } from './useLlmSetupDraft.js';
import { ThinkingLevelFields } from './ThinkingLevelFields.js';

/** Any cloud endpoint (OpenAI, Anthropic, OpenRouter, …). The test detects
 * each model's API format on its own, so there is nothing to choose. */
export function CloudLlmFields({ api }: { api: LlmSetupDraftApi }): ReactNode {
  const { draft, update } = api;
  return (
    <>
      <label htmlFor="llm-endpoint">API URL</label>
      <input id="llm-endpoint" type="url" value={draft.endpoint} onChange={(event) => update({ endpoint: event.target.value })} required />
      <label htmlFor="llm-api-key">API key</label>
      <input id="llm-api-key" type="password" value={draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} required />

      <label htmlFor="llm-low-model">Low model</label>
      <input id="llm-low-model" value={draft.lowModel} onChange={(event) => update({ lowModel: event.target.value })} required />
      <label htmlFor="llm-high-model">High model</label>
      <input id="llm-high-model" value={draft.highModel} onChange={(event) => update({ highModel: event.target.value })} required />
      <p className="settings-page__hint">
        The test tries each model with the OpenAI Responses, Anthropic Messages and Chat Completions formats, in that order, and keeps the first that works — the two models may end up using different ones.
      </p>

      <label htmlFor="llm-voice-model">Voice model (optional)</label>
      <input id="llm-voice-model" value={draft.voiceModel} onChange={(event) => update({ voiceModel: event.target.value })} />
      <label className="llm-setup-form__checkbox" htmlFor="llm-use-flex">
        <input id="llm-use-flex" type="checkbox" checked={draft.useFlex} onChange={(event) => update({ useFlex: event.target.checked })} />
        Use OpenAI Flex processing
      </label>
      <p className="settings-page__hint">About half the token price, but responses are slower and can occasionally be unavailable. OpenAI models only — ignored for other formats.</p>

      <label className="llm-setup-form__checkbox" htmlFor="llm-advanced">
        <input id="llm-advanced" type="checkbox" checked={draft.advanced} onChange={(event) => update({ advanced: event.target.checked })} />
        Advanced
      </label>
      {draft.advanced && <ThinkingLevelFields reasoning={draft.reasoning} onChange={(reasoning) => update({ reasoning })} isLocal={false} />}
    </>
  );
}
