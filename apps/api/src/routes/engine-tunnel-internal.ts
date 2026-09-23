import {
  EngineTunnelPayloadSchema,
  FetchTunnelPayloadSchema,
  LlmTunnelPayloadSchema
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { EngineUnavailableError, ValidationError } from '../lib/errors.js';
import type { EngineTunnelTransport } from '../services/engine/engine-tunnel-transport.js';
import { LlmTunnelError, type LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';

export interface EngineTunnelInternalOptions {
  engineTransport: EngineTunnelTransport;
  llmTransport: LlmTunnelTransport;
  internalToken: string;
}

const RelayBodySchema = z.intersection(
  z.object({
    timeoutMs: z.number().int().positive(),
    priority: z.enum(['interactive', 'background']).optional()
  }),
  z.union([EngineTunnelPayloadSchema, FetchTunnelPayloadSchema, LlmTunnelPayloadSchema])
);

/** Lets the worker process (which never holds a browser WebSocket itself)
 * reach the api process's tunnel — engine, fetch and local-LLM requests
 * alike (relay-engine-tunnel-transport.ts, relay-llm-tunnel-transport.ts).
 * LLM calls go through the api process's LlmTunnelTransport so they share
 * the per-user queue with the api's own calls. Guarded by a shared-secret
 * header for non-browser traffic, bypassing the oauth2-proxy identity
 * headers the browser-facing routes use. */
export function registerEngineTunnelInternalRoutes(app: FastifyInstance, options: EngineTunnelInternalOptions): void {
  app.post<{ Params: { userId: string } }>('/internal/engine-tunnel/:userId', async (request, reply) => {
    if (request.headers['x-internal-token'] !== options.internalToken) {
      return reply.code(401).type('application/problem+json').send({ type: 'about:blank', title: 'Unauthorized', status: 401 });
    }
    const parsed = RelayBodySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid tunnel relay request');

    const { timeoutMs, priority, ...payload } = parsed.data;
    const { userId } = request.params;
    try {
      const result =
        payload.kind === 'llm'
          ? await options.llmTransport.request(userId, payload, { timeoutMs, priority: priority ?? 'background' })
          : await options.engineTransport.request(userId, payload, timeoutMs);
      return { result };
    } catch (error) {
      if (error instanceof EngineUnavailableError || error instanceof LlmTunnelError) {
        return unavailable(reply, error.message);
      }
      throw error;
    }
  });
}

function unavailable(reply: FastifyReply, title: string): FastifyReply {
  return reply.code(503).type('application/problem+json').send({ type: 'about:blank', title, status: 503 });
}
