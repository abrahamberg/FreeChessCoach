/**
 * The content studio's tools (`../chess-content-studio`): research a
 * position, read the app's own facts for a PGN before it is a course, then
 * make the course and fill it through the api with no AI call. Every command
 * calls the app's code, so what the review audit improves, these print.
 *
 *   npm run course:studio -w apps/api -- explore [--fen <fen>] [--moves "e4 e5"] [--replies] [--depth 18] [--lines 5]
 *   npm run course:studio -w apps/api -- dossier <intake.json>
 *   npm run course:studio -w apps/api -- create <intake.json> [--gaps-read]
 *   npm run course:studio -w apps/api -- pull <id> | push <id> | check <id> | script <id>   [--file <course.json>]
 *   npm run course:studio -w apps/api -- export <id> <intake.json>
 *
 * `explore`: the board, who attacks what, the engine's lines; `--replies`
 * adds every reply with the engine's answer. `dossier`: the playbook and the
 * facts per episode that the app's writer would get, then the GAPS (replies
 * the PGN has no line for). `create` refuses while there are gaps unless
 * `--gaps-read`: the tree cannot change afterwards. `pull`/`push` move the
 * draft between the api and `<slug>.course.json`; `check` is the publish
 * check (exit 1 on a problem); `script` prints the draft to read; `export`
 * writes `<slug>.import.js` to run in the production tab.
 *
 * An intake file is the create request: { pgn, kind, direction, rating,
 * learnerSide, coachPersona, videos, series, tags }. A `lesson` or `tactics`
 * pgn of several games (up to 6), each with its [FEN], is several examples;
 * `@noeval` on an example's first move says no engine verdict about it. Relative paths are from where npm was
 * started. The engine and the api are the dev stack's (--engine-url, default
 * http://localhost:8081; --api, default http://localhost:3000).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CreateCourseRequestSchema } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import type { CourseIntake } from '../../src/services/courses/course-drafts.js';
import { NativeEngineBackend } from '../../src/services/engine/native-engine-backend.js';
import { GoldenEngineCache } from '../golden-engine-cache.js';
import { checkCourse, CourseApi, courseScript, createCourse, importSnippet, pushCourse, readCourseFile, writeCourseFile } from './api.js';
import { courseFacts, printFacts } from './dossier.js';
import { explore } from './explore.js';

const ENGINE_CACHE_PATH = new URL('../../.course-studio-cache.json', import.meta.url).pathname;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    fen: { type: 'string' },
    moves: { type: 'string' },
    depth: { type: 'string' },
    lines: { type: 'string' },
    replies: { type: 'boolean' },
    'gaps-read': { type: 'boolean' },
    file: { type: 'string' },
    'engine-url': { type: 'string' },
    api: { type: 'string' }
  }
});

/** npm runs a workspace script from the workspace; paths are the caller's. */
const path = (given: string): string => resolve(process.env.INIT_CWD ?? process.cwd(), given);

function readIntake(given: string | undefined): CourseIntake {
  if (!given) throw new Error('give the intake file: { pgn, kind, direction, rating, learnerSide, coachPersona }');
  const parsed = CreateCourseRequestSchema.safeParse(JSON.parse(readFileSync(path(given), 'utf8')));
  if (!parsed.success) throw new Error(`${given} is not a course intake:\n${parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

async function main(): Promise<void> {
  const [command, first, second] = positionals;
  const engineUrl = values['engine-url'] ?? 'http://localhost:8081';
  const engine = new GoldenEngineCache(new NativeEngineBackend(engineUrl), ENGINE_CACHE_PATH);
  const api = new CourseApi(values.api ?? 'http://localhost:3000');
  const id = (): string => {
    if (!first) throw new Error(`${command} needs the course id`);
    return first;
  };
  const courseFile = async (): Promise<string> => path(values.file ?? `${(await api.get(id())).slug}.course.json`);

  switch (command) {
    case 'explore':
      console.log(await explore({ engine, engineUrl, fen: values.fen ?? new Chess().fen(), moves: values.moves?.split(/\s+/).filter(Boolean) ?? [], depth: Number(values.depth ?? 18), lines: Number(values.lines ?? 5), replies: values.replies ?? false }));
      break;
    case 'dossier': {
      const { inputs, gaps } = await courseFacts(readIntake(first), engine, engineUrl);
      printFacts(inputs, gaps);
      break;
    }
    case 'create': {
      const intake = readIntake(first);
      const { gaps } = await courseFacts(intake, engine, engineUrl);
      if (gaps.length && !values['gaps-read']) throw new Error(`the PGN leaves moves unanswered, and the tree cannot change once the course exists. Add them, or pass --gaps-read:\n${gaps.join('\n')}`);
      const course = await createCourse(api, intake);
      const file = path(values.file ?? `${course.slug}.course.json`);
      writeCourseFile(file, course.document);
      console.log(`created ${course.id} (${course.slug})\nstudio: http://localhost:5173/studio/${course.id}/edit\ndraft: ${file}`);
      break;
    }
    case 'pull': {
      const file = await courseFile();
      writeCourseFile(file, (await api.get(id())).document);
      console.log(`wrote ${file}`);
      break;
    }
    case 'push': {
      const file = await courseFile();
      await pushCourse(api, id(), readCourseFile(file));
      console.log(`saved ${file} to ${id()}`);
      break;
    }
    case 'check': {
      const problems = await checkCourse(api, id());
      console.log(problems.length ? problems.join('\n') : 'no problems');
      if (problems.length) process.exitCode = 1;
      break;
    }
    case 'script':
      console.log(courseScript((await api.get(id())).document));
      break;
    case 'export': {
      const course = await api.get(id());
      const file = path(values.file ?? `${course.slug}.import.js`);
      writeFileSync(file, importSnippet(readIntake(second), course.document));
      console.log(`wrote ${file}: run its one expression in the signed-in freechesscoach.org tab; it returns the new id and the checks`);
      break;
    }
    default:
      throw new Error('commands: explore, dossier, create, pull, push, check, script, export');
  }
  engine.save();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
