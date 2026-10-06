import type { Snapshot } from '../types'
import type { Reply } from '../hooks/litellm'
import { fetchSnapshot } from '../hooks/litellm'

export const NOW = Date.parse('2026-10-03T12:00:00Z')
export const KEY = 'sk-test-secret-1234567890'
export const HASH = '0123456789abcdef'.repeat(4)
export const BASE = 'https://litellm.test'

export type Init = { method: string; body?: string }
export type Route = Reply | ((url: string, headers: Record<string, string>, init?: Init) => Reply | Promise<Reply>)

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
    total_tokens: tokens,
    prompt_tokens: Math.round(tokens * 0.8),
    completion_tokens: Math.round(tokens * 0.2),
    cache_read_input_tokens: Math.round(tokens * 0.5),
  },
  breakdown: {
    models: {
      'claude-sonnet-4-5': { metrics: { spend: spend * 0.75 } },
      'claude-opus-4-1': { metrics: { spend: spend * 0.25 } },
    },
  },
})

export const standardRoutes = (): Record<string, Route> => ({
  '/key/info': reply(200, keyBody()),
  '/user/info': reply(200, {
    user_id: 'jane',
    user_info: {
      user_id: 'jane',
      user_email: 'jane@acme.test',
      user_role: 'internal_user',
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
  const calls: { url: string; headers: Record<string, string>; method: string; body?: string }[] = []
  const http = async (url: string, headers: Record<string, string>, init?: Init): Promise<Reply> => {
    calls.push({ url, headers, method: init?.method ?? 'GET', ...(init?.body === undefined ? {} : { body: init.body }) })
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? ''
    const route = routes[path]

    if (route === undefined) {
      return reply(404, { detail: 'Not Found' })
    }

    return typeof route === 'function' ? await route(url, headers, init) : route
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
