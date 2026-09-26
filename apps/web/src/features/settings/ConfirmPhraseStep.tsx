import { useState, type FormEvent, type ReactNode } from 'react';
import { PhraseStrengthMeter } from './PhraseStrengthMeter.js';
import { ErrorBox } from './SetupWizardParts.js';
import { useUnlockPhraseStrength } from './useUnlockPhraseStrength.js';

export interface ConfirmPhraseStepProps {
  onBack: () => void;
  onSave: (unlockPhrase: string, newUnlockPhrase: string | undefined) => void;
  saveError?: string;
}

/** Change models' last step: the current phrase (it opens and re-encrypts the
 * saved setup) and, optionally, a new one — judged like any new phrase. */
export function ConfirmPhraseStep({ onBack, onSave, saveError }: ConfirmPhraseStepProps): ReactNode {
  const [unlockPhrase, setUnlockPhrase] = useState('');
  const [changePhrase, setChangePhrase] = useState(false);
  const [newUnlockPhrase, setNewUnlockPhrase] = useState('');
  const newPhraseStrength = useUnlockPhraseStrength(newUnlockPhrase);
  const blocked = unlockPhrase === '' || (changePhrase && !newPhraseStrength.verdict?.ok);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (blocked) return;
    onSave(unlockPhrase, changePhrase ? newUnlockPhrase : undefined);
  }

  return (
    <form onSubmit={submit}>
      <p className="settings-page__hint">Last step — enter your unlock phrase. It opens your saved setup and encrypts it again with the new models.</p>
      <label htmlFor="llm-edit-phrase">Current unlock phrase</label>
      <input id="llm-edit-phrase" type="password" value={unlockPhrase} onChange={(event) => setUnlockPhrase(event.target.value)} required autoFocus />
      <label className="llm-setup-form__checkbox" htmlFor="llm-edit-change-phrase">
        <input id="llm-edit-change-phrase" type="checkbox" checked={changePhrase} onChange={(event) => setChangePhrase(event.target.checked)} />
        Also change my unlock phrase
      </label>
      {changePhrase && (
        <>
          <label htmlFor="llm-edit-new-phrase">New unlock phrase (8+ characters)</label>
          <input id="llm-edit-new-phrase" type="password" value={newUnlockPhrase} onChange={(event) => setNewUnlockPhrase(event.target.value)} minLength={8} required />
          <PhraseStrengthMeter strength={newPhraseStrength} />
        </>
      )}
      <div className="llm-setup-form__actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <button type="submit" className="btn-primary" disabled={blocked}>Save</button>
      </div>
      <ErrorBox title="Not saved" message={saveError} />
    </form>
  );
}
