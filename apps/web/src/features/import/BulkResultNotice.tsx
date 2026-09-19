import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { limitMessage } from './import-limit-copy.js';
import type { BulkResult } from './RemoteImportPanel.js';

/** "Imported 3 of 5 games." plus which limit stopped the rest, when one did. */
export function BulkResultNotice({ result }: { result: BulkResult }): ReactNode {
  return (
    <p className="import-page__bulk-result">
      Imported {result.succeeded} of {result.total} games.
      {result.limit && ` ${limitMessage(result.limit)}.`} <Link to="/games">Go to Games</Link>
    </p>
  );
}
