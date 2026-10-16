import { readFileSync, writeFileSync } from 'node:fs';
import { courseFenBefore, moveLabel, parseCourseTreeOfKind } from '@freechesscoach/chess-analysis';
import { CourseDocumentSchema, videoLine, type CourseDocument, type CourseResponse, type PublishCheckResponse } from '@freechesscoach/shared';
import type { CourseIntake } from '../../src/services/courses/course-drafts.js';
import { publishBlockers } from '../../src/services/courses/publish.js';

/** The app's own routes, as the studio page calls them. On the dev stack
 * (`AUTH_MODE=dev-stub`) a call with no headers is the dev user. */
export class CourseApi {
  constructor(private readonly base: string) {}

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }).catch((error: unknown) => {
      throw new Error(`the api at ${this.base} did not answer (${error instanceof Error ? error.message : String(error)}); is the dev stack up?`);
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get = (id: string): Promise<CourseResponse> => this.call('GET', `/api/courses/${id}`);
}

/** A new course with the template episodes of "Build without AI" and its
 * dossier kept: the draft the studio then fills. */
export async function createCourse(api: CourseApi, intake: CourseIntake): Promise<CourseResponse> {
  const created = await api.call<CourseResponse>('POST', '/api/courses', intake);
  return api.call<CourseResponse>('POST', `/api/courses/${created.id}/skeleton`);
}

export function writeCourseFile(path: string, document: CourseDocument): void {
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}

export function readCourseFile(path: string): CourseDocument {
  const parsed = CourseDocumentSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`${path} is not a course document:\n${parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

export async function pushCourse(api: CourseApi, id: string, document: CourseDocument): Promise<void> {
  await api.call('PUT', `/api/courses/${id}/draft`, { document });
}

/** What Publish would refuse or ask about; empty when the draft is ready. */
export async function checkCourse(api: CourseApi, id: string): Promise<string[]> {
  const [{ problems }, course] = await Promise.all([api.call<PublishCheckResponse>('GET', `/api/courses/${id}/publish-check`), api.get(id)]);
  return [...publishBlockers(course.document), ...problems.map((problem) => `${problem.episodeId} (${problem.episode})${problem.move ? ` ${problem.move}` : ''}: ${problem.message}`)];
}

/** The whole draft as a script to read in one go, in the film's order. */
export function courseScript(document: CourseDocument): string {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const label = (nodeId: string): string => {
    const node = byId.get(nodeId);
    if (!node) return nodeId;
    return `${moveLabel(courseFenBefore(byId, document.startFen, node), node.san, '...')} (${nodeId})`;
  };
  const rows = [`${document.title} — ${document.kind}, ${document.coachPersona}, ${document.levelBand}, learner ${document.learnerSide}`, `Promise: ${document.promise}`, `Takeaways: ${document.takeaways.join(' | ')}`, ''];
  if (document.video) rows.push(`VIDEO "${document.video.title}" [${document.video.thumbnailText}]`, `  hook: ${document.video.hook}`, `  outro: ${document.video.outro}`, '');
  for (const episode of document.episodes) {
    rows.push(`--- ${episode.id} ${episode.role}: ${episode.focus}`);
    for (const ply of episode.plies) {
      rows.push(`  ${label(ply.nodeId)} [${[ply.course ? 'course' : '', ply.video ? 'video' : ''].filter(Boolean).join('+') || 'silent'}]`, `    text: ${ply.text}`);
      if (ply.say?.trim()) rows.push(`    say: ${videoLine(ply)}`);
      if (ply.caption?.trim()) rows.push(`    caption: ${ply.caption}`);
      for (const tempting of ply.tempting ?? []) rows.push(`    tempting ${tempting.san}: ${tempting.why}`);
    }
    if (episode.quiz) rows.push(`  QUIZ at ${label(episode.quiz.answerNodeId)}`, ...(['scene', 'prompt', 'hint', 'reveal'] as const).map((key) => `    ${key}: ${episode.quiz?.[key] ?? ''}`));
    rows.push('');
  }
  const reel = document.reel;
  if (reel) rows.push(`REEL (${reel.style}, ${label(reel.startNodeId)} to ${label(reel.endNodeId)})`, `  hook: ${reel.hook}`, `  top: ${reel.topText}`, ...reel.beats.map((beat) => `  ${label(beat.nodeId)}: ${beat.say} [${beat.caption}]`), `  payoff: ${reel.payoff}`, `  cta: ${reel.cta}`, `  loop: ${reel.loop}`);
  return rows.join('\n');
}

/**
 * A dev course as one expression to run in the signed-in production tab: a
 * script has no identity there, the owner's tab has. It makes the course
 * from the same intake (the same PGN gives the same tree and node ids, and
 * the api refuses the draft otherwise), saves the text, and returns the
 * checks. Nothing is published.
 */
export function importSnippet(intake: CourseIntake, document: CourseDocument): string {
  const tree = parseCourseTreeOfKind(intake.pgn, intake.kind);
  const same = tree.nodes.length === document.nodes.length && tree.nodes.every((node, index) => node.id === document.nodes[index]?.id && node.fenAfter === document.nodes[index]?.fenAfter);
  if (!same) throw new Error("the intake's PGN is not this course's tree: export with the intake file the course was created from");
  const bundle = JSON.stringify({ intake, document: { ...document, clipLinks: {} } });
  return `(async () => {
  const { intake, document } = ${bundle};
  const call = async (method, path, body) => {
    const response = await fetch(path, { method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    const text = await response.text();
    if (!response.ok) throw new Error(method + ' ' + path + ': ' + response.status + ' ' + text);
    return text ? JSON.parse(text) : null;
  };
  const created = await call('POST', '/api/courses', intake);
  const at = '/api/courses/' + created.id;
  await call('POST', at + '/skeleton');
  const level = (await call('GET', at)).document.level;
  await call('PUT', at + '/draft', { document: { ...document, level } });
  return { id: created.id, slug: created.slug, studio: '/studio/' + created.id + '/edit', problems: (await call('GET', at + '/publish-check')).problems };
})()
`;
}
