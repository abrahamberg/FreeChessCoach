import type { CloudModelsResponse, CloudProvider } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { ModelField } from './ModelField.js';
import type { useCloudModels } from './useCloudModels.js';
import { supportsFlex, supportsVoice } from './useLlmSetupDraft.js';

export interface CloudModelChoice {
  highModel: string;
  lowModel: string;
  voiceModel: string;
  useFlex: boolean;
}

export interface CloudModelFieldsProps {
  provider: CloudProvider;
  listed: CloudModelsResponse | undefined;
  value: CloudModelChoice;
  onChange: (patch: Partial<CloudModelChoice>) => void;
}

/** Models, voice and Flex for a cloud setup — the same fields when first
 * connecting and when changing a saved setup's models. */
export function CloudModelFields({ provider, listed, value, onChange }: CloudModelFieldsProps): ReactNode {
  const models = listed?.error ? [] : (listed?.models ?? []);
  return (
    <>
      <ModelField id="llm-high-model" label="Model (the coach)" value={value.highModel} models={models} onChange={(highModel) => onChange({ highModel })} />
      <ModelField id="llm-low-model" label="Low model (optional, summaries)" value={value.lowModel} models={models} optional
        emptyLabel="Same as the coach model" onChange={(lowModel) => onChange({ lowModel })} />
      {supportsVoice(provider) && (
        <ModelField id="llm-voice-model" label="Voice model (optional)" value={value.voiceModel} models={listed?.voiceModels ?? []} optional
          emptyLabel="No cloud voice" onChange={(voiceModel) => onChange({ voiceModel })} />
      )}
      {supportsFlex(provider) && (
        <>
          <label className="llm-setup-form__checkbox" htmlFor="llm-use-flex">
            <input id="llm-use-flex" type="checkbox" checked={value.useFlex} onChange={(event) => onChange({ useFlex: event.target.checked })} />
            Use OpenAI Flex processing
          </label>
          <p className="settings-page__hint">About half the token price, but responses are slower and can occasionally be unavailable.</p>
        </>
      )}
    </>
  );
}

/** Whether the provider accepted the key, from the model listing. */
export function CloudKeyStatus({ query }: { query: ReturnType<typeof useCloudModels> }): ReactNode {
  if (query.isFetching) return <p className="settings-page__hint" role="status">Checking your key…</p>;
  const error = query.data?.error ?? (query.error ? 'Could not check your key.' : null);
  if (error) {
    return (
      <p className="settings-page__hint llm-setup-form__error" role="alert">
        {error}{' '}
        <button type="button" className="btn-ghost" onClick={() => void query.refetch()}>Try again</button>
      </p>
    );
  }
  if (!query.data) return null;
  return <p className="settings-page__hint" role="status">Key accepted — {query.data.models.length} models available.</p>;
}
