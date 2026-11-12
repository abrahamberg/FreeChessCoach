import { useCallback, useEffect, useState } from 'react';
import { initialReviewEngine, readDeviceSignals, savedReviewEngine, saveReviewEngine, type ReviewEngine } from './review-engine-choice.js';
import { ReviewEngineSwitch } from './review-engine-switch.js';
import { analyzeOnDevice } from './review-in-browser.js';
import { analyzeOnServer } from './server-review-engine.js';

/** The page's one ReviewEngineSwitch, its status as React state, and the
 * visitor's pick (remembered on this device). */
export function useReviewEngine(linkEngine: ReviewEngine | null) {
  const [engines] = useState(
    () =>
      new ReviewEngineSwitch(initialReviewEngine(linkEngine, savedReviewEngine(), readDeviceSignals()), {
        device: analyzeOnDevice,
        server: (fens, multiPv) => analyzeOnServer(fens, multiPv)
      })
  );
  const [status, setStatus] = useState(engines.status);
  useEffect(() => engines.subscribe(setStatus), [engines]);
  const choose = useCallback(
    (engine: ReviewEngine) => {
      saveReviewEngine(engine);
      engines.choose(engine);
    },
    [engines]
  );
  return { engines, status, choose };
}
