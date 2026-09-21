import type { TaskList } from 'graphile-worker';
import { createAnalyzeGameTask, type AnalyzeGameTaskOptions } from './analyze-game.js';
import { createBackfillGameMetadataTask, type BackfillGameMetadataTaskOptions } from './backfill-game-metadata.js';
import { createDeepenAnalysisTask } from './deepen-analysis.js';
import { createRebuildDiagnosticProfileTask, type RebuildDiagnosticProfileTaskOptions } from './rebuild-diagnostic-profile.js';
import { createSummarizeSessionTask, type SummarizeSessionTaskOptions } from './summarize-session.js';

export type TaskListOptions = AnalyzeGameTaskOptions &
  BackfillGameMetadataTaskOptions &
  RebuildDiagnosticProfileTaskOptions &
  SummarizeSessionTaskOptions;

export function createTaskList(options: TaskListOptions): TaskList {
  return {
    'analyze-game': createAnalyzeGameTask(options),
    'backfill-game-metadata': createBackfillGameMetadataTask(options),
    'deepen-analysis': createDeepenAnalysisTask(options),
    'rebuild-diagnostic-profile': createRebuildDiagnosticProfileTask(options),
    'summarize-session': createSummarizeSessionTask(options)
  };
}

export * from './analyze-game.js';
export * from './backfill-game-metadata.js';
export * from './deepen-analysis.js';
export * from './queue.js';
export * from './rebuild-diagnostic-profile.js';
export * from './summarize-session.js';