import { legalSanMoves, positionKey } from '@freechesscoach/chess-analysis';
import { ENGINE_MULTI_PV, type EngineEval } from '@freechesscoach/shared';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';

interface Search {
  depth: number | undefined;
  multiPv: number;
  minLines: number | undefined;
  evaluation: EngineEval;
}

/**
 * One analysis's searches, kept for the analysis's length: a position asked
 * for again is answered from an earlier search that covers the request (the
 * same depth, at least as many lines, enough lines for `minLines`), cut to the
 * lines asked for, instead of searching it again. Game Review asks for five
 * lines and the course dossier for three, so a game analysed both ways (the
 * review audit's `analyseGame`) searches each position once.
 *
 * Positions match by `positionKey`, as the review's own chunks do; each
 * answer carries the fen and index it was asked with. Build one per analysis
 * and drop it after: it never expires. Only game searches go through it:
 * `analyzePosition`'s answer has more than a game search keeps.
 */
export class SearchMemoEngineBackend implements Pick<EngineBackend, 'analyzeGame'> {
  private readonly searches = new Map<string, Search[]>();

  constructor(private readonly inner: Pick<EngineBackend, 'analyzeGame'>) {}

  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const wanted = searchOf(opts);
    const missing = [...new Map(fens.filter((fen) => !this.covering(fen, wanted)).map((fen) => [positionKey(fen), fen])).values()];
    if (missing.length) await this.search(missing, opts, wanted);
    return fens.map((fen, ply) => {
      const found = this.covering(fen, wanted);
      if (!found) throw new Error(`the engine returned no eval for ${fen}`);
      return { ...found.evaluation, ply, fen, lines: found.evaluation.lines.slice(0, wanted.multiPv) };
    });
  }

  private async search(fens: string[], opts: EngineBackendAnalyzeOptions | undefined, wanted: Omit<Search, 'evaluation'>): Promise<void> {
    const evals = await this.inner.analyzeGame(fens, opts);
    fens.forEach((fen, index) => {
      const evaluation = evals[index];
      if (!evaluation) return;
      const key = positionKey(fen);
      this.searches.set(key, [...(this.searches.get(key) ?? []), { ...wanted, evaluation }]);
    });
  }

  private covering(fen: string, wanted: Omit<Search, 'evaluation'>): Search | undefined {
    return this.searches.get(positionKey(fen))?.find((search) => covers(search, wanted));
  }
}

/** Unset `multiPv` is the default every backend searches. */
function searchOf(opts: EngineBackendAnalyzeOptions | undefined): Omit<Search, 'evaluation'> {
  return { depth: opts?.depth, multiPv: opts?.multiPv ?? ENGINE_MULTI_PV, minLines: opts?.minLines };
}

/** A search answers a request at its own depth with no more lines than it
 * has. `minLines` (a Lichess index hit with too few lines counts as a miss) is
 * met as the index backend meets it: the search has that many lines, or every
 * legal move, or itself asked for at least as many. */
function covers(search: Search, wanted: Omit<Search, 'evaluation'>): boolean {
  if (search.depth !== wanted.depth || search.multiPv < wanted.multiPv) return false;
  const lines = search.evaluation.lines.length;
  if (!wanted.minLines || lines >= wanted.minLines || (search.minLines ?? 0) >= wanted.minLines) return true;
  return lines >= legalSanMoves(search.evaluation.fen).length;
}
