import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LICHESS_EVAL_MAGIC } from '@freechesscoach/chess-analysis/lichess-eval-index-format';
import { noopJobQueue } from './jobs/queue.js';
import {
  buildCoachAgentBaseDependencies,
  buildGatewayConfigFromEnv,
  buildModelTuningFromEnv,
  buildResolveEngineBackendOptions,
  buildTtsConfigFromEnv,
  openLichessEvalIndexFromEnv,
  requireEnv
} from './bootstrap.js';

const REQUIRED_ENV = {
  LLM_STANDARD_MODEL_ANTHROPIC: 'claude-standard',
  LLM_STANDARD_MODEL_OPENAI: 'gpt-standard',
  LLM_LIGHT_MODEL_ANTHROPIC: 'claude-light',
  LLM_LIGHT_MODEL_OPENAI: 'gpt-light'
};

describe('requireEnv', () => {
  const ORIGINAL = process.env.SOME_TEST_VAR;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SOME_TEST_VAR;
    else process.env.SOME_TEST_VAR = ORIGINAL;
  });

  test('returns the value when set', () => {
    process.env.SOME_TEST_VAR = 'hello';
    expect(requireEnv('SOME_TEST_VAR')).toBe('hello');
  });

  test('throws a descriptive error when missing', () => {
    delete process.env.SOME_TEST_VAR;
    expect(() => requireEnv('SOME_TEST_VAR')).toThrow(/SOME_TEST_VAR/);
  });
});

describe('buildGatewayConfigFromEnv', () => {
  beforeEach(() => {
    Object.assign(process.env, REQUIRED_ENV);
  });
  afterEach(() => {
    for (const key of Object.keys(REQUIRED_ENV)) delete process.env[key];
  });

  test('reads model ids from the environment', () => {
    const keyVault = { encrypt: vi.fn(), decrypt: vi.fn() };

    const config = buildGatewayConfigFromEnv(keyVault);

    expect(config.keyVault).toBe(keyVault);
    expect(config.modelIds).toEqual({
      standard: { anthropic: 'claude-standard', openai: 'gpt-standard' },
      light: { anthropic: 'claude-light', openai: 'gpt-light' }
    });
  });

  test('throws when a required model id env var is missing', () => {
    delete process.env.LLM_LIGHT_MODEL_ANTHROPIC;
    const keyVault = { encrypt: vi.fn(), decrypt: vi.fn() };
    expect(() => buildGatewayConfigFromEnv(keyVault)).toThrow(/LLM_LIGHT_MODEL_ANTHROPIC/);
  });

  test('fake is false by default, true when LLM_FAKE=1', () => {
    const keyVault = { encrypt: vi.fn(), decrypt: vi.fn() };
    expect(buildGatewayConfigFromEnv(keyVault).fake).toBe(false);

    process.env.LLM_FAKE = '1';
    expect(buildGatewayConfigFromEnv(keyVault).fake).toBe(true);
    delete process.env.LLM_FAKE;
  });
});

describe('buildTtsConfigFromEnv', () => {
  const TTS_ENV_KEYS = ['TTS_MODEL_OPENAI'] as const;
  const ORIGINAL = Object.fromEntries(TTS_ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of TTS_ENV_KEYS) {
      const original = ORIGINAL[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  test('builds a TtsConfig defaulting the model id to gpt-4o-mini-tts', () => {
    for (const key of TTS_ENV_KEYS) delete process.env[key];

    expect(buildTtsConfigFromEnv()).toEqual({ modelId: 'gpt-4o-mini-tts' });
  });

  test('honors TTS_MODEL_OPENAI when set', () => {
    for (const key of TTS_ENV_KEYS) delete process.env[key];
    process.env.TTS_MODEL_OPENAI = 'tts-1-hd';

    expect(buildTtsConfigFromEnv()).toEqual({ modelId: 'tts-1-hd' });
  });
});

describe('buildCoachAgentBaseDependencies', () => {
  function gatewayConfig() {
    return {
      keyVault: { encrypt: vi.fn(), decrypt: vi.fn() },
      modelIds: {
        standard: { anthropic: 'claude-standard', openai: 'gpt-standard' },
        light: { anthropic: 'claude-light', openai: 'gpt-light' }
      }
    };
  }

  test('returns db, jobQueue, and gatewayConfig', () => {
    const config = { ...gatewayConfig(), fake: true } as never;
    const deps = buildCoachAgentBaseDependencies({} as never, noopJobQueue, config);
    expect(deps.gatewayConfig).toBe(config);
    expect(deps.jobQueue).toBe(noopJobQueue);
  });
});

describe('buildModelTuningFromEnv', () => {
  const TUNING_VARS = [
    'LLM_REASONING_STANDARD',
    'LLM_REASONING_LIGHT',
    'LLM_OPENAI_SERVICE_TIER',
    'LLM_STREAM_FIRST_CHUNK_TIMEOUT_MS',
    'LLM_STREAM_CHUNK_TIMEOUT_MS'
  ];

  beforeEach(() => {
    for (const key of TUNING_VARS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of TUNING_VARS) delete process.env[key];
  });

  test('with nothing set, reasons on the coach tier only and leaves flex off', () => {
    const tuning = buildModelTuningFromEnv();

    expect(tuning.reasoning).toEqual({ standard: 'medium', light: 'none' });
    expect(tuning.openaiServiceTier).toBe('auto');
    expect(tuning.streamTimeouts.firstChunkMs).toBeGreaterThan(0);
  });

  test('reads reasoning effort per tier', () => {
    process.env.LLM_REASONING_STANDARD = 'high';
    process.env.LLM_REASONING_LIGHT = 'low';

    expect(buildModelTuningFromEnv().reasoning).toEqual({ standard: 'high', light: 'low' });
  });

  test('reads the OpenAI service tier, which is how flex gets switched on', () => {
    process.env.LLM_OPENAI_SERVICE_TIER = 'flex';

    expect(buildModelTuningFromEnv().openaiServiceTier).toBe('flex');
  });

  test('reads stream timeouts', () => {
    process.env.LLM_STREAM_FIRST_CHUNK_TIMEOUT_MS = '5000';
    process.env.LLM_STREAM_CHUNK_TIMEOUT_MS = '2500';

    expect(buildModelTuningFromEnv().streamTimeouts).toEqual({ firstChunkMs: 5000, chunkMs: 2500 });
  });

  // A typo here would otherwise surface as an opaque provider 400 on the first
  // real turn, long after the deploy that caused it.
  test.each([
    ['LLM_REASONING_STANDARD', 'aggressive'],
    ['LLM_REASONING_LIGHT', 'off'],
    ['LLM_OPENAI_SERVICE_TIER', 'cheap'],
    ['LLM_STREAM_CHUNK_TIMEOUT_MS', 'soon'],
    ['LLM_STREAM_CHUNK_TIMEOUT_MS', '-1']
  ])('rejects an invalid %s at boot rather than at the provider', (name, value) => {
    process.env[name] = value;

    expect(() => buildModelTuningFromEnv()).toThrow(name);
  });
});

describe('buildResolveEngineBackendOptions', () => {
  afterEach(() => {
    delete process.env.ENGINE_TUNNEL_TIMEOUT_MS;
    delete process.env.CHESS_API_TIMEOUT_MS;
    delete process.env.CHESS_API_REQUEST_DELAY_MS;
    delete process.env.LICHESS_EVAL_MIN_DEPTH;
  });

  test('defaults tunnelTimeoutMs to 10000', () => {
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.tunnelTimeoutMs).toBe(10000);
  });

  test('reads ENGINE_TUNNEL_TIMEOUT_MS when set', () => {
    process.env.ENGINE_TUNNEL_TIMEOUT_MS = '5000';
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.tunnelTimeoutMs).toBe(5000);
  });

  test('defaults chessApiTimeoutMs to 15000', () => {
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.chessApiTimeoutMs).toBe(15000);
  });

  test('reads CHESS_API_TIMEOUT_MS when set', () => {
    process.env.CHESS_API_TIMEOUT_MS = '20000';
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.chessApiTimeoutMs).toBe(20000);
  });

  test('defaults chessApiRequestDelayMs to 100', () => {
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.chessApiRequestDelayMs).toBe(100);
  });

  test('reads CHESS_API_REQUEST_DELAY_MS when set', () => {
    process.env.CHESS_API_REQUEST_DELAY_MS = '250';
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.chessApiRequestDelayMs).toBe(250);
  });

  test('defaults lichessEvalMinDepth to ENGINE_DEFAULT_DEPTH and passes the given index through as-is', () => {
    const fakeIndex = { lookup: vi.fn() } as never;
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, fakeIndex);
    expect(options.lichessEvalMinDepth).toBe(16);
    expect(options.lichessEvalIndex).toBe(fakeIndex);
  });

  test('is null by default and reads LICHESS_EVAL_MIN_DEPTH when set', () => {
    process.env.LICHESS_EVAL_MIN_DEPTH = '20';
    const options = buildResolveEngineBackendOptions({} as never, 'http://engine:4001', { request: vi.fn() }, null);
    expect(options.lichessEvalIndex).toBeNull();
    expect(options.lichessEvalMinDepth).toBe(20);
  });
});

describe('openLichessEvalIndexFromEnv', () => {
  afterEach(() => {
    delete process.env.LICHESS_EVAL_INDEX_PATH;
  });

  test('returns null when LICHESS_EVAL_INDEX_PATH is unset', async () => {
    delete process.env.LICHESS_EVAL_INDEX_PATH;
    await expect(openLichessEvalIndexFromEnv()).resolves.toBeNull();
  });

  test('returns null and warns when LICHESS_EVAL_INDEX_PATH points at a missing file (PVC not populated yet)', async () => {
    process.env.LICHESS_EVAL_INDEX_PATH = '/nonexistent/lichess-eval-index.bin';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(openLichessEvalIndexFromEnv()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/nonexistent/lichess-eval-index.bin'));
    warn.mockRestore();
  });

  test('returns null and warns when LICHESS_EVAL_INDEX_PATH points at a stale v1-format file (no v2 magic header)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bootstrap-lichess-eval-index-test-'));
    const filePath = join(dir, 'lichess-eval-index.bin');
    // A v1 record's first bytes are a sha256-derived key, not the v2 magic —
    // an all-zero buffer of any length demonstrates the same "no valid
    // header" detection without needing a real v1 record.
    await writeFile(filePath, Buffer.alloc(26));
    process.env.LICHESS_EVAL_INDEX_PATH = filePath;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(openLichessEvalIndexFromEnv()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(filePath));
    warn.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  test('throws when LICHESS_EVAL_INDEX_PATH points at a file with a valid header but a corrupt (wrong-size) body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bootstrap-lichess-eval-index-test-'));
    const filePath = join(dir, 'lichess-eval-index.bin');
    await writeFile(filePath, Buffer.concat([LICHESS_EVAL_MAGIC, Buffer.alloc(10)]));
    process.env.LICHESS_EVAL_INDEX_PATH = filePath;
    await expect(openLichessEvalIndexFromEnv()).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});
