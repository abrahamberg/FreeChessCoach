import { APICallError } from 'ai';
import { describe, expect, test } from 'vitest';
import { classifyLlmError } from './provider-error.js';

function apiCallError(statusCode: number, responseBody: string): APICallError {
  return new APICallError({
    message: 'API call failed',
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: {},
    statusCode,
    responseBody
  });
}

describe('classifyLlmError', () => {
  test('an OpenAI enforced spend limit (429, quota body) classifies as spend_limit', () => {
    const error = apiCallError(
      429,
      JSON.stringify({ error: { message: 'Your project has reached its configured enforced spend limit.', code: 'insufficient_quota' } })
    );
    expect(classifyLlmError(error).kind).toBe('spend_limit');
  });

  test('a 401 with an invalid API key message classifies as auth', () => {
    const error = apiCallError(401, JSON.stringify({ error: { message: 'Incorrect API key provided.' } }));
    expect(classifyLlmError(error).kind).toBe('auth');
  });

  test('a plain 429 with no quota wording classifies as rate_limit, not spend_limit', () => {
    const error = apiCallError(429, JSON.stringify({ error: { message: 'Rate limit reached for requests.' } }));
    expect(classifyLlmError(error).kind).toBe('rate_limit');
  });

  test('a context-length-exceeded body classifies as context_length', () => {
    const error = apiCallError(400, JSON.stringify({ error: { message: "This model's maximum context length is 128000 tokens." } }));
    expect(classifyLlmError(error).kind).toBe('context_length');
  });

  test('a 503 classifies as overloaded', () => {
    const error = apiCallError(503, JSON.stringify({ error: { message: 'The server is overloaded.' } }));
    expect(classifyLlmError(error).kind).toBe('overloaded');
  });

  test('an unrecognized error falls back to unknown with the generic message', () => {
    const error = new Error('something bizarre');
    const classified = classifyLlmError(error);
    expect(classified.kind).toBe('unknown');
    expect(classified.userMessage).toBe('Something went wrong generating a reply. Try sending your message again.');
  });
});
