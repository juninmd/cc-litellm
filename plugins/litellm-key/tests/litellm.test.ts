import { describe, expect, test } from 'claude-code/testing'

import {
  candidateRoots,
  date,
  fetchSnapshot,
  parseHealth,
  parseKey,
  parseModels,
  parseTeam,
  parseUsage,
  parseUser,
  probeEndpoints,
  resolveCredentials,
  withoutCredentials,
} from '../hooks/litellm'
import type { Credentials, FetchRequest, Sources } from '../hooks/litellm'
import type { Snapshot } from '../types'
import type { Route } from './support'
import { BASE, HASH, KEY, NOW, health, keyBody, reply, router, standardRoutes } from './support'

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

  test('drops the query and the fragment of the url', () => {
    const resolved = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://litellm.test/api/?x=1#frag', ANTHROPIC_AUTH_TOKEN: KEY } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.roots).toEqual(['https://litellm.test/api', 'https://litellm.test'])
  })

  test('does not show credentials that hold an @ either', () => {
    const resolved = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://bob:p@ss@litellm.test:4000/api', ANTHROPIC_AUTH_TOKEN: KEY } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.host).toBe('litellm.test:4000')
    expect(withoutCredentials('https://bob:p@ss@litellm.test/path@x')).toBe('https://litellm.test/path@x')
    expect(withoutCredentials('https://litellm.test/a@b')).toBe('https://litellm.test/a@b')
  })

  test('does not show the credentials of a url that is not an http one either', () => {
    const resolved = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'ftp://bob:hunter2@litellm.test', ANTHROPIC_AUTH_TOKEN: KEY } }),
      NOW,
    )

    expect(resolved.ok).toBe(false)
    expect(JSON.stringify(resolved)).not.toContain('hunter2')
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

  test('a moment a Date cannot hold is no date', () => {
    expect(date(NOW)).toBe(NOW)
    expect(date(8.64e15)).toBe(8.64e15)
    expect(date(1e16)).toBeNull()
    expect(date(-1e16)).toBeNull()
    expect(date(Number.POSITIVE_INFINITY)).toBeNull()
    expect(date('+275761-01-01T00:00:00Z')).toBeNull()
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

  test('usage fills the quiet days with zero and keeps what each day did', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03']
    const usage = parseUsage(standardUsage(), days)

    expect(usage?.days.map(item => [item.date, item.spend, item.requests, item.tokens])).toEqual([
      ['2026-10-01', 4, 40, 800000],
      ['2026-10-02', 0, 0, 0],
      ['2026-10-03', 8.7, 90, 1700000],
    ])
    expect(usage?.days[0]).toMatchObject({ failed: 0, inputTokens: 640000, outputTokens: 160000, cacheReadTokens: 400000 })
    expect(parseUsage({}, days)).toBeNull()
  })

  test('usage keeps each model of each day, and nothing for a quiet day', () => {
    const usage = parseUsage(standardUsage(), ['2026-10-01', '2026-10-02'])

    expect(usage?.days[0]?.models).toEqual([
      { model: 'claude-sonnet-4-5', spend: 3, requests: 30, tokens: 600000 },
      { model: 'claude-opus-4-1', spend: 1, requests: 10, tokens: 200000 },
    ])
    expect(usage?.days[1]?.models).toEqual([])
  })

  test('usage adds up rows of one day, counts failures and skips models that did nothing', () => {
    const row = (spend: number, failed: number, models: Record<string, unknown>) => ({
      date: '2026-10-03',
      metrics: { spend, api_requests: 4, failed_requests: failed, total_tokens: 10 },
      breakdown: { models },
    })
    const usage = parseUsage(
      {
        results: [
          row(1, 1, { a: { metrics: { spend: 1, api_requests: 4, total_tokens: 10 } }, idle: { metrics: { spend: 0 } } }),
          row(2, 0, { a: { metrics: { spend: 2, api_requests: 4, total_tokens: 10 } } }),
          { date: '2026-09-01', metrics: { spend: 99 } },
        ],
      },
      ['2026-10-03'],
    )

    expect(usage?.days).toHaveLength(1)
    expect(usage?.days[0]).toMatchObject({ spend: 3, requests: 8, failed: 1, tokens: 20 })
    expect(usage?.days[0]?.models).toEqual([{ model: 'a', spend: 3, requests: 8, tokens: 20 }])
  })

  test('usage survives rows that are not objects and models that carry no metrics', () => {
    const usage = parseUsage({ results: ['x', null, { date: '2026-10-03', breakdown: { models: { a: 5, b: {} } } }] }, ['2026-10-03'])

    expect(usage?.days[0]).toMatchObject({ spend: 0, requests: 0, models: [] })
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
      expect(snapshot.usage?.days).toHaveLength(30)
      expect(snapshot.usage?.days.at(-1)?.date).toBe('2026-10-03')
      expect(snapshot.notes).toEqual([])
      expect(snapshot.keyHint).toBe('sk-…7890')
      expect(snapshot.host).toBe('litellm.test')
      expect(snapshot.root).toBe(BASE)
    }
    expect(calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('never puts the key in a url or in the snapshot', async () => {
    const { http, calls } = router(standardRoutes())
    const result = await fetchSnapshot(request(http))

    expect(calls.some(call => call.url.includes(KEY))).toBe(false)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  test('asks for the usage of this key by its hash, over a 30 day window', async () => {
    const { http, calls } = router(standardRoutes())

    await fetchSnapshot(request(http))
    const usage = calls.find(call => call.url.includes('/user/daily/activity'))

    expect(usage?.url).toContain(`api_key=${HASH}`)
    expect(usage?.url).toContain('user_id=jane')
    expect(usage?.url).toContain('start_date=2026-09-04')
    expect(usage?.url).toContain('end_date=2026-10-03')
  })

  test('names the proxy root it read from, without any credentials that sat in the url', async () => {
    const { http } = router(standardRoutes())
    const result = await fetchSnapshot(request(http, { credentials: credentials({ roots: ['https://bob:hunter2@litellm.test'] }) }))

    expect(result.ok && result.snapshot.root).toBe('https://litellm.test')
    expect(JSON.stringify(result.ok ? result.snapshot : null)).not.toContain('hunter2')
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

  test('a read that fails leaves what the last good one held, and a note', async () => {
    const first = router(standardRoutes())
    const done = await fetchSnapshot(request(first.http))
    const down = router({
      ...standardRoutes(),
      '/user/info': reply(500, { detail: 'boom' }),
      '/team/info': reply(500, { detail: 'boom' }),
      '/v1/models': reply(500, { detail: 'boom' }),
      '/user/daily/activity': reply(500, { detail: 'boom' }),
    })
    const result = await fetchSnapshot(request(down.http, { previous: done.ok ? done.snapshot : null }))

    expect(result.ok && result.snapshot.user).toEqual(done.ok ? done.snapshot.user : undefined)
    expect(result.ok && result.snapshot.team).toEqual(done.ok ? done.snapshot.team : undefined)
    expect(result.ok && result.snapshot.models).toEqual(done.ok ? done.snapshot.models : undefined)
    expect(result.ok && result.snapshot.usage).toEqual(done.ok ? done.snapshot.usage : undefined)
    expect(result.ok && result.snapshot.notes).toHaveLength(4)
  })

  test('a read that fails has nothing to keep without a last good one, and a read that finds nothing keeps nothing', async () => {
    const down = router({ ...standardRoutes(), '/v1/models': reply(500, { detail: 'boom' }) })
    const first = await fetchSnapshot(request(down.http))
    const quiet = router({ ...standardRoutes(), '/v1/models': reply(200, { object: 'list' }) })
    const done = await fetchSnapshot(request(router(standardRoutes()).http))
    const next = await fetchSnapshot(request(quiet.http, { previous: done.ok ? done.snapshot : null }))

    expect(first.ok && first.snapshot.models).toBeNull()
    expect(next.ok && next.snapshot.models).toBeNull()
  })

  test('the user of another key is not kept for this one', async () => {
    const first = router(standardRoutes())
    const done = await fetchSnapshot(request(first.http))
    const other = router({
      ...standardRoutes(),
      '/key/info': reply(200, keyBody({ user_id: 'john' })),
      '/user/info': reply(500, { detail: 'boom' }),
    })
    const result = await fetchSnapshot(request(other.http, { previous: done.ok ? done.snapshot : null }))

    expect(result.ok && result.snapshot.user).toBeNull()
  })

  test('a failing extra only leaves a note', async () => {
    const { http } = router({ ...standardRoutes(), '/team/info': reply(403, { detail: 'nope' }) })
    const result = await fetchSnapshot(request(http))

    expect(result.ok).toBe(true)
    expect(result.ok && result.snapshot.team).toBeNull()
    expect(result.ok && result.snapshot.notes).toEqual(['team budget unavailable: /team/info answered 403'])
  })

  test('whatever the proxy sends goes out without control characters, which the engine would refuse to draw', async () => {
    const esc = '\u001b[31m'
    const { http } = router({
      ...standardRoutes(),
      '/key/info': reply(
        200,
        keyBody({
          key_alias: `${esc}red\u0000alias`,
          team_id: `eng\u0007`,
          models: [`${esc}claude\u0085`, '\u0000'],
          model_max_budget: { [`${esc}opus`]: { budget_limit: 5, time_period: '1d\u0000' } },
        }),
      ),
      '/v1/models': reply(200, { data: [{ id: `${esc}gpt\u007f-5` }, { id: 'ok' }, { id: '\u0000' }] }),
      '/user/daily/activity': reply(200, {
        results: [
          {
            date: '2026-10-03',
            metrics: { spend: 2, api_requests: 3 },
            breakdown: { models: { [`${esc}sonnet\u0000`]: { metrics: { spend: 2, api_requests: 3 } } } },
          },
        ],
      }),
    })
    const result = await fetchSnapshot(request(http))
    const text = JSON.stringify(result.ok ? result.snapshot : null)

    expect(result.ok).toBe(true)
    expect(text).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\\u00[01]|\\u007f|\\u008|\\u009/)
    expect(result.ok && result.snapshot.key.alias).toBe('redalias')
    expect(result.ok && result.snapshot.key.models).toEqual(['claude'])
    expect(result.ok && result.snapshot.models).toEqual(['gpt-5', 'ok'])
    expect(result.ok && result.snapshot.usage?.days.at(-1)?.models.map(item => item.model)).toEqual(['sonnet'])
    expect(result.ok && result.snapshot.key.modelBudgets.map(item => item.model)).toEqual(['opus'])
  })

  test('an error message the proxy colours is told in plain words', async () => {
    const { http } = router({
      '/key/info': reply(401, { error: { message: '\u001b[31mAuthentication Error\u001b[0m: bad key\u0000', type: 'auth_error', code: '401', param: null } }),
    })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.message).toBe('The proxy rejected the key (401): Authentication Error: bad key')
  })

  test('honours the switches', async () => {
    const { http, calls } = router(standardRoutes())

    await fetchSnapshot(request(http, { wantRelated: false, wantUsage: false }))
    expect(calls.map(call => call.url.replace(BASE, ''))).toEqual(['/key/info', '/v1/models', '/health/readiness'])
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

  test('says what went wrong with a connection in plain words', async () => {
    const engine = (detail: string) => `litellm-key: $.http.fetch(https://litellm.test/key/info) failed: ${detail}`
    const cases: [string, string][] = [
      [engine('ECONNREFUSED: ECONNREFUSED: Unable to connect. Is the computer able to access the url?'), 'connection refused'],
      [engine('ENOTFOUND: getaddrinfo ENOTFOUND litellm.test'), 'host not found'],
      [engine('ECONNRESET: socket hang up'), 'connection reset'],
      [engine('UNABLE_TO_VERIFY_LEAF_SIGNATURE: certificate'), 'TLS certificate problem'],
      ['no answer within 4s', 'no answer within 4s'],
    ]

    for (const [detail, expected] of cases) {
      const http = async (): Promise<never> => {
        throw new Error(detail)
      }
      const result = await fetchSnapshot(request(http))

      expect(!result.ok && result.failure.message).toBe(`Could not reach litellm.test: ${expected}`)
      expect(!result.ok && result.failure.hint).toContain('ANTHROPIC_BASE_URL')
    }
  })

  test('tells what each answer means: a refusal, a rate limit, a stranger and a gateway', async () => {
    const kindOf = async (status: number, body: unknown) => {
      const { http } = router({ '/key/info': reply(status, body) })
      const result = await fetchSnapshot(request(http))

      return result.ok ? 'ok' : result.failure.kind
    }
    const error = (code: string) => ({ error: { message: 'no', type: 'x', param: 'None', code } })

    expect(await kindOf(403, error('403'))).toBe('forbidden')
    expect(await kindOf(429, error('429'))).toBe('rate-limit')
    expect(await kindOf(404, { detail: 'Not Found' })).toBe('not-litellm')
    expect(await kindOf(408, 'timeout')).toBe('http')
    expect(await kindOf(502, '<html>bad gateway</html>')).toBe('http')
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

describe('parseHealth', () => {
  test('reads the version and the database from what the proxy says', () => {
    expect(parseHealth({ status: 'healthy', db: 'connected', litellm_version: '1.77.0' })).toEqual({
      version: '1.77.0',
      db: 'connected',
    })
    expect(parseHealth({ db: 'Not connected' })).toEqual({ version: null, db: 'Not connected' })
    expect(parseHealth({ version: '1.2.3' })).toEqual({ version: '1.2.3', db: null })
  })

  test('has nothing for an answer that says neither, or is not an object', () => {
    expect(parseHealth({ status: 'healthy' })).toBeNull()
    expect(parseHealth("I'm alive!")).toBeNull()
    expect(parseHealth(null)).toBeNull()
    expect(parseHealth([])).toBeNull()
  })

  test('cleans what it reads of control characters', () => {
    expect(parseHealth({ litellm_version: '\u001b[31m1.77.0\u0007' })?.version).toBe('1.77.0')
  })
})

describe('the proxy and the time it took', () => {
  const read = async (routes = standardRoutes(), patch: Partial<FetchRequest> = {}) => {
    const result = await fetchSnapshot(request(router(routes).http, patch))

    if (!result.ok) {
      throw new Error(result.failure.message)
    }

    return result.snapshot
  }

  test('reads what the health endpoint says, on a slow read', async () => {
    const snapshot = await read({ ...standardRoutes(), '/health/readiness': health('1.77.0', 'connected') })

    expect(snapshot.proxy).toEqual({ version: '1.77.0', db: 'connected' })
  })

  test('asks with the key like everything else, and nowhere but the proxy', async () => {
    const { http, calls } = router({ ...standardRoutes(), '/health/readiness': health() })

    await fetchSnapshot(request(http))
    const asked = calls.find(call => call.url.endsWith('/health/readiness'))

    expect(asked?.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(asked?.url.startsWith(BASE)).toBe(true)
  })

  test('says nothing when it will not say, not even a note', async () => {
    for (const answer of [reply(404, { detail: 'Not Found' }), reply(401, { detail: 'no' }), reply(500, 'x'), reply(200, '{"status":"healthy"}')]) {
      const snapshot = await read({ ...standardRoutes(), '/health/readiness': answer })

      expect(snapshot.proxy).toBeNull()
      expect(snapshot.notes).toEqual([])
    }
  })

  test('keeps what it knew between slow reads, and when the read fails', async () => {
    const first = await read({ ...standardRoutes(), '/health/readiness': health('1.77.0') })
    const quick = router({ ...standardRoutes(), '/health/readiness': health('9.9.9') })
    const next = await fetchSnapshot(request(quick.http, { refreshSlow: false, previous: first }))
    const down = await read({ ...standardRoutes(), '/health/readiness': reply(500, 'x') }, { previous: first })

    expect(quick.calls.some(call => call.url.endsWith('/health/readiness'))).toBe(false)
    expect(next.ok && next.snapshot.proxy?.version).toBe('1.77.0')
    expect(down.proxy?.version).toBe('1.77.0')
  })

  test('takes the time /key/info took from the answer that said it', async () => {
    const { http } = router(standardRoutes())
    const timed = (ms: number | undefined) => async (url: string, headers: Record<string, string>) => ({ ...(await http(url, headers)), ms })

    const slow = await fetchSnapshot(request(timed(142)))
    const instant = await fetchSnapshot(request(timed(0)))
    const unknown = await fetchSnapshot(request(timed(undefined)))

    expect(slow.ok && slow.snapshot.latencyMs).toBe(142)
    expect(instant.ok && instant.snapshot.latencyMs).toBeNull()
    expect(unknown.ok && unknown.snapshot.latencyMs).toBeNull()
  })

  test('takes the time anew on every read', async () => {
    const { http } = router(standardRoutes())
    const first = await fetchSnapshot(request(async (url, headers) => ({ ...(await http(url, headers)), ms: 90 })))
    const next = await fetchSnapshot(
      request(http, { previous: first.ok ? first.snapshot : null, refreshSlow: false }),
    )

    expect(first.ok && first.snapshot.latencyMs).toBe(90)
    expect(next.ok && next.snapshot.latencyMs).toBeNull()
  })
})

describe('probeEndpoints', () => {
  const asked = async (routes: Record<string, Route> = { ...standardRoutes(), '/health/readiness': health() }, withSnapshot = true) => {
    const { http, calls } = router(routes)
    const snapshot: Snapshot | null = withSnapshot ? await readSnapshot(routes) : null
    const probes = await probeEndpoints({ credentials: credentials(), root: BASE, http, snapshot, now: NOW })

    return { probes, calls }
  }
  const readSnapshot = async (routes: Record<string, Route>) => {
    const result = await fetchSnapshot(request(router(routes).http))

    if (!result.ok) {
      throw new Error(result.failure.message)
    }

    return result.snapshot
  }

  test('asks every endpoint the plugin reads, and says what each answered', async () => {
    const { probes } = await asked()

    expect(probes.map(probe => [probe.path, probe.status, probe.ok, probe.detail])).toEqual([
      ['/key/info', 200, true, 'active'],
      ['/user/info', 200, true, 'has a budget'],
      ['/team/info', 200, true, 'has a budget'],
      ['/v1/models', 200, true, '3 models'],
      ['/user/daily/activity', 200, true, '3 active days'],
      ['/health/readiness', 200, true, 'v1.77.0 · database connected'],
    ])
  })

  test('asks about the user and the team the last reading knew, with the key, to the root it was given', async () => {
    const { calls } = await asked()

    expect(calls.map(call => call.url.replace(BASE, '').split('?')[0])).toEqual([
      '/key/info',
      '/user/info',
      '/team/info',
      '/v1/models',
      '/user/daily/activity',
      '/health/readiness',
    ])
    expect(calls.find(call => call.url.includes('/user/info'))?.url).toContain('user_id=jane')
    expect(calls.find(call => call.url.includes('/user/daily/activity'))?.url).toContain(`api_key=${HASH}`)
    expect(calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('only asks what it can with nothing read before', async () => {
    const { probes } = await asked(undefined, false)

    expect(probes.map(probe => probe.path)).toEqual(['/key/info', '/v1/models', '/health/readiness'])
  })

  test('says why an endpoint did not answer, with what to make of it', async () => {
    const { probes } = await asked({
      ...standardRoutes(),
      '/user/daily/activity': reply(404, { detail: 'Not Found' }),
      '/team/info': reply(403, { detail: 'not allowed' }),
    })
    const byPath = Object.fromEntries(probes.map(probe => [probe.path, probe]))

    expect(byPath['/user/daily/activity']).toMatchObject({ status: 404, ok: false })
    expect(byPath['/user/daily/activity']?.detail).toBe('Not Found · the usage history is a beta endpoint, missing from some LiteLLM versions')
    expect(byPath['/team/info']?.detail).toBe('not allowed · the team budget is optional: turn show_related off to stop asking')
    expect(byPath['/health/readiness']?.ok).toBe(false)
  })

  test('leaves the hint out of a server error, which is not the endpoint\'s fault', async () => {
    const { probes } = await asked({ ...standardRoutes(), '/v1/models': reply(502, 'bad gateway') })

    expect(probes.find(probe => probe.path === '/v1/models')?.detail).toBe('bad gateway')
  })

  test('turns a connection that fails into a row, in plain words', async () => {
    const down = async (url: string): Promise<never> => {
      throw new Error(`connect ECONNREFUSED ${url}`)
    }
    const probes = await probeEndpoints({ credentials: credentials(), root: BASE, http: down, snapshot: null, now: NOW })

    expect(probes.every(probe => probe.status === null && !probe.ok)).toBe(true)
    expect(probes[0]?.detail).toBe('connection refused')
  })

  test('says how long each answer took, when it was timed', async () => {
    const { http } = router({ ...standardRoutes(), '/health/readiness': health() })
    const timed = async (url: string, headers: Record<string, string>) => ({ ...(await http(url, headers)), ms: url.endsWith('/key/info') ? 141.6 : 0 })
    const probes = await probeEndpoints({ credentials: credentials(), root: BASE, http: timed, snapshot: null, now: NOW })

    expect(probes[0]?.ms).toBe(142)
    expect(probes[1]?.ms).toBeNull()
  })

  test('never lets the key into what it says', async () => {
    const { probes } = await asked({
      ...standardRoutes(),
      '/v1/models': reply(401, { error: { message: `bad key ${KEY}`, type: 'auth_error', param: 'None', code: '401' } }),
    })

    expect(JSON.stringify(probes)).not.toContain(KEY)
    expect(probes.find(probe => probe.path === '/v1/models')?.detail).toContain('sk-…7890')
  })
})
