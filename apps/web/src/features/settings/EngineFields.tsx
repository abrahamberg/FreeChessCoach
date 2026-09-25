import type { UserProfile } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useUpdateProfile } from '../../hooks/useProfile.js';
import { EngineModeSelect } from './EngineModeSelect.js';
import { EnginePingTest } from './EnginePingTest.js';

/** Engine choice plus the test button that pings the chosen engine. */
export function EngineFields({ profile }: { profile: UserProfile }): ReactNode {
  const update = useUpdateProfile();
  return (
    <>
      <EngineModeSelect
        value={profile.engineMode}
        onChange={(engineMode) => update.mutate({ engineMode })}
        chessApiPausedUntil={profile.chessApiPausedUntil}
      />
      <EnginePingTest engineMode={profile.engineMode} />
    </>
  );
}
