# Opening dataset

`openings.tsv` is the pre-built opening dataset from
[`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings).
It includes the `eco`, `name`, `pgn`, `uci`, and `epd` columns needed by the
offline opening-book index builder.

Version pin: 2026-08-22. The upstream commit that produced this checked-in
artifact is not known. When refreshing the dataset, record the upstream source
commit SHA here alongside the refresh date.

# Lichess puzzle motif fixture

`lichess-puzzle-motifs.csv` is a small (360-row), deterministic sample of
real puzzles from [Lichess's open puzzle
database](https://database.lichess.org/#puzzles), used by
`../src/tactic-detectors/lichess-puzzle-validation.test.ts` as independent
ground truth for `classifyTacticMotif` — every other test in that directory
hand-constructs its own FEN with the same mental model as the detector it
tests, so it can only catch a detector disagreeing with its author; this
fixture is tagged by Lichess's own puzzle generator/community, not by us.

Built with `npm run build-puzzle-fixture -- <path-to-lichess_db_puzzle.csv>`
(`../scripts/build-lichess-puzzle-fixture.mjs`) against a decompressed copy
of the full puzzle CSV (`curl
https://database.lichess.org/lichess_db_puzzle.csv.zst | unzstd`, ~290MB
compressed / ~1.1GB decompressed — not committed, download it fresh). The
sample is 40 puzzles per theme (fewer for `doubleCheck`, whose pool at the
filter thresholds below is smaller), for the themes `build-lichess-puzzle-
fixture.mjs`'s `THEME_TO_MOTIF` maps to a `TacticMotifType` we have a
detector for, filtered to rating 1000-2200, popularity >= 70, plays >= 500,
and excluding puzzles longer than a "short" solution — a deliberately
narrow, reasonably-clean slice, not a representative sample of the full
puzzle distribution.

Version pin: sampled 2026-09-03 from the dataset dated 2026-08-02 (source
`Last-Modified` header). Re-running the build script against a newer
download will select a different (but similarly-sized) sample — re-run
`lichess-puzzle-validation.test.ts` afterward and update its `MIN_PASS`
thresholds to match, rather than assuming they still hold.
