# FreeChessCoach — Implementation Plan

**There is no open plan.** The last one — import limits (30/day, 150/week, 10
in flight, a 1000-game library with auto-delete), the weekly stat archive that
keeps stats when games are deleted, the recommended-coaching-game pick, and
the Analyze / Get-coaching-session import UI (Phases 67–72) — is fully shipped.
It is described in `docs/architecture.md` ("Import Limits, Library Cap and the
Stats Archive") and its full task list is in `git log -- docs/plan.md`.

The plan before it (Phases 50–66, programmatic coach diagnostics) is also in
git history; its spec is `docs/diagnose.md`.

When new work needs a plan, replace this file with it — a source-spec pointer,
an "already exists (verified in code)" section, a layering reminder, then
`## Phase N` / `### Task N.M` blocks, each with a **Read:** line, **Files:**,
unchecked `- [ ]` TDD steps and a `Commit:` line — and update the
`docs/plan.md` bullet in `AGENTS.md` in the same change. Continue phase
numbering from 73.
