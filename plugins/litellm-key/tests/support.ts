import { expect } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { utcDay } from '../hooks/format'
import { fetchSnapshot } from '../hooks/litellm'
import type { Http, Reply } from '../hooks/litellm'

export const NOW = Date.parse('2026-10-03T12:00:00Z')

/** The test kit has no toBeCloseTo: a number is near another when it is within `tolerance` of it. */
export const near = (received: number | null | undefined, expected: number, tolerance = 1e-6): void => {
  expect(Math.abs((received ?? Number.NaN) - expected) <= tolerance, `${received} is not within ${tolerance} of ${expected}`).toBe(true)
}
export const KEY = 'sk-test-secret-1234567890'
export const HASH = '0123456789abcdef'.repeat(4)
export const BASE = 'https://litellm.test'

export type Route = Reply | ((url: string, headers: Record<string, string>) => Reply | Promise<Reply>)

export const reply = (status: number, body: unknown): Reply => ({
  status,
  text: typeof body === 'string' ? body : JSON.stringify(body),
})

export const keyBody = (info: Record<string, unknown> = {}) => ({
  key: HASH,
  info: {
    key_alias: 'prod-claude',
    key_name: 'sk-...7890',
    spend: 12.5,
    max_budget: 50,
    budget_duration: '30d',
    budget_reset_at: '2026-10-10T00:00:00Z',
    models: [],
    user_id: 'jane',
    team_id: 'eng',
    rpm_limit: 60,
    tpm_limit: 100000,
    max_parallel_requests: 5,
    expires: '2026-11-13T00:00:00Z',
    blocked: null,
    status: 'active',
    ...info,
  },
})

const day = (date: string, spend: number, requests: number, tokens: number) => ({
  date,
  metrics: {
    spend,
    api_requests: requests,
    failed_requests: 0,
    total_tokens: tokens,
    prompt_tokens: Math.round(tokens * 0.8),
    completion_tokens: Math.round(tokens * 0.2),
    cache_read_input_tokens: Math.round(tokens * 0.5),
  },
  breakdown: {
    models: {
      'claude-sonnet-4-5': {
        metrics: {
          spend: spend * 0.75,
          api_requests: Math.round(requests * 0.75),
          total_tokens: Math.round(tokens * 0.75),
        },
      },
      'claude-opus-4-1': {
        metrics: {
          spend: spend * 0.25,
          api_requests: Math.round(requests * 0.25),
          total_tokens: Math.round(tokens * 0.25),
        },
      },
    },
  },
})

type Shares = Record<string, number>

/**
 * A `/user/daily/activity` answer: one day for each value, ending on the day of NOW, oldest first. A day that spent
 * nothing is left out, as the proxy does. The models split a day by `shares` (a function of the day's place, to let it
 * change over time).
 */
export const activity = (
  spends: readonly number[],
  shares: Shares | ((at: number) => Shares) = { 'claude-sonnet-4-5': 0.75, 'claude-opus-4-1': 0.25 },
): Reply =>
  reply(200, {
    results: spends.flatMap((spend, at) => {
      if (!(spend > 0)) {
        return []
      }
      const split = typeof shares === 'function' ? shares(at) : shares
      const requests = Math.round(spend * 10)

      return [
        {
          date: utcDay(NOW, spends.length - 1 - at),
          metrics: {
            spend,
            api_requests: requests,
            failed_requests: 0,
            total_tokens: spend * 1000,
            prompt_tokens: spend * 800,
            completion_tokens: spend * 200,
            cache_read_input_tokens: spend * 500,
          },
          breakdown: {
            models: Object.fromEntries(
              Object.entries(split).map(([model, share]) => [
                model,
                {
                  metrics: {
                    spend: spend * share,
                    api_requests: Math.round(requests * share),
                    total_tokens: spend * 1000 * share,
                  },
                },
              ]),
            ),
          },
        },
      ]
    }),
  })

/** What `/health/readiness` answers on a proxy that has a database. */
export const health = (version = '1.77.0', db = 'connected'): Reply =>
  reply(200, { status: 'healthy', db, cache: null, litellm_version: version, success_callbacks: [] })

export const standardRoutes = (): Record<string, Route> => ({
  '/key/info': reply(200, keyBody()),
  '/user/info': reply(200, {
    user_id: 'jane',
    user_info: {
      user_id: 'jane',
      user_email: 'jane@acme.test',
      spend: 26.1,
      max_budget: 100,
      budget_duration: '30d',
      budget_reset_at: '2026-11-01T00:00:00Z',
    },
    keys: [],
    teams: [],
  }),
  '/team/info': reply(200, {
    team_id: 'eng',
    team_info: {
      team_id: 'eng',
      team_alias: 'eng-platform',
      spend: 412,
      max_budget: 1000,
      budget_duration: '30d',
      budget_reset_at: '2026-10-15T00:00:00Z',
    },
    keys: [],
    team_memberships: [],
  }),
  '/v1/models': reply(200, {
    object: 'list',
    data: [{ id: 'claude-sonnet-4-5' }, { id: 'claude-opus-4-1' }, { id: 'claude-haiku-4-5' }],
  }),
  '/user/daily/activity': reply(200, {
    results: [
      day('2026-09-30', 1.5, 20, 300000),
      day('2026-10-01', 4, 40, 800000),
      day('2026-10-03', 8.7, 90, 1700000),
    ],
    metadata: { total_spend: 14.2 },
  }),
})

export const router = (routes: Record<string, Route>) => {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const http: Http = async (url, headers) => {
    calls.push({ url, headers })
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? ''
    const route = routes[path]

    if (route === undefined) {
      return reply(404, { detail: 'Not Found' })
    }

    return typeof route === 'function' ? await route(url, headers) : route
  }

  return { http, calls }
}

export const snapshotOf = async (routes: Record<string, Route> = standardRoutes()): Promise<Snapshot> => {
  const { http } = router(routes)
  const result = await fetchSnapshot({
    credentials: {
      roots: [BASE],
      host: 'litellm.test',
      key: KEY,
      keySource: 'ANTHROPIC_AUTH_TOKEN',
      headers: { authorization: `Bearer ${KEY}` },
    },
    http,
    now: NOW,
    pinnedRoot: null,
    wantRelated: true,
    wantUsage: true,
    refreshSlow: true,
    previous: null,
  })

  if (!result.ok) {
    throw new Error(result.failure.message)
  }

  return result.snapshot
}

export const withKey = (info: Record<string, unknown>) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody(info)) })
