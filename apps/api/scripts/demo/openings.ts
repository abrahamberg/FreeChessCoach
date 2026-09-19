import type { PlayerColor } from '@freechesscoach/shared';

/** A real opening line the demo player might have on the board, with the names
 * a book lookup would give it. `skill` is how this player fares in it relative
 * to their average (the Stats page's "Performance by opening" needs some
 * openings to be clearly better than others to be worth looking at). */
export interface DemoOpening {
  name: string | null;
  eco: string | null;
  family: string | null;
  variation: string | null;
  /** Which side the player takes it as. */
  as: PlayerColor;
  plies: readonly string[];
  /** Accuracy points above/below the player's own average in this opening. */
  skill: number;
  /** How often it turns up among that colour's games, once the player has a repertoire. */
  weight: number;
}

function line(as: PlayerColor, name: string, eco: string, moves: string, skill: number, weight: number): DemoOpening {
  const [family, variation] = name.split(': ') as [string, string | undefined];
  return { name, eco, family: family ?? name, variation: variation ?? null, as, plies: moves.split(' '), skill, weight };
}

export const DEMO_OPENINGS: readonly DemoOpening[] = [
  line('white', 'Italian Game: Giuoco Piano', 'C50', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 h3 h6', 4, 30),
  line('white', 'London System', 'D02', 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6', 2, 26),
  line('white', 'Scotch Game', 'C45', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6', 1, 14),
  line('white', 'Ruy Lopez: Closed', 'C84', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O', -2, 12),
  line('white', "Queen's Gambit Declined: Exchange Variation", 'D35', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5', -3, 10),
  line('white', 'Vienna Game', 'C26', 'e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3 Nc6 Nb5 g6 Qf3 f5 Qd5 Qe7', 0, 8),
  line('black', 'Caro-Kann Defense: Classical Variation', 'B18', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7', 3, 28),
  line('black', 'Sicilian Defense: Najdorf Variation', 'B90', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O', -5, 22),
  line('black', 'French Defense: Winawer Variation', 'C18', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O Bd3 Nbc6', -1, 16),
  line('black', 'Scandinavian Defense: Main Line', 'B01', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 c6 Nf3 Nf6 Bc4 Bf5 Bd2 e6 Nd5 Qd8', 2, 12),
  line('black', "King's Indian Defense: Classical Variation", 'E92', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7', -4, 12),
  line('black', "Queen's Gambit Declined", 'D30', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 Bd3 Bb7', 0, 10)
];

/** Lines the book has no name for — a beginner's early games are full of them,
 * and an advanced player still meets one now and then. */
export const UNNAMED_OPENINGS: readonly DemoOpening[] = [
  { name: null, eco: null, family: null, variation: null, as: 'white', skill: -3, weight: 1, plies: 'a3 e5 h3 d5 b3 Nf6 g3 Bd6 Bb2 O-O Bg2 Nc6'.split(' ') },
  { name: null, eco: null, family: null, variation: null, as: 'white', skill: -3, weight: 1, plies: 'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 Nbd2 Nc6 e4 e5 c3 a5'.split(' ') },
  { name: null, eco: null, family: null, variation: null, as: 'black', skill: -3, weight: 1, plies: 'e4 a6 d4 h6 Nf3 b6 Bd3 Bb7 O-O e6 c4 Nf6'.split(' ') },
  { name: null, eco: null, family: null, variation: null, as: 'black', skill: -3, weight: 1, plies: 'd4 g5 Bxg5 Bg7 e4 h6 Bf4 d6 Nc3 c6 Qd2 Nf6'.split(' ') }
];
