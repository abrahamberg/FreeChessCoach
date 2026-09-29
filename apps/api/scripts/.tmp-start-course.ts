import { createDb } from '../src/db/index.js';
import * as coursesRepo from '../src/db/repositories/courses.js';
import { createGraphileJobQueue } from '../src/jobs/queue.js';
import { startCourseGeneration } from '../src/services/course-generate.js';

const url = process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';
const db = createDb(url);
const queue = await createGraphileJobQueue(url);
for (const id of process.argv.slice(2)) {
  const row = await coursesRepo.findById(db, id);
  await startCourseGeneration(db, queue.queue, row!.ownerId, id, true);
}
await queue.close();
await db.destroy();
console.log('started');
