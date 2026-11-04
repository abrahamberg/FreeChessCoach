/**
 * Records what each golden course's dossier asks the engine, so the golden
 * facts test (`npm run test:golden`) answers from files with no Stockfish.
 * Run it after a change that makes the dossier ask the engine something new.
 *
 *   npm run golden:record -w apps/api [-- --only <kind|name>] [--engine-url http://localhost:8081]
 */
import { parseArgs } from 'node:util';
import { loadGoldenSet } from '../test/fixtures/courses/golden-set.js';
import { goldenDossier } from '../test/golden/golden-dossier.js';
import { NativeEngineBackend } from '../src/services/engine/native-engine-backend.js';
import { EvalRecorder } from './golden-eval-recorder.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { only: { type: 'string' }, 'engine-url': { type: 'string' } } });
  const engine = new NativeEngineBackend(values['engine-url'] ?? 'http://localhost:8081');
  const courses = loadGoldenSet().filter((course) => !values.only || course.kind === values.only || course.name === values.only);
  for (const course of courses) {
    const recorder = new EvalRecorder(engine);
    await goldenDossier(course, recorder);
    const kept = recorder.write(course.name);
    console.log(`${course.name}: recorded${kept === null ? '' : ` (lines cut to ${kept} plies)`}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
