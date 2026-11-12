import { PublicReviewEngineResponseSchema, type EngineEval } from '@freechesscoach/shared';

/** The server would not or could not search: its free allowance is used up,
 * it is busy, or the request failed. The review goes on on the device. */
export class ServerEngineUnavailableError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? 'The server engine could not be reached.' : `The server engine answered ${status}.`);
  }
}

const SERVER_ENGINE_PATH = '/api/public/review-engine';

/** Positions searched by the server for a visitor with no account. Plain
 * fetch, not the api client: a refusal here is expected and handled by the
 * page, so it must not show the app's rate-limit notice. */
export async function analyzeOnServer(fens: string[], multiPv: number, fetcher: typeof fetch = fetch): Promise<EngineEval[]> {
  let response: Response;
  try {
    response = await fetcher(SERVER_ENGINE_PATH, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fens, multiPv })
    });
  } catch {
    throw new ServerEngineUnavailableError(null);
  }
  if (!response.ok) throw new ServerEngineUnavailableError(response.status);
  const parsed = PublicReviewEngineResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.evals.length !== fens.length) throw new ServerEngineUnavailableError(response.status);
  return parsed.data.evals.map((evaluation, ply) => ({ ...evaluation, ply }));
}
