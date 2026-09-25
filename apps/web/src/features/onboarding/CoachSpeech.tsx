import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';

export interface CoachSpeechProps {
  persona: CoachPersona;
  text: string;
}

/** The selected coach, speaking a step's instructions in a chat bubble. */
export function CoachSpeech({ persona, text }: CoachSpeechProps): ReactNode {
  return (
    <div className="onboarding__speech">
      <CoachAvatar persona={persona} size="header" />
      <div className="onboarding__bubble" role="status" aria-live="polite">
        <strong className="onboarding__speaker">{COACH_PERSONA_INFO[persona].label}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
