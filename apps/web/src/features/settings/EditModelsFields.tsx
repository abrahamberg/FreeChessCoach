import { cloudProviderOf, type LlmModelsChange, type LlmSetupStatus, type TierReasoning } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CloudKeyStatus, CloudModelFields, type CloudModelChoice } from './CloudModelFields.js';
import { ModelField } from './ModelField.js';
import { ThinkingLevelFields } from './ThinkingLevelFields.js';
import { useCloudModels } from './useCloudModels.js';
import { supportsFlex, supportsVoice } from './useLlmSetupDraft.js';
import { useLocalModels } from './useLocalModels.js';

export interface ModelsChangeDraft {
  choice: CloudModelChoice;
  update: (patch: Partial<CloudModelChoice>) => void;
  reasoning: TierReasoning;
  setReasoning: (reasoning: TierReasoning) => void;
  advanced: boolean;
  setAdvanced: (advanced: boolean) => void;
  toChange: () => LlmModelsChange;
}

/** The first step's state, starting from the saved models. */
export function useModelsChangeDraft(status: LlmSetupStatus): ModelsChangeDraft {
  const isLocal = status.protocol === 'local';
  const provider = cloudProviderOf(status.endpoint);
  const [choice, setChoice] = useState<CloudModelChoice>(() => initialChoice(status));
  const [reasoning, setReasoning] = useState<TierReasoning>(status.reasoning ?? {});
  const [advanced, setAdvanced] = useState(status.reasoning !== undefined);
  return {
    choice,
    update: (patch) => setChoice((current) => ({ ...current, ...patch })),
    reasoning,
    setReasoning,
    advanced,
    setAdvanced,
    toChange: () => ({
      highModel: choice.highModel,
      lowModel: choice.lowModel || undefined,
      voiceModel: !isLocal && supportsVoice(provider) && choice.voiceModel ? choice.voiceModel : undefined,
      useFlex: isLocal ? undefined : supportsFlex(provider) && choice.useFlex,
      reasoning: advanced && (reasoning.standard !== undefined || reasoning.light !== undefined) ? reasoning : undefined
    })
  };
}

/** Models, voice, Flex and thinking levels for the saved setup. The lists
 * come from the saved key (cloud) or the local server, never a typed key. */
export function EditModelsFields({ status, draft }: { status: LlmSetupStatus; draft: ModelsChangeDraft }): ReactNode {
  const isLocal = status.protocol === 'local';
  const provider = cloudProviderOf(status.endpoint);
  const cloudModels = useCloudModels(isLocal || provider === 'other' ? null : provider, '', true);
  const localModels = useLocalModels(status.endpoint ?? '', '', isLocal);
  const { choice, update } = draft;
  return (
    <>
      <p className="settings-page__hint">Connected to {isLocal ? 'your local server' : status.endpoint}. Your key stays as saved.</p>
      {isLocal ? (
        <>
          <ModelField id="llm-high-model" label="Model (the coach)" value={choice.highModel} models={localModels.data?.models ?? []} onChange={(highModel) => update({ highModel })} />
          <ModelField id="llm-low-model" label="Low model (optional, summaries)" value={choice.lowModel} models={localModels.data?.models ?? []} optional
            emptyLabel="Same as the coach model" onChange={(lowModel) => update({ lowModel })} />
        </>
      ) : (
        <>
          {provider !== 'other' && <CloudKeyStatus query={cloudModels} />}
          <CloudModelFields provider={provider} listed={cloudModels.data} value={choice} onChange={update} />
        </>
      )}
      <label className="llm-setup-form__checkbox" htmlFor="llm-edit-advanced">
        <input id="llm-edit-advanced" type="checkbox" checked={draft.advanced} onChange={(event) => draft.setAdvanced(event.target.checked)} />
        Advanced
      </label>
      {draft.advanced && <ThinkingLevelFields reasoning={draft.reasoning} onChange={draft.setReasoning} isLocal={isLocal} />}
    </>
  );
}

function initialChoice(status: LlmSetupStatus): CloudModelChoice {
  const highModel = status.highModel ?? '';
  return {
    highModel,
    // Blank means "same as the coach model".
    lowModel: status.lowModel && status.lowModel !== highModel ? status.lowModel : '',
    voiceModel: status.voiceModel ?? '',
    useFlex: status.useFlex ?? false
  };
}
