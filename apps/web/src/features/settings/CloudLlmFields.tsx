import { CLOUD_PROVIDER_PRESETS, CloudProviderSchema, type CloudProvider } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CloudKeyStatus, CloudModelFields } from './CloudModelFields.js';
import { ThinkingLevelFields } from './ThinkingLevelFields.js';
import { useCloudModels } from './useCloudModels.js';
import type { LlmSetupDraftApi } from './useLlmSetupDraft.js';

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  openai: CLOUD_PROVIDER_PRESETS.openai.label,
  anthropic: CLOUD_PROVIDER_PRESETS.anthropic.label,
  openrouter: CLOUD_PROVIDER_PRESETS.openrouter.label,
  other: 'Other (Azure, Bedrock, any compatible API)'
};

/** A named provider fills its URL, checks the key as it is typed and offers
 * its models in dropdowns; `other` is typed in by hand. Either way the test
 * detects each model's API format on its own. */
export function CloudLlmFields({ api }: { api: LlmSetupDraftApi }): ReactNode {
  const { draft, update, setProvider } = api;
  const isNamed = draft.provider !== 'other';
  const modelsQuery = useCloudModels(draft.provider === 'other' ? null : draft.provider, draft.apiKey);
  return (
    <>
      <label htmlFor="llm-provider">Provider</label>
      <select id="llm-provider" value={draft.provider} onChange={(event) => setProvider(CloudProviderSchema.parse(event.target.value))}>
        {CloudProviderSchema.options.map((provider) => (
          <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>
        ))}
      </select>
      {!isNamed && (
        <>
          <label htmlFor="llm-endpoint">API URL</label>
          <input id="llm-endpoint" type="url" value={draft.endpoint} onChange={(event) => update({ endpoint: event.target.value })} required />
        </>
      )}
      <label htmlFor="llm-api-key">API key</label>
      <input id="llm-api-key" type="password" value={draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} required />
      {isNamed && <CloudKeyStatus query={modelsQuery} />}

      <CloudModelFields provider={draft.provider} listed={isNamed ? modelsQuery.data : undefined} value={draft} onChange={update} />
      <p className="settings-page__hint">
        Only set a low model if you want a cheaper one for summaries. The test tries each model with the OpenAI Responses, Anthropic Messages and Chat Completions formats, in that order, and keeps the first that works.
      </p>

      <label className="llm-setup-form__checkbox" htmlFor="llm-advanced">
        <input id="llm-advanced" type="checkbox" checked={draft.advanced} onChange={(event) => update({ advanced: event.target.checked })} />
        Advanced
      </label>
      {draft.advanced && <ThinkingLevelFields reasoning={draft.reasoning} onChange={(reasoning) => update({ reasoning })} isLocal={false} />}
    </>
  );
}
