import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import { buildCoachSystemPrompt } from '../src/coach-system.js';
import { buildPlannerMessages } from '../src/analysis-planner.js';
import { buildSummarizerMessages } from '../src/progress-summarizer.js';
import { buildOnboardingProfilerMessages } from '../src/onboarding-profiler.js';
import { INVESTIGATE_POSITION_SYSTEM_PROMPT, renderInvestigatePositionPrompt } from '../src/investigate-position.js';
import { buildPuzzleCoachSystemPrompt } from '../src/puzzle-coach-system.js';
import { CALIBRATION } from '../src/calibration.js';
import {
  baseCoachInput,
  basePlannerInput,
  baseSummarizerInput,
  baseOnboardingInput,
  basePuzzleCoachInput,
  investigatePositionFixture
} from '../src/fixtures.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const outputPath = path.join(scriptDirectory, '../../../docs/prompts.md');

function fence(text: string): string {
  return '```\n' + text + '\n```';
}

export function renderDoc(): string {
  const coach = buildCoachSystemPrompt(baseCoachInput());
  const planner = buildPlannerMessages(basePlannerInput());
  const summarizer = buildSummarizerMessages(baseSummarizerInput());
  const onboarding = buildOnboardingProfilerMessages(baseOnboardingInput());
  const investigate = renderInvestigatePositionPrompt(investigatePositionFixture.fen, investigatePositionFixture.question);
  const puzzleCoach = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput());

  return `# Chess AI Coach — LLM Prompts

**GENERATED — do not hand-edit.** Produced by
\`packages/prompts/scripts/generate-doc.ts\` from the actual builder functions
in \`packages/prompts/src/\`, each called with the fixtures in
\`packages/prompts/src/fixtures.ts\` — the same fixtures the package's own
tests use. Run \`npm run docs:prompts\` after changing prompt text; a checked
Vitest test (\`packages/prompts/scripts/generate-doc.test.ts\`) fails the build
if this file drifts from what the code actually produces, so this document
cannot go stale the way a hand-maintained copy did.

Each prompt below is one concrete rendered example, not a mustache-style
template — read the corresponding \`packages/prompts/src/*.ts\` file for the
input shape and every variant. Code comments that reference "prompts.md"
point at the builder/render function name, not a section number here, since
this file's structure isn't hand-authored.

Design principles for all prompts:
- The product is a **personal coach who knows this user**, not an analysis
  engine. Every prompt receives user history and must use it.
- Closed vocabularies (mistake taxonomy, bands) are injected as literal lists
  so the model can't invent categories.
- Structured outputs are validated with zod; on failure we retry once with
  the validation error appended.
- Game text (PGN, player names) and user chat are untrusted data, never
  instructions.

Shared constant, injected wherever the coach prompt lists mistake categories
(\`MISTAKE_CATEGORIES_BLOCK\`, \`packages/prompts/src/render.ts\`):

${fence(MISTAKE_CATEGORIES.join(', '))}

## Prompt inventory

| Prompt | Model tier | Called by | Builder |
|---|---|---|---|
| Coach agent system prompt | standard | every session turn | \`coach-system.ts\`: \`buildCoachSystemPrompt\` |
| Analysis planner | light | worker, once per game | \`analysis-planner.ts\`: \`buildPlannerMessages\` |
| Engine-interpreter subagent | light | inside \`investigate_position\` tool | \`investigate-position.ts\` |
| Progress summarizer | light | worker, at session end | \`progress-summarizer.ts\`: \`buildSummarizerMessages\` |
| Onboarding profiler | light | api, once at onboarding | \`onboarding-profiler.ts\`: \`buildOnboardingProfilerMessages\` |
| Puzzle-session coach system prompt | standard | every puzzle-session turn | \`puzzle-coach-system.ts\`: \`buildPuzzleCoachSystemPrompt\` |

## 1. Coach agent system prompt

Example rendered for a \`club\`-band student, \`general\` persona, \`analyze\`
mode (\`packages/prompts/src/fixtures.ts\`'s \`baseCoachInput()\`). Every other
persona (\`coach-persona.ts\`) adds a \`## Voice\` block at the very top of
\`staticPart\` and changes nothing else; \`play\` mode swaps the tool list and
session-flow section. See \`coach-system.test.ts\` and
\`coach-system.snapshot.test.ts\` for every variant.

### staticPart (cache-shared across every session in this band/mode/persona)

${fence(coach.staticPart)}

### dynamicPart (this student, this game)

${fence(coach.dynamicPart)}

## 2. Analysis planner

### system

${fence(planner.system)}

### user (example)

${fence(planner.user)}

## 3. Engine-interpreter subagent (investigate_position)

### system

${fence(INVESTIGATE_POSITION_SYSTEM_PROMPT)}

### example call

${fence(investigate)}

## 4. Progress summarizer

### system

${fence(summarizer.system)}

### user (example)

${fence(summarizer.user)}

## 5. Onboarding profiler

### system

${fence(onboarding.system)}

### user (example)

${fence(onboarding.user)}

## 6. Puzzle-session coach system prompt

Example rendered for a 5-puzzle assignment, currently on puzzle 2
(\`packages/prompts/src/fixtures.ts\`'s \`basePuzzleCoachInput()\`) — Task 59.5
(docs/plan.md Phase 59). Unlike prompt 1 above, \`staticPart\` never varies:
there is no band/mode/persona axis for this session type, so every puzzle
session in the product shares one cached copy. \`dynamicPart\` carries the
assignment's \`reason\` and the current puzzle's position and known solution
line — the coach never re-derives or guesses the answer. See
\`puzzle-coach-system.test.ts\` for every case.

### staticPart (cache-shared across every puzzle session)

${fence(puzzleCoach.staticPart)}

### dynamicPart (this assignment, this puzzle)

${fence(puzzleCoach.dynamicPart)}

## 7. Rating-band calibration (\`calibration.ts\`)

| Band | Label | revealDepthPlies | Description |
|---|---|---|---|
${Object.entries(CALIBRATION)
  .map(([band, c]) => `| ${band} | ${c.label} | ${c.revealDepthPlies} | ${c.description.replace(/\|/g, '\\|')} |`)
  .join('\n')}
`;
}

async function main(): Promise<void> {
  const doc = renderDoc();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, doc);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

// Only run when executed directly (`npm run docs:prompts`) — not when
// generate-doc.test.ts imports renderDoc/outputPath to check for drift.
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  await main();
}
