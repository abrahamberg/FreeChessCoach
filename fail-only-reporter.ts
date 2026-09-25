import type { Reporter, TestModule } from 'vitest/node';

class FailOnlyReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const failed = testModules.filter((module) => module.state() === 'failed');
    if (failed.length === 0) {
      console.log('All tests passed');
      return;
    }
    console.log(`\n${failed.length} test file(s) failed:`);
    for (const module of failed) {
      console.log(`\n  File: ${module.moduleId}`);
      for (const error of module.errors()) console.error(`    ${error.stack ?? error.message}`);
      for (const test of module.children.allTests('failed')) {
        console.log(`  FAIL: ${test.fullName}`);
        for (const error of test.result().errors ?? []) console.error(`    ${error.stack ?? error.message}`);
      }
    }
    process.exitCode = 1;
  }
}

export default FailOnlyReporter;
