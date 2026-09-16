import { plyToMoveRef } from '@freechesscoach/chess-analysis';
import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import { useDiagnosticEvidence } from './useDiagnosticEvidence.js';

export interface EvidenceModalProps {
  code: DiagnosisCodeId;
  label: string;
  onClose: () => void;
}

function describeMoveRef(ply: number): string {
  const ref = plyToMoveRef(ply);
  if (ref.color === null) return 'Game start';
  return `${ref.color === 'white' ? 'White' : 'Black'}'s move ${ref.moveNumber}`;
}

/** Task 58.2's drill-down from a diagnosis (`DiagnosisCard`'s "View
 * evidence", `FocusAreaCard`'s, or a matching `TrendChart` bar) down to the
 * actual plies behind it. No navigation to a game/session yet — plies
 * aren't addressable by URL anywhere in this app today, so this stays an
 * informational list rather than inventing that. */
export function EvidenceModal({ code, label, onClose }: EvidenceModalProps): ReactNode {
  const { data, isLoading, isError } = useDiagnosticEvidence(code);

  return (
    <Modal title={`Evidence — ${label}`} onClose={onClose}>
      {isLoading && <p>Loading…</p>}
      {isError && <p>Could not load evidence for this diagnosis.</p>}
      {data && data.items.length === 0 && <p>No recorded evidence yet.</p>}
      {data && data.items.length > 0 && (
        <ul className="evidence-modal__list">
          {data.items.map((item, index) => (
            <li key={`${item.gameId}-${item.ply}-${index}`}>
              <span>{describeMoveRef(item.ply)}</span>
              <span className="focus-area-card__meta">
                {item.severity}
                {!item.failed && ' (handled correctly)'} &middot;{' '}
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
