import { describe, expect, test } from 'claude-code/testing'

import {
  candidateRoots,
  date,
  fetchSnapshot,
  parseKey,
  parseModels,
  parseTeam,
  parseUsage,
  parseUser,
  resolveCredentials,
} from '../hooks/litellm'
import type { Credentials, FetchRequest, Sources } from '../hooks/litellm'
import { BASE, HASH, KEY, NOW, keyBody, reply, router, standardRoutes } from './support'

const sources = (patch: Partial<Sources> = {}): Sources => ({
  url: null,
  key: null,
  env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY },
  settingsEnv: {},
  ...patch,
})

const credentials = (patch: Partial<Credentials> = {}): Credentials => ({
  roots: [BASE],
  host: 'litellm.test',
  key: KEY,
  keySource: 'ANTHROPIC_AUTH_TOKEN',
  headers: { authorization: `Bearer ${KEY}` },
  ...patch,
})

const request = (http: FetchRequest['http'], patch: Partial<FetchRequest> = {}): FetchRequest => ({
  credentials: credentials(),
  http,
  now: NOW,
  pinnedRoot: null,
  wantRelated: true,
  wantUsage: true,
  refreshSlow: true,
  previous: null,
  ...patch,
})

describe('resolveCredentials', () => {
  test('uses what Claude Code uses', () => {
    const resolved = resolveCredentials(sources(), NOW)

    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.credentials.key).toBe(KEY)
      expect(resolved.credentials.host).toBe('litellm.test')
      expect(resolved.credentials.keySource).toBe('ANTHROPIC_AUTH_TOKEN')
      expect(resolved.credentials.headers.authorization).toBe(`Bearer ${KEY}`)
    }
  })

  test('falls back to ANTHROPIC_API_KEY and then LITELLM_PROXY_API_KEY', () => {
    const apiKey = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_API_KEY: 'sk-from-api-key' } }), NOW)
    const proxy = resolveCredentials(
      sources({ env: { LITELLM_PROXY_API_BASE: BASE, LITELLM_PROXY_API_KEY: 'sk-from-proxy-var' } }),
      NOW,
    )

    expect(apiKey.ok && apiKey.credentials.keySource).toBe('ANTHROPIC_API_KEY')
    expect(proxy.ok && proxy.credentials.keySource).toBe('LITELLM_PROXY_API_KEY')
  })

  test('reads the settings.json env block when the process has nothing', () => {
    const resolved = resolveCredentials(
      sources({ env: {}, settingsEnv: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: 'sk-from-settings' } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.key).toBe('sk-from-settings')
  })

  test('plugin options win over the environment', () => {
    const resolved = resolveCredentials(
      sources({ url: 'https://other.test/', key: 'sk-from-option' }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.host).toBe('other.test')
    expect(resolved.ok && resolved.credentials.key).toBe('sk-from-option')
    expect(resolved.ok && resolved.credentials.keySource).toBe('plugin option litellm_key')
    expect(resolved.ok && resolved.credentials.roots).toEqual(['https://other.test'])
    expect(resolved.ok && resolved.credentials.headers.authorization).toBe('Bearer sk-from-option')
  })

  test('takes the key from the x-litellm-api-key custom header and sends it there', () => {
    const resolved = resolveCredentials(
      sources({
        env: {
          ANTHROPIC_BASE_URL: `${BASE}/anthropic`,
          ANTHROPIC_CUSTOM_HEADERS: 'x-other: 1\nx-litellm-api-key: Bearer sk-custom-header-key',
        },
      }),
      NOW,
    )

    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.credentials.key).toBe('sk-custom-header-key')
      expect(resolved.credentials.headers['x-litellm-api-key']).toBe('Bearer sk-custom-header-key')
      expect(resolved.credentials.headers.authorization).toBeUndefined()
      expect(resolved.credentials.roots[0]).toBe(BASE)
    }
  })

  test('never sends the keys Claude Code uses to a different host than the one it uses them on', () => {
    const elsewhere = resolveCredentials(sources({ url: 'https://other.test' }), NOW)

    expect(elsewhere.ok).toBe(false)
    expect(!elsewhere.ok && elsewhere.failure.message).toContain('other.test')
    expect(JSON.stringify(elsewhere)).not.toContain(KEY)

    const same = resolveCredentials(sources({ url: `${BASE}/` }), NOW)

    expect(same.ok && same.credentials.key).toBe(KEY)
  })

  test('pairs LITELLM_PROXY_API_BASE only with LITELLM_PROXY_API_KEY, never with the Anthropic key', () => {
    const unpaired = resolveCredentials(
      sources({ env: { LITELLM_PROXY_API_BASE: BASE, ANTHROPIC_API_KEY: 'sk-ant-direct-key-1234' } }),
      NOW,
    )
    const paired = resolveCredentials(
      sources({
        env: { LITELLM_PROXY_API_BASE: BASE, ANTHROPIC_API_KEY: 'sk-ant-direct-key-1234', LITELLM_PROXY_API_KEY: 'sk-litellm-1234567' },
      }),
      NOW,
    )

    expect(unpaired.ok).toBe(false)
    expect(JSON.stringify(unpaired)).not.toContain('sk-ant-direct-key-1234')
    expect(paired.ok && paired.credentials.key).toBe('sk-litellm-1234567')
  })

  test('says what is missing', () => {
    const noUrl = resolveCredentials(sources({ env: { ANTHROPIC_AUTH_TOKEN: KEY } }), NOW)
    const noKey = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: BASE } }), NOW)
    const direct = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com/', ANTHROPIC_API_KEY: 'sk-ant-xyz123456' } }),
      NOW,
    )
    const bad = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: 'litellm.test', ANTHROPIC_AUTH_TOKEN: KEY } }), NOW)

    for (const resolved of [noUrl, noKey, direct, bad]) {
      expect(resolved.ok).toBe(false)
      expect(!resolved.ok && resolved.failure.kind).toBe('not-configured')
    }
    expect(!noKey.ok && noKey.failure.message).toContain('litellm.test')
  })

  test('does not show credentials that sit in the url', () => {
    const resolved = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://user:hunter2@litellm.test:4000/', ANTHROPIC_AUTH_TOKEN: KEY } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.host).toBe('litellm.test:4000')
  })

  test('never puts the key in a failure message', () => {
    const resolved = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: `${KEY}-not-a-url` } }), NOW)

    expect(JSON.stringify(resolved)).not.toContain(KEY)
  })
})

describe('candidateRoots', () => {
  test('strips pass-through routes first', () => {
    expect(candidateRoots(`${BASE}/anthropic`, false)).toEqual([BASE, `${BASE}/anthropic`])
    expect(candidateRoots(`${BASE}/bedrock/v1`, false)).toEqual([BASE, `${BASE}/bedrock/v1`])
    expect(candidateRoots(BASE, false)).toEqual([BASE])
  })

  test('only looks for the pass-through route in the path, never in the host', () => {
    expect(candidateRoots('https://anthropic', false)).toEqual(['https://anthropic'])
    expect(candidateRoots(`${BASE}/litellm/anthropic/v1`, false)).toEqual([
      `${BASE}/litellm`,
      `${BASE}/litellm/anthropic/v1`,
      BASE,
    ])
  })

  test('tries the origin of a prefixed proxy last, and trusts an explicit url', () => {
    expect(candidateRoots(`${BASE}/litellm`, false)).toEqual([`${BASE}/litellm`, BASE])
    expect(candidateRoots(`${BASE}/anthropic`, true)).toEqual([`${BASE}/anthropic`])
  })
})

describe('date', () => {
  test('reads a naive timestamp as UTC, as LiteLLM writes them', () => {
    expect(date('2026-10-10T00:00:00')).toBe(Date.parse('2026-10-10T00:00:00Z'))
    expect(date('2026-10-10 00:00:00')).toBe(Date.parse('2026-10-10T00:00:00Z'))
    expect(date('2026-10-10T00:00:00+02:00')).toBe(Date.parse('2026-10-09T22:00:00Z'))
    expect(date('nope')).toBeNull()
    expect(date(null)).toBeNull()
  })
})

describe('parseKey', () => {
  test('reads the budget, limits and identity', () => {
    const { info } = keyBody()
    const key = parseKey(keyBody(), info, NOW)

    expect(key.alias).toBe('prod-claude')
    expect(key.keyName).toBe('sk-...7890')
    expect(key.keyHash).toBe(HASH)
    expect(key.status).toBe('active')
    expect(key.budget).toEqual({
      spend: 12.5,
      limit: 50,
      softLimit: null,
      duration: '30d',
      resetAt: Date.parse('2026-10-10T00:00:00Z'),
    })
    expect(key.limits).toEqual({ rpm: 60, tpm: 100000, tpd: null, parallel: 5 })
    expect(key.userId).toBe('jane')
    expect(key.teamId).toBe('eng')
    expect(key.expiresAt).toBe(Date.parse('2026-11-13T00:00:00Z'))
  })

  test('falls back to the linked budget table', () => {
    const info = {
      spend: 3,
      litellm_budget_table: {
        max_budget: 10,
        soft_budget: 8,
        budget_duration: '7d',
        rpm_limit: 30,
        model_max_budget: { 'gpt-4': { budget_limit: 2, time_period: '1d' } },
      },
    }
    const key = parseKey({}, info, NOW)

    expect(key.budget.limit).toBe(10)
    expect(key.budget.softLimit).toBe(8)
    expect(key.budget.duration).toBe('7d')
    expect(key.limits.rpm).toBe(30)
    expect(key.modelBudgets).toEqual([{ model: 'gpt-4', spend: 0, limit: 2, period: '1d' }])
  })

  test('derives the status when the proxy does not send one', () => {
    expect(parseKey({}, { blocked: true }, NOW).status).toBe('revoked')
    expect(parseKey({}, { expires: '2026-10-01T00:00:00Z' }, NOW).status).toBe('expired')
    expect(parseKey({}, { expires: '2026-12-01T00:00:00Z' }, NOW).status).toBe('active')
    expect(parseKey({}, {}, NOW).status).toBe('active')
  })

  test('reads concurrent budget windows and per-model usage', () => {
    const key = parseKey(
      {},
      {
        budget_limits: [
          { budget_duration: '1h', max_budget: 1, reset_at: '2026-10-03T13:00:00Z' },
          { budget_duration: '1d', max_budget: 5 },
        ],
        budget_limits_usage: { '1h': { current_spend: 0.25 } },
        model_max_budget: { 'claude-opus-4-1': 5, 'claude-sonnet-4-5': { budget_limit: 20, time_period: '30d' } },
        model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 1.5, budget_limit: 5, time_period: '1d' } },
        model_spend: { 'claude-sonnet-4-5': 7 },
      },
      NOW,
    )

    expect(key.windows).toEqual([
      { duration: '1h', limit: 1, spend: 0.25, resetAt: Date.parse('2026-10-03T13:00:00Z') },
      { duration: '1d', limit: 5, spend: null, resetAt: null },
    ])
    expect(key.modelBudgets).toEqual([
      { model: 'claude-opus-4-1', spend: 1.5, limit: 5, period: '1d' },
      { model: 'claude-sonnet-4-5', spend: 7, limit: 20, period: '30d' },
    ])
  })

  test('survives odd shapes', () => {
    const key = parseKey(
      { key: 'sk-not-a-hash' },
      { spend: 'x', max_budget: '12.5', models: 'oops', budget_limits: 'oops', model_max_budget: [] },
      NOW,
    )

    expect(key.keyHash).toBeNull()
    expect(key.budget.spend).toBe(0)
    expect(key.budget.limit).toBe(12.5)
    expect(key.models).toEqual([])
    expect(key.windows).toEqual([])
    expect(key.modelBudgets).toEqual([])
  })
})

describe('related budgets, models and usage', () => {
  test('user and team are only worth showing with a cap', () => {
    const user = parseUser({ user_id: 'jane', user_info: { user_email: 'j@x.test', spend: 1, max_budget: 5 } })
    const team = parseTeam({ team_id: 'eng', team_info: { team_alias: 'Eng', spend: 9, max_budget: 10 } })

    expect(user?.label).toBe('j@x.test')
    expect(user?.budget.limit).toBe(5)
    expect(team?.label).toBe('Eng')
    expect(parseUser({ user_id: 'u', user_info: { spend: 1 } })).toBeNull()
    expect(parseTeam({ team_id: 't', team_info: { spend: 1 } })).toBeNull()
    expect(parseUser('nope')).toBeNull()
  })

  test('models are unique and sorted', () => {
    expect(parseModels({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { nope: 1 }] })).toEqual(['a', 'b'])
    expect(parseModels({})).toBeNull()
  })

  test('usage fills the quiet days with zero and ranks models', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03']
    const usage = parseUsage(standardUsage(), days)

    expect(usage?.days).toEqual([
      { date: '2026-10-01', spend: 4 },
      { date: '2026-10-02', spend: 0 },
      { date: '2026-10-03', spend: 8.7 },
    ])
    expect(usage?.requests).toBe(130)
    expect(usage?.tokens).toBe(2500000)
    expect(usage?.topModels[0]?.model).toBe('claude-sonnet-4-5')
    expect(parseUsage({}, days)).toBeNull()
  })
})

const standardUsage = () => JSON.parse(String(standardRoutes()['/user/daily/activity'] && (standardRoutes()['/user/daily/activity'] as { text: string }).text))

describe('fetchSnapshot', () => {
  test('reads everything, in the shapes the UI needs', async () => {
    const { http, calls } = router(standardRoutes())
    const result = await fetchSnapshot(request(http))

    expect(result.ok).toBe(true)
    if (result.ok) {
      const { snapshot } = result

      expect(snapshot.key.alias).toBe('prod-claude')
      expect(snapshot.user?.label).toBe('jane@acme.test')
      expect(snapshot.team?.label).toBe('eng-platform')
      expect(snapshot.models).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
      expect(snapshot.usage?.days).toHaveLength(7)
      expect(snapshot.notes).toEqual([])
      expect(snapshot.keyHint).toBe('sk-…7890')
      expect(snapshot.host).toBe('litellm.test')
    }
    expect(calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('never puts the key in a url or in the snapshot', async () => {
    const { http, calls } = router(standardRoutes())
    const result = await fetchSnapshot(request(http))

    expect(calls.some(call => call.url.includes(KEY))).toBe(false)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  test('asks for the usage of this key by its hash, over a 7 day window', async () => {
    const { http, calls } = router(standardRoutes())

    await fetchSnapshot(request(http))
    const usage = calls.find(call => call.url.includes('/user/daily/activity'))

    expect(usage?.url).toContain(`api_key=${HASH}`)
    expect(usage?.url).toContain('user_id=jane')
    expect(usage?.url).toContain('start_date=2026-09-27')
    expect(usage?.url).toContain('end_date=2026-10-03')
  })

  test('skips the slow endpoints and keeps the previous answer between slow refreshes', async () => {
    const first = router(standardRoutes())
    const done = await fetchSnapshot(request(first.http))
    const next = router(standardRoutes())
    const result = await fetchSnapshot(
      request(next.http, { refreshSlow: false, previous: done.ok ? done.snapshot : null }),
    )

    expect(next.calls.map(call => call.url.replace(BASE, '').split('?')[0])).toEqual([
      '/key/info',
      '/user/info',
      '/team/info',
    ])
    expect(result.ok && result.snapshot.models).toEqual(done.ok ? done.snapshot.models : [])
    expect(result.ok && result.snapshot.usage).toEqual(done.ok ? done.snapshot.usage : null)
  })

  test('a failing extra only leaves a note', async () => {
    const { http } = router({ ...standardRoutes(), '/team/info': reply(403, { detail: 'nope' }) })
    const result = await fetchSnapshot(request(http))

    expect(result.ok).toBe(true)
    expect(result.ok && result.snapshot.team).toBeNull()
    expect(result.ok && result.snapshot.notes).toEqual(['team budget unavailable: /team/info answered 403'])
  })

  test('honours the switches', async () => {
    const { http, calls } = router(standardRoutes())

    await fetchSnapshot(request(http, { wantRelated: false, wantUsage: false }))
    expect(calls.map(call => call.url.replace(BASE, ''))).toEqual(['/key/info', '/v1/models'])
  })

  test('a key without a user has no history and no user budget', async () => {
    const { http, calls } = router({ ...standardRoutes(), '/key/info': reply(200, keyBody({ user_id: null })) })
    const result = await fetchSnapshot(request(http))

    expect(result.ok && result.snapshot.usage).toBeNull()
    expect(calls.some(call => call.url.includes('/user/'))).toBe(false)
  })

  test('explains a rejected key without echoing it', async () => {
    const message = `Authentication Error, Invalid proxy server token passed. Received API Key = ${KEY}`
    const { http } = router({
      '/key/info': reply(401, { error: { message, type: 'auth_error', param: 'None', code: '401' } }),
    })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('auth')
    expect(!result.ok && result.failure.status).toBe(401)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  test('explains a key the database does not know (the master key)', async () => {
    const { http } = router({
      '/key/info': reply(404, {
        error: { message: 'Key not found in database', type: 'not_found_error', param: 'key', code: '404' },
      }),
    })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('not-found')
    expect(!result.ok && result.failure.hint).toContain('master key')
  })

  test('explains a proxy without a database', async () => {
    const { http } = router({
      '/key/info': reply(500, { error: { message: 'Database not connected. Connect a database', type: 'None', param: 'None', code: '500' } }),
    })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('db')
  })

  test('moves on from a root that is not LiteLLM and pins the one that is', async () => {
    const calls: string[] = []
    const http = async (url: string) => {
      calls.push(url)
      if (url === `${BASE}/anthropic/key/info`) {
        return reply(404, { type: 'error', error: { type: 'not_found_error', message: 'Not found' } })
      }

      return reply(200, keyBody())
    }
    const result = await fetchSnapshot(
      request(http, { credentials: credentials({ roots: [`${BASE}/anthropic`, BASE] }), wantRelated: false, wantUsage: false, refreshSlow: false }),
    )

    expect(result.ok && result.root).toBe(BASE)
    expect(calls).toEqual([`${BASE}/anthropic/key/info`, `${BASE}/key/info`])

    calls.length = 0
    await fetchSnapshot(
      request(http, { credentials: credentials({ roots: [`${BASE}/anthropic`, BASE] }), pinnedRoot: BASE, wantRelated: false, wantUsage: false, refreshSlow: false }),
    )
    expect(calls).toEqual([`${BASE}/key/info`])
  })

  test('never sends the key to a pinned root that is no longer configured', async () => {
    const { http, calls } = router(standardRoutes())

    await fetchSnapshot(request(http, { pinnedRoot: 'https://old-proxy.test' }))

    expect(calls.every(call => call.url.startsWith(BASE))).toBe(true)
  })

  test('reports a server that is not LiteLLM', async () => {
    const { http } = router({ '/key/info': reply(404, '<html>nope</html>') })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('not-litellm')
  })

  test('reports an unreachable proxy without leaking the key', async () => {
    const http = async (): Promise<never> => {
      throw new Error(`connect ECONNREFUSED while sending ${KEY}`)
    }
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('network')
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  test('a 401 beats a later not-LiteLLM answer', async () => {
    const http = async (url: string) =>
      url.startsWith(`${BASE}/anthropic`)
        ? reply(404, 'nope')
        : reply(401, { error: { message: 'bad', type: 'auth_error', param: 'None', code: '401' } })
    const result = await fetchSnapshot(
      request(http, { credentials: credentials({ roots: [`${BASE}/anthropic`, BASE] }) }),
    )

    expect(!result.ok && result.failure.kind).toBe('auth')
  })
})
