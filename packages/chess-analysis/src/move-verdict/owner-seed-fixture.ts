import type { Score } from './verdict-test-fixtures.js';

/**
 * The owner's game behind `docs/plan.md` finding F1
 * (`seed:chesscom-184514899210`), with the engine lines it was analysed
 * with at the nine positions its three reported prevention cards read:
 * for each of plies 23 (12.Bxc5), 29 (15.Nxe5) and 49 (25.Qxc7), the
 * position before the opponent's previous move, before the move and after
 * it. Keyed by position index (0 = the start); scores are White's.
 */
export const OWNER_SEED_PGN =
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. O-O O-O 6. d4 d5 7. dxc5 dxc4 8. Qxd8 Rxd8 9. Be3 Nxe4 10. Nbd2 Bf5 ' +
  '11. Nxc4 Nxc5 12. Bxc5 b5 13. Ncxe5 Bd3 14. Rfd1 Nxe5 15. Nxe5 Rd5 16. Nxd3 Rad8 17. b4 a5 18. bxa5 f5 19. a6 f4 ' +
  '20. a7 Rxd3 21. Rxd3 Rxd3 22. a8=Q+ Kf7 23. Qf8+ Ke6 24. Qe7+ Kd5 25. Qxc7 f3 26. h4 Rxc3 27. Rd1+ Kc4 28. Rd4# 1-0';

export const OWNER_SEED_LINES: Record<number, [string, Score][]> = {
  21: [
    ['f6 Rfd1 Rxd1+ Rxd1 Be6 Na3 Bxa2 Ne1 f5 Ra1', -140],
    ['Re8 Rfd1 a6 a4 f6 h3 Kf7 a5', -98],
    ['Rd5 Rfd1 Rad8 Rxd5 Rxd5 Ncd2 Nxd2 Nxd2 f6 f3', -95],
    ['Be6 Nfxe5 Nxe5 Nxe5 f6 Nf3 a5 Rfe1 Kf7 Bf4', 18],
    ['a5 Nfxe5 Nxe5 Nxe5 f6 Nc4 a4 f3 Be6 Na3', 29]
  ],
  22: [
    ['Bxc5 Bd3 Ncd2 Bxf1 Kxf1 f5 Be3 h6 g3 g5', 94],
    ['Nfxe5 Nxe5 Nxe5 Na4 g4 Be6 f4 Nxb2', -88],
    ['Ncxe5 Nxe5 Bxc5 Nd3 Ba3 Rd7 Nd4 Bg6 Rad1 c5', -114],
    ['Rfd1 Rxd1+ Rxd1 Nd7 Nfd2 f6 f4 Rd8 Nf3 Be6', -204],
    ['Nh4 Bd3 Bxc5 Bxc4 Rfe1 f6 Be3 a5 f4 a4', -235]
  ],
  23: [
    ['Bd3 Ncd2 e4 Nd4 Bxf1 Kxf1 Ne5 Nxe4 b6', 114],
    ['f6 Ne3 Be6 Rfd1 b6 Rxd8+ Rxd8 Ba3 a5 Kf1', 277],
    ['Be6 Ne3 b6 Ba3 f6 Rfd1 Rxd1+ Nxd1 Rd8 Ne3', 277],
    ['b6 Be3 f6 Nfd2 Ne7 a4 Be6 a5 Nf5 Rfd1', 278],
    ['h6 Ne3 Be6 Rfd1 Rxd1+ Rxd1 Bxa2 c4 b6 Ba3', 303]
  ],
  27: [
    ['Nxe5 Nxe5 Be4 Re1 Bb7 Be3 a5 Nf3 Bxf3 gxf3', 488],
    ['Be4 Rxd8+ Rxd8 Nxc6 Bxc6 Nd4 Bd5 f3 a5 Nxb5', 507],
    ['Bc2 Rxd8+ Nxd8 Ne1 Nb7 Be3 Be4 h4 a5 N5f3', 521],
    ['Be2 Rxd8+ Nxd8 Re1 a6 Be3 a5 h4 f6 Nd4', 530],
    ['Rd5 Nxd3 Rad8 Re1 Rxd3 Be3 Ne5 Nxe5', 577]
  ],
  28: [
    ['Nxe5 Be2 Re1 Rd2 b4 a5 Be3 Rc2 Nc6 Bc4', 488],
    ['Ne1 Rd7 Be3 Be2 Rxd7 Nxd7 f3 Bc4 b3 Be6', 24],
    ['Nd4 Rd5 b4 Bc4 Nb3 f6 Rxd5 Bxd5 Nd4 a6', 2],
    ['a4 Nxf3+ gxf3 Rd5 Be3 bxa4 Rxa4 a6 Rd4 Rxd4', -7],
    ['Be3 Nxf3+ gxf3 a6 Rd2 Bc4 b3 Be6 Rad1 Rxd2', -14]
  ],
  29: [
    ['Be4 Re1 Bb7 Be3 a5 Nf3 Bxf3 gxf3 f6 a4', 495],
    ['Be2 Re1 Rd2 b4 Rc2 Nc6 Bc4 Ne7+ Kh8 Nf5', 503],
    ['Bc2 Re1 f6 Nc6 Re8 b4 Rxe1+ Rxe1 Bg6 f3', 529],
    ['Bg6 Rxd8+ Rxd8 Nc6 Bh5 b4', 532],
    ['Bf5 Rxd8+ Rxd8 Nc6 Re8 Ne7+ Kh8 f4 Be6 f5', 539]
  ],
  47: [
    ['Kd5 Qxc7 g5 Re1 Rd1 Qd6+ Kc4 Rxd1 b4 cxb4', 1077],
    ['Kf5 Qf7+ Kg5 Be7+ Kh6 Qe6+ g6 Bf8+ Kg5 Re1', 3636]
  ],
  48: [
    ['Bb4 Rxc3 Re1 Kc6 Re6+ Kd5 Bxc3 Kc4 Qxc7+ Kd3', 3992],
    ['Qxc7 b4 Bxb4 Ke6 Re1+ Kf5 Qxg7 Re3 Rxe3 fxe3', 3670],
    ['Re1 Kc6 Bb4 Rd6 Qe4+ Rd5 Rd1 Kb6 Qxd5 c6', 1052],
    ['a4 bxa4 Qxc7 Rd4 Bf8 Rd1+ Rxd1+ Ke4', 814],
    ['h4 Kc6 Bb4 Rd6 Qe4+ Kb6 Qa8 c6 Bxd6 f3', 773]
  ],
  49: [
    ['b4 Bxb4 Ke6 Re1+ Kf5 Qxg7 Re3 Rxe3 fxe3 Qxh7+', 3670],
    ['Ke4 Re1+ Re3 fxe3 Kd3 exf4 b4 Qe7 Kc4 Bxb4', 4019],
    ['Ke6 Re1+ Re3 fxe3 Kf6 Qe7+ Kf5 Qf7+ Ke4 exf4+', 4019],
    ['f3 Re1 Re3 Rd1+ Rd3 Rxd3+ Ke4 Qd6 h5 Qd5+', { mate: 9 }],
    ['g5 Re1 Re3 fxe3 g4 exf4 g3 hxg3 Kc4 Bb4+', { mate: 8 }]
  ]
};
