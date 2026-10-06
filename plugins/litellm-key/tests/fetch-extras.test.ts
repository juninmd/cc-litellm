import { describe, expect, test } from 'claude-code/testing'

import { fetchSnapshot } from '../hooks/litellm'
import { parseHealth } from '../hooks/parsers'
import { health } from './activity-fixtures'
import { credentials, request } from './factories'
import { BASE, HASH, KEY, NOW, keyBody, reply, router, standardRoutes } from './support'

const read = async (routes = standardRoutes(), patch: Parameters<typeof request>[1] = {}) => {
  const result = await fetchSnapshot(request(router(routes).http, patch))

  if (!result.ok) {
    throw new Error(result.failure.message)
  }

  return result.snapshot
}

describe('a read that fails keeps what the last good one held', () => {
  test('for the user, the team, the models and the usage, with a note each', async () => {
    const done = await read()
    const down = {
      ...standardRoutes(),
      '/user/info': reply(500, { detail: 'boom' }),
      '/team/info': reply(500, { detail: 'boom' }),
      '/v1/models': reply(500, { detail: 'boom' }),
      '/user/daily/activity': reply(500, { detail: 'boom' }),
    }
    const snapshot = await read(down, { previous: done })

    expect(snapshot.user).toEqual(done.user)
    expect(snapshot.team).toEqual(done.team)
    expect(snapshot.userRole).toBe(done.userRole)
    expect(snapshot.models).toEqual(done.models)
    expect(snapshot.usage).toEqual(done.usage)
    expect(snapshot.notes).toHaveLength(4)
  })

  test('for the prices too', async () => {
    const groups = { data: [{ model_group: 'claude-sonnet-4-5', input_cost_per_token: 0.000003, output_cost_per_token: 0.000015 }] }
    const done = await read({ ...standardRoutes(), '/model_group/info': reply(200, groups) })
    const snapshot = await read({ ...standardRoutes(), '/model_group/info': reply(500, 'boom') }, { previous: done })

    expect(done.prices).not.toBeNull()
    expect(snapshot.prices).toEqual(done.prices)
  })

  test('and has nothing to keep without a last good one, nor when a read finds nothing', async () => {
    const first = await read({ ...standardRoutes(), '/v1/models': reply(500, { detail: 'boom' }) })
    const done = await read()
    const next = await read({ ...standardRoutes(), '/v1/models': reply(200, { object: 'list' }) }, { previous: done })

    expect(first.models).toBeNull()
    expect(next.models).toBeNull()
  })

  test('but never the user or the team of another key', async () => {
    const done = await read()
    const other = {
      ...standardRoutes(),
      '/key/info': reply(200, keyBody({ user_id: 'john', team_id: 'ops' })),
      '/user/info': reply(500, { detail: 'boom' }),
      '/team/info': reply(500, { detail: 'boom' }),
    }
    const snapshot = await read(other, { previous: done })

    expect(snapshot.user).toBeNull()
    expect(snapshot.team).toBeNull()
    expect(snapshot.member).toBeNull()
  })
})

describe('what the proxy sends goes out clean', () => {
  test('no control character reaches the snapshot, the engine would refuse to draw it', async () => {
    const esc = '\u001b[31m'
    const snapshot = await read({
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
    })
    const text = JSON.stringify(snapshot)

    expect(text).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\\u00[01]|\\u007f|\\u008|\\u009/)
    expect(snapshot.key.alias).toBe('redalias')
    expect(snapshot.key.models).toEqual(['claude'])
    expect(snapshot.models).toEqual(['gpt-5', 'ok'])
    expect(snapshot.key.modelBudgets.map(item => item.model)).toEqual(['opus'])
  })

  test('an error message the proxy colours is told in plain words', async () => {
    const colored = reply(401, { error: { message: '\u001b[31mAuthentication Error\u001b[0m: bad key\u0000', type: 'auth_error', code: '401', param: null } })
    const result = await fetchSnapshot(request(router({ '/key/info': colored }).http))

    expect(!result.ok && result.failure.message).toBe('The proxy rejected the key (401): Authentication Error: bad key')
  })
})

describe('the proxy and the time it took', () => {
  test('reads what the health endpoint says, on a slow read', async () => {
    expect((await read({ ...standardRoutes(), '/health/readiness': health('1.77.0', 'connected') })).proxy).toEqual({
      version: '1.77.0',
      db: 'connected',
    })
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

  test('takes the time /key/info took from the answer that said it, and none from a clock that did not move', async () => {
    const { http } = router(standardRoutes())
    const timed = (ms: number | undefined) => async (url: string, headers: Record<string, string>) => ({ ...(await http(url, headers)), ms })
    const slow = await fetchSnapshot(request(timed(142)))
    const instant = await fetchSnapshot(request(timed(0)))
    const unknown = await fetchSnapshot(request(timed(undefined)))

    expect(slow.ok && slow.snapshot.latencyMs).toBe(142)
    expect(instant.ok && instant.snapshot.latencyMs).toBeNull()
    expect(unknown.ok && unknown.snapshot.latencyMs).toBeNull()
  })

  test('names the root it read from, without the credentials that sat in the url', async () => {
    const snapshot = await read(standardRoutes(), { credentials: credentials({ roots: ['https://bob:p@ss@litellm.test'] }) })

    expect(snapshot.root).toBe('https://litellm.test')
    expect(JSON.stringify(snapshot)).not.toContain('p@ss')
  })
})

describe('parseHealth', () => {
  test('reads the version and the database from what the proxy says', () => {
    expect(parseHealth({ status: 'healthy', db: 'connected', litellm_version: '1.77.0' })).toEqual({ version: '1.77.0', db: 'connected' })
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

describe('what the proxy and the engine say of the key', () => {
  const message = (hash: string) =>
    `Authentication Error, Invalid proxy server token passed. Received API Key = sk-...7890, Key Hash (Token) =${hash}. Unable to find token in cache or LiteLLM_VerificationTokenTable`

  test('a rejected key does not bring its sha256 into the failure', async () => {
    const result = await fetchSnapshot(
      request(router({ '/key/info': reply(401, { error: { message: message(HASH), type: 'auth_error', param: 'None', code: '401' } }) }).http),
    )

    expect(!result.ok && result.failure.message).toContain('The proxy rejected the key (401)')
    expect(JSON.stringify(result)).not.toContain(HASH.slice(0, 12))
  })

  test('an engine error that names the url does not bring the api_key of it into a note', async () => {
    const { http } = router(standardRoutes())
    const failing = async (url: string, headers: Record<string, string>) => {
      if (url.includes('/user/daily/activity')) {
        throw new Error(`Malformed_HTTP_Response fetching "${url}": not HTTP`)
      }

      return http(url, headers)
    }
    const result = await fetchSnapshot(request(failing))
    const note = result.ok ? result.snapshot.notes.join('\n') : ''

    expect(note).toBe('usage history unavailable: the proxy sent an answer that is not HTTP')
    expect(note).not.toContain(HASH.slice(0, 8))
  })

  test('an error that names the url in words of its own is cut before the api_key', async () => {
    const { http } = router(standardRoutes())
    const failing = async (url: string, headers: Record<string, string>) => {
      if (url.includes('/user/daily/activity')) {
        throw new Error(`unexpected failure at ${url}`)
      }

      return http(url, headers)
    }
    const result = await fetchSnapshot(request(failing))
    const note = result.ok ? result.snapshot.notes.join('\n') : ''

    expect(note).toContain('usage history unavailable')
    expect(note).not.toContain(HASH.slice(0, 8))
    expect(note).not.toContain('api_key=0')
    void NOW
  })
})
