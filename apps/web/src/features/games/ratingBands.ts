/** Find games' estimated-rating filter: a handful of fixed bands (rather than
 * free-typed min/max) so the filter is one tap and every band maps to the
 * API's `minRating`/`maxRating` bounds (both inclusive). */
export interface RatingBand {
  key: string;
  label: string;
  minRating?: number;
  maxRating?: number;
}

export const RATING_BANDS: RatingBand[] = [
  { key: 'any', label: 'Any rating' },
  { key: 'under-800', label: 'Under 800', maxRating: 799 },
  { key: '800-1199', label: '800 – 1199', minRating: 800, maxRating: 1199 },
  { key: '1200-1599', label: '1200 – 1599', minRating: 1200, maxRating: 1599 },
  { key: '1600-1999', label: '1600 – 1999', minRating: 1600, maxRating: 1999 },
  { key: '2000-plus', label: '2000+', minRating: 2000 }
];

export function findRatingBand(key: string): RatingBand {
  return RATING_BANDS.find((band) => band.key === key) ?? RATING_BANDS[0]!;
}
