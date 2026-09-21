import type { Reporter, TestCase, TaskResultPack, TaskResult } from 'vitest';

class FailOnlyReporter implements Reporter {
  private hasFailures = false;

  onTaskUpdate(tasks: TaskResultPack[]): void {
    for (const task of tasks) {
      if (task.type === 'test' && task.result?.state === 'fail') {
        this.hasFailures = true;
        console.log(`FAIL: ${task.name} (${task.file?.name})`);
        if (task.result.errors) {
          for (const err of task.result.errors) {
            console.error(err.stack || err.message);
          }
        }
      }
    }
  }

  onFinished(files: TaskResult[]): void {
    const failed = files.filter(f => f.result?.state === 'fail');
    if (failed.length > 0) {
      console.log(`\n${failed.length} test file(s) failed`);
      process.exitCode = 1;
    } else {
      console.log('All tests passed');
    }
  }
}

export default FailOnlyReporter;