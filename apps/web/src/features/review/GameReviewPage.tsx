import { isTopReviewTier } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEngineActivityIndicator } from '../../hooks/useEngineActivityIndicator.js';
import { GameReviewView } from './GameReviewView.js';
import { toReviewedGame, useStoredGame } from './useStoredGame.js';

/** `/review/:gameId`: Game Review of one of the account's stored games
 * (GameReviewView). The one mutation is "Continue with Coach", offered once
 * the analysis is ready and the game is not at the coach tier yet. */
export function GameReviewPage(): ReactNode {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  // AppShell hides its own top bar (Settings, the engine indicator) for
  // every board route — SessionHeader's own overflow menu is the only place
  // left to reach them from here.
  const engineActivity = useEngineActivityIndicator();
  const { gameQuery, coachPersona, continueWithCoach, isContinuingWithCoach, continueWithCoachError } = useStoredGame(gameId ?? '');

  if (gameQuery.isLoading) return <p>Loading…</p>;
  if (gameQuery.isError || !gameQuery.data) return <p>Could not load this game.</p>;

  const game = gameQuery.data;
  const canContinueWithCoach = !isTopReviewTier(game.reviewTier) && game.analysisStatus === 'ready';
  return (
    <GameReviewView
      game={toReviewedGame(game)}
      coachPersona={coachPersona}
      onBack={() => navigate('/games')}
      engineActivity={engineActivity}
      continueWithCoach={canContinueWithCoach ? { start: continueWithCoach, isStarting: isContinuingWithCoach, failed: continueWithCoachError } : undefined}
    />
  );
}
