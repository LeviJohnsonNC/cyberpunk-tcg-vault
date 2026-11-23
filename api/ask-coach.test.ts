import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './ask-coach';

const plan = {
  steps: [{ title: 'Roll the d12', why: 'A d12 has an average face of 6.5.' }],
  facts: ['You have 2 Gigs.'],
  continuation: ['Recheck Street Cred after the roll.'],
};

function provider({
  userCount = 1,
  globalCount = 1,
  text = JSON.stringify({ explanation: 'Rolling now adds a Gig.', watchFor: 'Check the new Street Cred.' }),
} = {}) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'player', email: 'play@example.test' });
    if (url.includes('/rpc/bump_ai_usage')) return Response.json(userCount);
    if (url.includes('/rpc/bump_ai_global')) return Response.json(globalCount);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(String(init?.body));
    expect(payload.model).toBe('google/gemini-3.8-flash');
    expect(payload.messages[0].content).toContain('then diverges');
    return Response.json({ choices: [{ message: { content: text } }] });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function ask(body: unknown = plan, token = 'Bearer test') {
  const res = {
    code: 0,
    body: {},
    setHeader: vi.fn(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(value: unknown) {
      this.body = value as object;
      return this;
    },
  };
  await handler(
    { method: 'POST', body, headers: { authorization: token } } as VercelRequest,
    res as unknown as VercelResponse
  );
  return res;
}

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test');
  vi.stubEnv('SUPABASE_URL', 'https://example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  vi.stubEnv('COACH_MODEL', '');
  vi.stubEnv('UNLIMITED_EMAILS', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('sends only the public lesson fields and returns an explanation', async () => {
  const calls = provider();
  const res = await ask({
    ...plan,
    checkpoint: { rivalHand: 'private' },
    steps: [{ ...plan.steps[0], private: 'omit' }],
  });
  expect(res.code).toBe(200);
  expect(res.body).toHaveProperty('watchFor');
  expect(calls).toHaveBeenCalledTimes(4);
  const request = JSON.parse(String(calls.mock.calls.at(-1)?.[1]?.body));
  expect(JSON.parse(request.messages[1].content)).toEqual(plan);
});
it('does not purchase a lesson for an anonymous or oversized request', async () => {
  const calls = provider();
  expect((await ask(plan, '')).code).toBe(401);
  expect((await ask({ ...plan, steps: Array(13).fill(plan.steps[0]) })).code).toBe(400);
  expect(calls).not.toHaveBeenCalled();
});
it.each([{ userCount: 31 }, { globalCount: 151 }])(
  'enforces the daily allowance before contacting Gemini',
  async (quota) => {
    const calls = provider(quota);
    expect((await ask()).code).toBe(429);
    expect(calls.mock.calls.some(([url]) => url.includes('openrouter'))).toBe(false);
  }
);
it('rejects incomplete provider responses', async () => {
  provider({ text: '{"explanation":"partial"}' });
  expect((await ask()).code).toBe(502);
});

it('sends a shared opening to the narrator and rejects an impossible divergence before charging', async () => {
  const calls = provider();
  const line = { ...plan, steps: [
    { title: 'Equip Radioport', why: 'Power goes from 0 to 2.' },
    { title: 'Attack with Ripper', why: 'An unblocked hit can take the only Gig.' },
  ] };
  const alternative = { afterStep: 1, title: 'Equip Faceplate before attacking', why: 'The second purchase spends the remaining 2 €$.' };
  expect((await ask({ ...line, alternative: { ...alternative, afterStep: 2 } })).code).toBe(400);
  expect(calls).not.toHaveBeenCalled();
  expect((await ask({ ...line, alternative: { ...alternative, hidden: 'omit' } })).code).toBe(200);
  const request = JSON.parse(String(calls.mock.calls.at(-1)?.[1]?.body));
  expect(JSON.parse(request.messages[1].content)).toEqual({ ...line, alternative });
  expect(calls.mock.calls.filter(([url]) => url.includes('openrouter'))).toHaveLength(1);
});
