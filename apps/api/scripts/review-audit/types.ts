/** One move of one corpus game, with what the engine saw around it. */
export interface AuditPosition {
  key: string;
  gameId: string;
  split: 'dev' | 'holdout';
  band: string;
  /** Where the move stands: `p12` for the review's ply, or the dossier's node id off the main line. */
  where: string;
  moveLabel: string;
  san: string;
  mover: 'white' | 'black';
  readerSide: 'white' | 'black';
  quality: string | null;
  fenBefore: string;
  fenAfter: string;
  /** The engine's lines at the position before the move and after it. */
  linesBefore: LineView[];
  linesAfter: LineView[];
  url: string | null;
  /** The ply a Lichess puzzle starts at (a tactic is here). */
  focus: boolean;
}

export interface LineView {
  san: string;
  cp: number | null;
  mate: number | null;
  pv: string[];
}

export type Surface = 'review' | 'dossier';

export interface CheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

/** One sentence (or dossier fact) a reader or a model sees. */
export interface AuditItem {
  key: string;
  positionKey: string;
  gameId: string;
  split: 'dev' | 'holdout';
  surface: Surface;
  /** What produced it: `review:tactic-allowed:fork`, `dossier:board:attacks`… */
  source: string;
  text: string;
  /** The structured claim behind the text, when there is one. */
  data: unknown;
  /** Positions the sentence may talk about: before, after, and every line it shows. */
  contextFens: string[];
  checks: CheckResult[];
  /** The checks settle it fully (a plain description of the move): no judge needed. */
  settled: boolean;
  /** In the scored sample: a judge must label it for the accuracy number. */
  sampled: boolean;
}

export type Verdict = 'correct' | 'wrong' | 'misleading' | 'unclear';

export interface Label {
  key: string;
  verdict: Verdict;
  note: string;
  /** What kind of mistake, for grouping fixes: `absent-piece`, `wrong-material`, `hypothetical-line`… */
  tag?: string;
  by: string;
  at: string;
}
