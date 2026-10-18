# Board sounds

Generated, not recorded: `scripts/sounds/generate-board-sounds.py` builds
them from scratch (pure Python, deterministic), and re-running it rewrites
these files. The knocks follow a coarse pattern (loudness every 2.5 ms and
third-octave band levels) measured from two reference sounds the owner
chose; no reference audio is used or included. 16-bit mono 44.1 kHz WAV (docs/plan.md Phase 88).

| File | What |
|---|---|
| move.wav | the learner's piece landing |
| opponent.wav | the other side's: lower and darker |
| capture.wav | a capture: a brighter hit and a short rattle |
| check.wav | the capture made sharper, over a heavier knock |
| bad.wav | the move's knock with its ring choked |
| great.wav | between a capture and a move |

The videos' cut sounds come from `scripts/sounds/generate-clip-sounds.py`
(docs/courses.md §13.8), also generated from scratch:

| File | What |
|---|---|
| riser.wav | a low hum building for 5 s under a puzzle's countdown |
| whoosh.wav | a soft air sweep for a cut: a chapter card, the hook cutting back |
| wand.wav | Vesper's (the witch's) cut, in place of the whoosh: a magic wand's sparkle, 1 s |

`wand.wav` is not generated: it is the first second of a sound effect the
owner chose (2026-10-18), from its start at 70 ms, mixed to mono at 44.1 kHz,
faded out over its last 250 ms and set as loud as the whoosh on average
(-19 dB mean, -2 dBFS peak).
