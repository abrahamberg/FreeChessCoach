# Board sounds

Generated, not recorded: `scripts/sounds/generate-board-sounds.py` builds
them from scratch (pure Python, deterministic), and re-running it rewrites
these files. The knocks follow a coarse pattern (loudness every 2.5 ms and
third-octave band levels) measured from two reference sounds the owner
chose; no reference audio is used or included. Check is the capture's
pattern made sharper; bad and great are struck wooden bars. 16-bit mono 44.1 kHz WAV (docs/plan.md Phase 88).

| File | What |
|---|---|
| move.wav | the learner's piece landing |
| opponent.wav | the other side's: lower and darker |
| capture.wav | a capture: a brighter hit and a short rattle |
| check.wav | the capture made sharper: higher, brighter, shorter |
| bad.wav | two falling wood notes |
| great.wav | three rising wood notes |
