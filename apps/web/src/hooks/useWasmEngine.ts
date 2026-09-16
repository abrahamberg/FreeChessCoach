import { useCallback, useRef, useState } from 'react';
import { cpToWords, mateToWords } from '../engine/eval-words.js';
import { getSharedEngineWorker } from '../engine/shared-engine-worker-instance.js';
import type { SharedEngineWorkerOptions } from '../engine/shared-engine-worker.js';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'analyzing';

export interface EngineBestMoveArrow {
  from: string;
  to: string;
}

export type UseWasmEngineOptions = SharedEngineWorkerOptions;

export interface UseWasmEngineResult {
  status: EngineStatus;
  evaluation: string | null;
  bestMoveArrow: EngineBestMoveArrow | null;
  analyze: (fen: string) => void;
}

const EXPLORE_DEPTH = 15;

function parseUciSquares(uciMove: string): EngineBestMoveArrow {
  return { from: uciMove.slice(0, 2), to: uciMove.slice(2, 4) };
}

/** design.md §5.6: in-browser Explore engine — word-based evals only, never
 * sent to the server. Sits on the app's single SharedEngineWorker so Explore
 * and browser-mode tunnel fulfillment never run two engine processes at
 * once (see engine/shared-engine-worker.ts). */
export function useWasmEngine(options: UseWasmEngineOptions = {}): UseWasmEngineResult {
  const engineRef = useRef(getSharedEngineWorker(options));
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [bestMoveArrow, setBestMoveArrow] = useState<EngineBestMoveArrow | null>(null);

  const analyze = useCallback((fen: string) => {
    setStatus('analyzing');
    const sideToMove = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    void engineRef.current
      .analyze({ fen, depth: EXPLORE_DEPTH, multiPv: 1 })
      .then((lines) => {
        const best = lines[0];
        if (!best) {
          setStatus('ready');
          return;
        }
        setEvaluation(
          best.mateIn !== null ? mateToWords(best.mateIn, sideToMove) : cpToWords(best.cp ?? 0, sideToMove)
        );
        setBestMoveArrow(parseUciSquares(best.moveUci));
        setStatus('ready');
      })
      // analyze() rejects when the engine can't be created at all. Without
      // this the panel sits on 'analyzing' forever and the rejection surfaces
      // as an unhandled promise error.
      .catch(() => setStatus('idle'));
  }, []);

  return { status, evaluation, bestMoveArrow, analyze };
}
