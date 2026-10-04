---
name: review-why-pass
description: How to find the missing "why" logic for Game Review's move notes — take one real game, give Opus review-why-analyst agents every move that was not the engine's best, have them compare the played and best positions with the probe, then turn the recurring differences into board-checkable rules. Use when the owner reports an unexplained or generic move note ("X was better", no comment), asks to delegate analysis of moves to subagents, or wants more positional comments.
---

# Why pass — from unexplained moves to rules

Why this shape: asking a model to *comment* on a move gets descriptions
("Bd6 develops the bishop"). Asking it **what the best move does that the played
move does not**, with the two resulting positions compared in numbers, gets
differences a program can compute (safe checks left to the opponent, a pawn's
hold on a centre square, flight squares of a trapped queen). The owner's rule:
"find why, then see how we can make it logic."

## Steps

1. **Pick one real game** (the owner's report, or a dev game) and have its
   stored evals: `analyses.engine_evals` in the dev DB
   (`docker exec chess-ai-coach-postgres-1 psql -U chess_coach chess_coach`) or a
   corpus evals file. Dev stack engine: `curl -s localhost:8081/health`.
2. **Build the batches**:
   `npx tsx apps/api/scripts/review-audit/why-batch.ts --pgn <pgn> --evals <evals.json> --out <scratchpad dir> --reader <Black|White>`
   (two files by default; `--min-loss`, `--skip-plies`, `--parts`).
3. **Spawn one `review-why-analyst` agent per file, in parallel**, giving the
   batch path and an answer path (`answers-why-N.json`) in the prompt. Opus,
   about 15 moves each, 5–15 minutes. Do not summarise the task for them:
   the agent file holds the instructions.
4. **Group the answers** by `decisive_difference`. Per group: how many entries,
   whether the app already says it (run the game through the real pipeline,
   see below), and whether it is one example or many.
5. **Build only what recurs and is computable**: a rule that compares two
   resulting positions, with a loss gate (`smallLoss`, 150 cp) and a place
   below the existing reasons in `principle-reasons.ts`. A principle never
   outranks mate, material or a tactic card.
6. **Measure before keeping** — on the stored games (and the dev corpus when the
   owner allows a long run): how often it fires, read every hit, drop what reads
   as noise. Add unit tests on the smallest position.
7. **Record what was not built** in `docs/review-open-ideas.md`: one row per
   idea with its evidence count. Add examples to existing rows when a new game
   shows them; promote a row to "built" when it recurs enough.

## Facts learned

- The stored evals are depth 12 (the app never searches deeper). Agents must
  re-check gaps at depth 20+: in one game 4 of 30 "best" moves were not best at
  depth 22, and gaps under about 20 cp have no concrete reason. Stay silent there.
- A positional note fits a small loss only; past 150 cp the real cause is
  tactical and another layer says it.
- The two-pass comparison pays: pass one (comment the uncommented moves) found
  4 rules, pass two (why best beats played) found rules that the first missed.
- Running the pipeline over a stored game takes about a minute:
  `analyseGame` (`scripts/review-audit/analyze.ts`) with a `StoredEvalsEngine`
  (`stored-engine.ts`) over `NativeEngineBackend('http://localhost:8081')`.
  Editing source in `packages/chess-analysis` restarts the engine container and
  fails runs in flight with "fetch failed"; edit between runs, not during.
