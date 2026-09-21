import { isLegalFen } from '@freechesscoach/chess-analysis';
import { ENGINE_PING_FEN, EnginePingResponseSchema, type EngineMode, type EnginePingResponse } from '@freechesscoach/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiPost, describeApiError } from '../../api/client.js';
import './EnginePingTest.css';

const SOURCE_LABELS: Record<EnginePingResponse['source'], string> = {
  lichessIndex: 'Lichess eval index',
  internalEngine: 'Internal engine',
  externalEngine: 'External engine'
};

/** formatElapsed(1800) → "1.8s", formatElapsed(180) → "180ms" — the ping's
 * headline number, so keep the unit in whatever magnitude reads fastest. */
function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${trimTrailingZero((ms / 1000).toFixed(1))}s`;
}

function trimTrailingZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** White-perspective eval, compact: +0.35 / −1.20 / #4 / #−2, or "—" when
 * the pipeline came back with no eval at all. */
function formatEval(response: EnginePingResponse): string {
  if (response.eval.mateIn !== null) return `#${response.eval.mateIn}`;
  if (response.eval.cp !== null) {
    const pawns = response.eval.cp / 100;
    return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }
  return '—';
}

/** Settings → Engine → "Engine ping test" (collapsed by default). Analyzes
 * one FEN through the app's normal engine pipeline and reports which tier
 * served it, how long it took, the eval, the depth and the line count — so
 * a slow or broken engine setting is visible from Settings. A FEN the
 * Lichess community has already evaluated comes back from the bin almost
 * instantly (labeled as such); the default FEN is one the bin has never
 * seen, so the first run really exercises the engine. Re-runs automatically
 * whenever the engine mode changes, per the point of the test: comparing
 * what each setting actually does. */
export function EnginePingTest({ engineMode }: { engineMode: EngineMode }): ReactNode {
  const [fen, setFen] = useState(ENGINE_PING_FEN);
  const pingMutation = useMutation({
    mutationFn: (requestFen: string) => apiPost('/api/engine/ping', { fen: requestFen }, EnginePingResponseSchema)
  });

  const fenRef = useRef(fen);
  fenRef.current = fen;
  const previousModeRef = useRef<EngineMode | null>(null);
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = engineMode;
    if (previous === null || previous === engineMode) return;
    pingMutation.mutate(fenRef.current);
  }, [engineMode, pingMutation]);

  const fenIsLegal = isLegalFen(fen);
  const result = pingMutation.data ?? null;

  return (
    <details className="engine-ping">
      <summary className="engine-ping__summary">Engine ping test</summary>
      <p className="engine-ping__hint">
        Analyzes one position through the app's normal engine pipeline (Lichess eval index → cache → your selected
        engine) and reports what came back. A position already in the Lichess index returns in milliseconds.
      </p>
      <div className="engine-ping__row">
        <input
          className="engine-ping__fen"
          type="text"
          value={fen}
          onChange={(event) => setFen(event.target.value)}
          spellCheck={false}
          aria-label="Position to analyze (FEN)"
        />
        <button type="button" className="btn-primary" disabled={!fenIsLegal || pingMutation.isPending} onClick={() => pingMutation.mutate(fen)}>
          Test
        </button>
      </div>
      {!fenIsLegal && <p className="engine-ping__error">Not a valid FEN position.</p>}
      {pingMutation.isPending && (
        <p className="engine-ping__status" role="status">
          <span className="engine-ping__spinner" aria-hidden="true" />
          Analyzing position…
        </p>
      )}
      {pingMutation.isError && <p className="engine-ping__error">{describeApiError(pingMutation.error) ?? 'Engine test failed.'}</p>}
      {result && !pingMutation.isPending && (
        <p className="engine-ping__result" role="status">
          <strong>{formatElapsed(result.elapsedMs)}</strong> · {SOURCE_LABELS[result.source]} · eval {formatEval(result)} ·
          depth {result.depth} · {result.lines.length} lines ({Math.max(0, result.lines.length - 1)} alternatives)
          {result.bestMove && <> · best {result.bestMove}</>}
        </p>
      )}
    </details>
  );
}
