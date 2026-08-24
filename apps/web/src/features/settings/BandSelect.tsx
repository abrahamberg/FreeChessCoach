import { RATING_BANDS, type RatingBand } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './BandSelect.css';

export interface BandSelectProps {
  value: RatingBand;
  onChange: (band: RatingBand) => void;
}

const BAND_LABELS: Record<RatingBand, string> = {
  novice: 'New to chess',
  improving: 'Improving',
  club: 'Club level',
  advanced: 'Advanced'
};

/** design-improvements.md §3.2: rating band is an ordinal scale (novice →
 * advanced), so it reads as a single-row segmented control rather than a
 * list of independent cards — the 4 bands described in plain language,
 * never the raw enum value. */
export function BandSelect({ value, onChange }: BandSelectProps): ReactNode {
  return (
    <div role="radiogroup" aria-label="Rating band" className="band-select">
      {RATING_BANDS.map((band) => (
        <label key={band} className={value === band ? 'band-select__option selected' : 'band-select__option'}>
          <input type="radio" name="rating-band" checked={value === band} onChange={() => onChange(band)} />
          {BAND_LABELS[band]}
        </label>
      ))}
    </div>
  );
}
