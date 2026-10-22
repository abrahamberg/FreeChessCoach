import type { PieceSymbol, Square } from 'chess.js';
import type { PieceAt, Side } from '../board-facts/types.js';

export type Wing = 'kingside' | 'queenside';

/**
 * One reason a move was played, as data: the "why" a coach gives beside the
 * move ("develops the knight towards the centre", "prevents …Bg4 pinning the
 * knight", "weakens g3"). Every one is checked on the board (or along the
 * engine's own line, for `prepares`); `renderMoveIdea` says it in words.
 */
export type MoveIdea =
  // Development
  | { kind: 'develops'; piece: PieceAt; natural: boolean }
  | { kind: 'clearsCastling'; wing: Wing }
  | { kind: 'castles'; wing: Wing; rook: Square }
  | { kind: 'developmentLead'; leader: Side; leaderCount: number; otherCount: number }
  | { kind: 'movesAgain'; piece: PieceAt; times: number; undeveloped: number }
  | { kind: 'blocksPawn'; piece: PieceAt; pawn: Square }
  | { kind: 'takesKnightSquare'; square: Square }
  | { kind: 'earlyQueen'; square: Square; undeveloped: number }
  // Centre
  | { kind: 'occupiesCentre'; square: Square }
  | { kind: 'controlsCentre'; squares: Square[]; pressures: Square[] }
  | { kind: 'supportsCentre'; pawn: Square }
  | { kind: 'strikesCentre'; target: Square }
  | { kind: 'centralises'; piece: PieceAt; reach: number }
  | { kind: 'givesUpCentre'; from: Square }
  // Lines
  | { kind: 'opensLine'; piece: PieceAt; before: number; after: number }
  | { kind: 'shutsIn'; piece: PieceAt; before: number; after: number }
  | { kind: 'opensEnemyLine'; piece: PieceAt; before: number; after: number }
  | { kind: 'longDiagonal'; piece: PieceAt }
  | { kind: 'aimsAt'; piece: PieceAt; target: PieceAt; through: PieceAt | null; onlyKingDefends: boolean }
  | { kind: 'rookFile'; file: string; open: boolean }
  | { kind: 'rookToCentre'; file: string }
  | { kind: 'connectsRooks' }
  | { kind: 'opensFile'; file: string; open: boolean }
  | { kind: 'battery'; front: PieceAt; back: PieceAt; target: Square }
  | { kind: 'fianchetto'; piece: PieceAt }
  | { kind: 'doubles'; pieces: PieceAt[]; line: string }
  | { kind: 'seventhRank'; piece: PieceAt }
  // Threats
  | { kind: 'threatensMate'; line: string[] }
  | { kind: 'threatensMaterial'; san: string; target: PieceAt }
  | { kind: 'pilesOn'; target: PieceAt; attackers: number; defenders: number }
  | { kind: 'pinnedCannotTake'; pinned: PieceAt; by: PieceAt }
  | { kind: 'pins'; pinned: PieceAt; to: PieceAt }
  | { kind: 'keepsPin'; pinned: PieceAt }
  | { kind: 'leavesPinned'; pinned: PieceAt; to: PieceAt }
  | { kind: 'kicks'; target: PieceAt; pinning: PieceAt | null }
  // Defence
  | { kind: 'stopsMate'; line: string[] }
  | { kind: 'saves'; piece: PieceAt; how: 'moves' | 'takes' | 'defends' | 'blocks' | 'counters' }
  | { kind: 'prevents'; san: string; because: PreventedBecause }
  | { kind: 'unpins'; piece: PieceAt }
  | { kind: 'defends'; piece: PieceAt; attackers: number; defenders: number }
  // King
  | { kind: 'weakensShield'; pawn: Square; holes: Square[] }
  | { kind: 'breaksShield'; pawn: Square }
  | { kind: 'removesDefender'; piece: PieceAt; guarded: 'king' | PieceAt }
  | { kind: 'joinsAttack'; piece: PieceAt; kingSquares: number }
  | { kind: 'guardsKing'; piece: PieceAt }
  | { kind: 'flightSquare'; square: Square }
  | { kind: 'takesFlightSquare'; square: Square }
  | { kind: 'leavesKing'; piece: PieceAt }
  | { kind: 'stopsCastling'; wing: Wing; square: Square }
  | { kind: 'losesCastling' }
  | { kind: 'activatesKing'; square: Square; invades: boolean }
  | { kind: 'restricts'; piece: PieceAt; moves: number }
  // Pawns and squares
  | { kind: 'outpost'; piece: PieceAt; supportedBy: Square | null; secure: boolean }
  | { kind: 'occupiesHole'; piece: PieceAt; nearKing: boolean }
  | { kind: 'blockades'; pawn: Square }
  | { kind: 'pawnStorm'; pawn: Square }
  | { kind: 'passedPawn'; square: Square; created: boolean; toGo: number }
  | { kind: 'pawnWeakness'; owner: Side; weakness: 'doubled' | 'isolated'; where: string[] }
  | { kind: 'gainsSpace'; square: Square; cramps: PieceSymbol | null }
  | { kind: 'fixesPawn'; pawn: Square }
  | { kind: 'majority'; wing: Wing; own: number; theirs: number }
  | { kind: 'forcesWeakness'; reply: string; weakness: 'doubled' | 'isolated'; where: string[] }
  // Material
  | { kind: 'sacrifices'; piece: PieceAt }
  | { kind: 'materialBalance'; fen: string }
  // Trades
  | { kind: 'tradesWhenAhead'; ahead: number }
  | { kind: 'recapturesTowardCentre'; from: Square; to: Square }
  | { kind: 'bishopPair'; gains: boolean }
  // Plans
  | { kind: 'prepares'; san: string; how: 'supports' | 'clears' | 'opens' }
  | { kind: 'preparesPush'; pawn: Square; to: Square }
  | { kind: 'preparesFianchetto'; bishop: Square; to: Square }
  | { kind: 'eyesOutpost'; piece: PieceAt; square: Square };

export type MoveIdeaKind = MoveIdea['kind'];

/** Why a move the opponent wanted is gone. */
export type PreventedBecause = 'pin' | 'check' | 'attack' | 'break' | 'outpost' | 'invade' | 'advance';
