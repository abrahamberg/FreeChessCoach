import { ENGINE_DEFAULT_DEPTH } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import {
  BROWSER_ENGINE_DEPTH_OPTIONS,
  getBrowserEngineDepth,
  setBrowserEngineDepth
} from '../../engine/browser-engine-depth.js';

/** Analysis depth for the on-device engine. Stored on this device only, since
 * how deep is sensible depends on this device's speed. */
export function BrowserEngineDepthSelect(): ReactNode {
  const [depth, setDepth] = useState(() => getBrowserEngineDepth() ?? ENGINE_DEFAULT_DEPTH);
  return (
    <label>
      Analysis depth on this device
      <select
        value={depth}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDepth(next);
          setBrowserEngineDepth(next);
        }}
      >
        {BROWSER_ENGINE_DEPTH_OPTIONS.map((option) => (
          <option key={option.depth} value={option.depth}>
            {option.label}
          </option>
        ))}
      </select>
      <small>Deeper gives better analysis but takes longer and uses more battery. Applies to new analyses.</small>
    </label>
  );
}
