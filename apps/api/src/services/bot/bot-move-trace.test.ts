import { describe, expect, it, vi } from 'vitest';
import { createBotMoveTrace, runTraced } from './bot-move-trace.js';

function fakeClock(start = 1000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return { now: () => current, advance: (ms) => (current += ms) };
}

describe('createBotMoveTrace', () => {
  it('starts as a thinking move with no steps', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 4 });

    expect(trace.snapshot()).toEqual({
      ply: 4,
      source: 'turn',
      status: 'thinking',
      startedAt: 1000,
      endedAt: null,
      path: null,
      picked: null,
      engineMode: null,
      steps: []
    });
  });

  it('records a running step, then closes it with its own duration', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: null });

    const id = trace.begin('Opening book lookup', 'ply 4');
    clock.advance(30);
    expect(trace.snapshot().steps).toEqual([
      { id, label: 'Opening book lookup', detail: 'ply 4', startedAt: 1000, endedAt: null, status: 'running' }
    ]);

    trace.end(id, { detail: 'no book move' });
    expect(trace.snapshot().steps[0]).toMatchObject({ endedAt: 1030, status: 'done', detail: 'no book move' });
  });

  it('keeps overlapping steps in the order they began', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });

    const outer = trace.begin('Engine search');
    clock.advance(5);
    const inner = trace.begin('Main engine call');
    clock.advance(10);
    trace.end(inner);
    trace.end(outer);

    const steps = trace.snapshot().steps;
    expect(steps.map((step) => step.label)).toEqual(['Engine search', 'Main engine call']);
    expect(steps.map((step) => step.endedAt)).toEqual([1015, 1015]);
  });

  it('run() times an async step and lets the result describe it', async () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });

    const value = await trace.run(
      'Annotating candidates',
      async () => {
        clock.advance(120);
        return 40;
      },
      { describeResult: (count) => `${count} lines` }
    );

    expect(value).toBe(40);
    expect(trace.snapshot().steps[0]).toMatchObject({ status: 'done', endedAt: 1120, detail: '40 lines' });
  });

  it('run() marks the step failed with the error message and rethrows', async () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });

    await expect(
      trace.run('Engine search', async () => {
        clock.advance(8000);
        throw new Error('engine timed out');
      })
    ).rejects.toThrow('engine timed out');

    expect(trace.snapshot().steps[0]).toMatchObject({ status: 'failed', endedAt: 9000, detail: 'engine timed out' });
  });

  it('records the chosen path and completes the move', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'failover', ply: 6 });

    trace.setEngineMode('browser');
    trace.setResult({ path: 'tactics pool — blunder', picked: 'Qxf7' });
    clock.advance(2500);
    trace.complete();

    expect(trace.snapshot()).toMatchObject({
      status: 'done',
      endedAt: 3500,
      path: 'tactics pool — blunder',
      picked: 'Qxf7',
      engineMode: 'browser',
      source: 'failover'
    });
  });

  it('fail() closes any still-running step as failed and records why', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });

    trace.begin('Engine search');
    clock.advance(700);
    trace.fail('every engine attempt failed');

    const snapshot = trace.snapshot();
    expect(snapshot.status).toBe('failed');
    expect(snapshot.endedAt).toBe(1700);
    expect(snapshot.steps[0]).toMatchObject({ status: 'failed', endedAt: 1700 });
    expect(snapshot.steps.at(-1)).toMatchObject({ label: 'Move failed', detail: 'every engine attempt failed', status: 'failed' });
  });

  it('setPly fills in a ply that was not known at the start', () => {
    const trace = createBotMoveTrace({ now: () => 0, source: 'turn', ply: null });
    trace.setPly(9);
    expect(trace.snapshot().ply).toBe(9);
  });

  it('returns a snapshot that later steps do not mutate', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });
    const id = trace.begin('Step');
    const before = trace.snapshot();

    clock.advance(10);
    trace.end(id);

    expect(before.steps[0]?.status).toBe('running');
  });

  it('complete() and fail() only ever settle a move once', () => {
    const clock = fakeClock();
    const trace = createBotMoveTrace({ now: clock.now, source: 'turn', ply: 2 });

    trace.fail('first reason');
    clock.advance(50);
    trace.fail('second reason');
    trace.complete();

    const snapshot = trace.snapshot();
    expect(snapshot.status).toBe('failed');
    expect(snapshot.endedAt).toBe(1000);
    expect(snapshot.steps.filter((step) => step.label === 'Move failed')).toHaveLength(1);
  });
});

describe('createBotMoveTrace onChange', () => {
  it('fires after every kind of change and never for a read', () => {
    const onChange = vi.fn();
    const trace = createBotMoveTrace({ now: () => 0, source: 'turn', ply: null, onChange });

    const step = trace.begin('a');
    trace.end(step);
    trace.setPly(2);
    trace.setEngineMode('external');
    trace.setResult({ path: 'p', picked: 'e5' });
    trace.snapshot();
    trace.complete();

    expect(onChange).toHaveBeenCalledTimes(6);
  });

  it('a settled move does not fire again for a repeated complete or fail', () => {
    const onChange = vi.fn();
    const trace = createBotMoveTrace({ now: () => 0, source: 'turn', ply: null, onChange });

    trace.complete();
    trace.complete();
    trace.fail('late');

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('runTraced', () => {
  it('times the step when there is a trace', async () => {
    const trace = createBotMoveTrace({ now: () => 0, source: 'turn', ply: 2 });
    await expect(runTraced(trace, 'Step', async () => 7)).resolves.toBe(7);
    expect(trace.snapshot().steps).toHaveLength(1);
  });

  it('just runs the function when nothing is being traced', async () => {
    await expect(runTraced(undefined, 'Step', async () => 7)).resolves.toBe(7);
  });
});
