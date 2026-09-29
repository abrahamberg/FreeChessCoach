/**
 * docs/courses.md §7, quality harness: runs the course pipeline (engine
 * dossier → outline → episodes → verifier → repair) on the golden set in
 * `test/fixtures/courses/` with the owner's own model, prints every episode,
 * the verifier's result and the call count, and writes nothing anywhere.
 * Prompt changes are judged on this output before they ship.
 *
 * The model, either:
 *   --email <owner>  with UNLOCK_PHRASE set: the owner's saved AI setup, read
 *                    (never written) from DATABASE_URL (default: local docker)
 *   or GOLDEN_PROTOCOL (anthropic | openai-responses | openai-chat),
 *      GOLDEN_MODEL, GOLDEN_API_KEY and optionally GOLDEN_ENDPOINT (default:
 *      the provider's public API).
 * The engine: --engine-url (default http://localhost:8081, the dev stack's).
 * `--only` takes a kind ("trap") or one course ("trap-englund"). `--facts`
 * needs no model: it prints the facts each episode's call would get.
 *
 *   UNLOCK_PHRASE=… npm run course:golden -w apps/api -- --email you@example.com [--only trap] [--json out.json]
 *   npm run course:golden -w apps/api -- --facts [--only trap]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { StoredLlmSetupSchema, type StoredLlmSetup } from '@freechesscoach/shared';
import { loadGoldenSet, type GoldenCourse } from '../test/fixtures/courses/golden-set.js';
import { createDb } from '../src/db/index.js';
import * as llmSetupsRepo from '../src/db/repositories/llm-setups.js';
import * as usersRepo from '../src/db/repositories/users.js';
import { createUserSetupVault } from '../src/llm/key-vault.js';
import { resolutionForSetup, type ModelResolution } from '../src/llm/gateway.js';
import { generateStructured } from '../src/llm/text.js';
import { buildCourseDossierFromEngine } from '../src/services/course-dossier.js';
import { draftFromIntake } from '../src/services/courses.js';
import { writeEpisode, type WrittenEpisode } from '../src/services/courses/generate-episode.js';
import { documentFromOutline, planOutline } from '../src/services/courses/generate-outline.js';
import { writeReel } from '../src/services/courses/generate-reel.js';
import { courseTreeOf, generationInputs, type CourseModelCall, type GenerationInputs } from '../src/services/courses/generation-inputs.js';
import { NativeEngineBackend } from '../src/services/engine/native-engine-backend.js';
import { printCourseFacts } from './course-golden-facts.js';
import { printCourseRun, type CourseRun } from './course-golden-print.js';

const DEFAULT_DATABASE_URL = 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';

async function ownerSetup(email: string): Promise<StoredLlmSetup> {
  const phrase = process.env.UNLOCK_PHRASE;
  if (!phrase) throw new Error('Set UNLOCK_PHRASE to unlock the saved AI setup');
  const db = createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  try {
    const user = await usersRepo.findByEmail(db, email);
    if (!user) throw new Error(`No user with email ${email}`);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    if (!row) throw new Error(`${email} has no saved AI setup`);
    return await createUserSetupVault().decrypt({ ciphertext: row.setupCiphertext, iv: row.setupIv, salt: row.setupSalt }, phrase);
  } finally {
    await db.destroy();
  }
}

function envSetup(): StoredLlmSetup {
  const { GOLDEN_PROTOCOL, GOLDEN_MODEL, GOLDEN_API_KEY, GOLDEN_ENDPOINT } = process.env;
  if (!GOLDEN_PROTOCOL || !GOLDEN_MODEL || !GOLDEN_API_KEY) throw new Error('Pass --email, or set GOLDEN_PROTOCOL, GOLDEN_MODEL and GOLDEN_API_KEY');
  const endpoint = GOLDEN_ENDPOINT ?? (GOLDEN_PROTOCOL === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1');
  return StoredLlmSetupSchema.parse({ protocol: GOLDEN_PROTOCOL, highModel: GOLDEN_MODEL, apiKey: GOLDEN_API_KEY, endpoint });
}

/** The draft and its engine dossier, as a run starts from them. */
async function courseInputs(course: GoldenCourse, engineUrl: string): Promise<GenerationInputs> {
  const document = draftFromIntake(course.intake);
  const { dossier } = await buildCourseDossierFromEngine(courseTreeOf(document), document.learnerSide, new NativeEngineBackend(engineUrl), document.kind).catch((error: unknown) => {
    throw new Error(`the engine at ${engineUrl} failed (${error instanceof Error ? error.message : String(error)}); is the dev stack up?`);
  });
  return generationInputs({ document, dossier, direction: course.intake.direction, sourcePgn: course.intake.pgn });
}

/** One golden course, start to finish, in memory. */
async function runCourse(course: GoldenCourse, resolution: ModelResolution, engineUrl: string): Promise<CourseRun> {
  const started = Date.now();
  const inputs = await courseInputs(course, engineUrl);
  const { document } = inputs;
  const engineMs = Date.now() - started;

  const calls = { outline: 0, episodes: 0, reel: 0, repairs: 0 };
  const call: CourseModelCall = async (messages, schema, label) => {
    const kind = label.repair ? 'repairs' : label.step === 'episode' ? 'episodes' : label.step;
    calls[kind]++;
    const callStarted = Date.now();
    const result = await generateStructured({ resolution, system: messages.system, prompt: messages.user, schema });
    // Progress on stderr: a slow local model otherwise looks hung.
    console.error(`  ${course.name}: ${kind} call ${calls[kind]} took ${Math.round((Date.now() - callStarted) / 1000)}s`);
    return result.object;
  };

  const planned = await planOutline(inputs, call);
  const episodes: WrittenEpisode[] = [];
  for (const episode of planned.outline.chapters.flatMap((chapter) => chapter.episodes)) {
    episodes.push(await writeEpisode(inputs, planned.outline, episode.id, call));
  }
  const framed = documentFromOutline(inputs, planned.outline);
  const written = { ...framed, episodes: episodes.map((each) => each.episode) };
  const reel = written.reel ? await writeReel(inputs, written, written.reel, call) : null;
  return { name: course.name, intake: course.intake, document, outline: planned.outline, outlineWarnings: planned.warnings, episodes, reel, calls, engineMs, totalMs: Date.now() - started };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, only: { type: 'string' }, json: { type: 'string' }, 'engine-url': { type: 'string' }, facts: { type: 'boolean' } } });
  const engineUrl = values['engine-url'] ?? 'http://localhost:8081';
  const courses = loadGoldenSet().filter((candidate) => !values.only || candidate.kind === values.only || candidate.name === values.only);
  if (values.facts) {
    for (const course of courses) printCourseFacts(course.name, await courseInputs(course, engineUrl));
    return;
  }
  const setup = values.email ? await ownerSetup(values.email) : envSetup();
  if (setup.protocol === 'local') throw new Error('A local model is reached through the browser; use a cloud setup for the golden set');
  const resolution = resolutionForSetup({}, setup, 'standard', 'course-golden');
  console.log(`Model: ${resolution.modelId} (${resolution.provider}), engine: ${engineUrl}\n`);

  const runs: CourseRun[] = [];
  for (const course of courses) {
    try {
      const run = await runCourse(course, resolution, engineUrl);
      printCourseRun(run);
      runs.push(run);
    } catch (error) {
      console.log(`=== ${course.name}: FAILED — ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  const warnings = runs.reduce((sum, run) => sum + run.outlineWarnings.length + run.episodes.reduce((count, episode) => count + episode.warnings.length, 0), 0);
  const calls = runs.reduce((sum, run) => sum + run.calls.outline + run.calls.episodes + run.calls.reel + run.calls.repairs, 0);
  console.log(`SUMMARY: ${runs.length} courses, ${calls} model calls, ${warnings} warnings left after repair`);
  if (values.json) writeFileSync(values.json, JSON.stringify(runs, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
