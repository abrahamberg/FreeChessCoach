import { COACH_PERSONAS, COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CheckIcon, UserIcon } from '../../components/Icon.js';
import { Modal } from '../../components/Modal.js';
import './CoachPersonaSelect.css';

export interface CoachPersonaSelectProps {
  value: CoachPersona;
  onChange: (persona: CoachPersona) => void;
}

/** design-improvements.md §3.2/§6: avoid emoji as the permanent icon system
 * — every persona gets a consistent placeholder-avatar treatment (a tinted
 * circle in its own hue + the same person-silhouette glyph) instead of the
 * raw COACH_PERSONA_INFO emoji. Real per-coach portraits can replace the
 * glyph later without touching this component's layout. */
const PERSONA_TINT: Record<CoachPersona, { bg: string; fg: string }> = {
  general: { bg: 'linear-gradient(160deg, #dce8df, #c7dacb)', fg: '#5c7c67' },
  general_female: { bg: 'linear-gradient(160deg, #f3e3d6, #e7cfbb)', fg: '#9c6b3f' },
  commander: { bg: 'linear-gradient(160deg, #e3e6f3, #c9ceeb)', fg: '#5a5fa0' },
  scholar: { bg: 'linear-gradient(160deg, #dcebef, #bfdbe3)', fg: '#3e7c8c' },
  huntress: { bg: 'linear-gradient(160deg, #f6dce0, #edbfc7)', fg: '#a24a5c' },
  shark: { bg: 'linear-gradient(160deg, #ddeee1, #bfe0c8)', fg: '#3e7c57' },
  sunzi: { bg: 'linear-gradient(160deg, #ede7d6, #dcd2ae)', fg: '#8c7a3e' },
  gambler: { bg: 'linear-gradient(160deg, #e6e1f3, #d0c6ea)', fg: '#6b5497' }
};

/** coaches.md: 8 cosmetic coach personas — the same coach, different voice.
 * "Coach" (male or female — the coach as it's always been) is the default;
 * the two share every prompt byte and differ only in voiceProfile (see
 * COACH_PERSONA_INFO), which is why both need it shown alongside the label
 * to stay distinguishable in the picker. Picking an `explicit` persona
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

  return (
    <div className="coach-persona-select" role="radiogroup" aria-label="Coach persona">
      {COACH_PERSONAS.map((persona) => {
        const info = COACH_PERSONA_INFO[persona];
        const tint = PERSONA_TINT[persona];
        const isSelected = value === persona;
        return (
          <label
            key={persona}
            className={isSelected ? 'coach-persona-select__option selected' : 'coach-persona-select__option'}
          >
            <input
              type="radio"
              name="coach-persona"
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
            <span className="coach-persona-select__avatar" style={{ background: tint.bg }} aria-hidden="true">
              <UserIcon width={26} height={26} stroke={tint.fg} strokeWidth={1.6} />
            </span>
            <span className="coach-persona-select__text">
              <span className="coach-persona-select__label">
                {info.label} — {info.voiceProfile}
              </span>
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
