import { COACH_PERSONAS, COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { CheckIcon } from '../../components/Icon.js';
import { Modal } from '../../components/Modal.js';
import './CoachPersonaSelect.css';

export interface CoachPersonaSelectProps {
  value: CoachPersona;
  onChange: (persona: CoachPersona) => void;
}

/** coaches.md: 8 cosmetic coach personas — the same coach, different voice.
 * The two default portraits share every prompt byte and differ only in their
 * internal voice selection. Picking an `explicit` persona
 * (profanity/insults are part of the character) is gated behind a
 * confirmation dialog rather than applied immediately — cancelling leaves
 * `value` untouched, which is the "undo". */
export function CoachPersonaSelect({ value, onChange }: CoachPersonaSelectProps): ReactNode {
  const [pendingExplicitPersona, setPendingExplicitPersona] = useState<CoachPersona | null>(null);

  function handleSelect(persona: CoachPersona): void {
    if (persona !== value && COACH_PERSONA_INFO[persona].explicit) {
      setPendingExplicitPersona(persona);
      return;
    }
    onChange(persona);
  }

  function confirmPendingPersona(): void {
    if (pendingExplicitPersona) onChange(pendingExplicitPersona);
    setPendingExplicitPersona(null);
  }

  function getOptionAccessibleName(persona: CoachPersona): string {
    if (persona === 'general') return 'Coach, classic portrait';
    if (persona === 'general_female') return 'Coach, alternate portrait';
    return COACH_PERSONA_INFO[persona].label;
  }

  return (
    <div className="coach-persona-select" role="radiogroup" aria-label="Coach persona">
      {COACH_PERSONAS.map((persona) => {
        const info = COACH_PERSONA_INFO[persona];
        const isSelected = value === persona;
        return (
          <label
            key={persona}
            className={isSelected ? 'coach-persona-select__option selected' : 'coach-persona-select__option'}
          >
            <input
              type="radio"
              name="coach-persona"
              aria-label={getOptionAccessibleName(persona)}
              checked={isSelected}
              onChange={() => handleSelect(persona)}
            />
            {isSelected && (
              <span className="coach-persona-select__check" aria-hidden="true">
                <CheckIcon width={11} height={11} stroke="#fff" strokeWidth={3} />
              </span>
            )}
            {info.explicit && (
              <span className="coach-persona-select__explicit" aria-label="Explicit" title="Explicit language">
                E
              </span>
            )}
            <CoachAvatar persona={persona} size="settings" />
            <span className="coach-persona-select__text">
              <span className="coach-persona-select__label">{info.label}</span>
              <small className="coach-persona-select__tagline">{info.tagline}</small>
            </span>
          </label>
        );
      })}
      {pendingExplicitPersona && (
        <Modal
          title={`Heads up about ${COACH_PERSONA_INFO[pendingExplicitPersona].label}`}
          onClose={() => setPendingExplicitPersona(null)}
        >
          <p>
            {COACH_PERSONA_INFO[pendingExplicitPersona].label} leans into strong language — profanity, insults,
            and jokes that can land as harsh. That&rsquo;s intentional, part of the character, and not something
            we tone down or filter.
          </p>
          <p>
            If strong language isn&rsquo;t for you, another coach is probably a better fit. If this is who you
            want, go ahead — plenty of people enjoy the personality.
          </p>
          <div className="coach-persona-select__confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setPendingExplicitPersona(null)}>
              Choose a different coach
            </button>
            <button type="button" className="btn-primary" onClick={confirmPendingPersona}>
              Continue with {COACH_PERSONA_INFO[pendingExplicitPersona].label}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
