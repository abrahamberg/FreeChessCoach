import type { Reporter, TaskResult } from 'vitest';

class FailOnlyReporter implements Reporter {
  onFinished(files: TaskResult[]): void {
    const failed = files.filter(f => f.result?.state === 'fail');
    if (failed.length > 0) {
      console.log(`\n${failed.length} test file(s) failed:`);
      for (const file of failed) {
        console.log(`\n  File: ${file.name}`);
        if (file.tasks) {
          for (const task of file.tasks) {
            if (task.result?.state === 'fail') {
              console.log(`  FAIL: ${task.name}`);
              const errors = (task.result as any).errors || (task.result as any).error || [];
              const errArray = Array.isArray(errors) ? errors : [errors];
              for (const err of errArray) {
                if (err) console.error(`    ${err.stack || err.message || err}`);
              }
            }
          }
        }
      }
      process.exitCode = 1;
    } else {
      console.log('All tests passed');
    }
  }
}

export default FailOnlyReporter;