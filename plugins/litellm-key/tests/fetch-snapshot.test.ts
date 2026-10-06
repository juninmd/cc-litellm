import { describe, expect, test } from 'claude-code/testing'
import { fetchSnapshot } from '../hooks/litellm'
import { credentials, request, standardUsage } from './factories'
import { BASE, HASH, KEY, keyBody, reply, router, standardRoutes } from './support'

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
    expect(calls.map(call => call.url.replace(BASE, ''))).toEqual(['/key/info', '/v1/models', '/model_group/info'])
  })

  test('says when the usage history does not fit in one page of the proxy', async () => {
    const usage = { ...standardUsage(), metadata: { total_spend: 14.2, has_more: true, page: 1, total_pages: 3 } }
    const result = await fetchSnapshot(request(router({ ...standardRoutes(), '/user/daily/activity': reply(200, usage) }).http))

    expect(result.ok && result.snapshot.notes).toEqual(['usage history is partial: the proxy has more rows than one page holds'])
    expect(result.ok && result.snapshot.usage?.days).toHaveLength(7)
  })

  test('keeps saying the history is partial on the fast ticks that reuse it, and stops when a slow refresh sees it whole', async () => {
    const partial = { ...standardUsage(), metadata: { total_spend: 14.2, has_more: true, page: 1, total_pages: 3 } }
    const first = await fetchSnapshot(request(router({ ...standardRoutes(), '/user/daily/activity': reply(200, partial) }).http))
    const previous = first.ok ? first.snapshot : null
    const fast = await fetchSnapshot(request(router(standardRoutes()).http, { refreshSlow: false, previous }))
    const whole = await fetchSnapshot(request(router(standardRoutes()).http, { previous }))

    expect(fast.ok && fast.snapshot.notes).toEqual(['usage history is partial: the proxy has more rows than one page holds'])
    expect(whole.ok && whole.snapshot.notes).toEqual([])
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

  test('names a blocked key instead of calling it invalid (message as LiteLLM v1.99 sends it)', async () => {
    const message = "Authentication Error, Key is blocked. Update via `/key/unblock` if you're an admin."
    const { http } = router({ '/key/info': reply(401, { error: { message, type: 'auth_error', param: 'None', code: '401' } }) })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('blocked')
    expect(!result.ok && result.failure.hint).toContain('unblock')
  })

  test('names an expired key (message as LiteLLM v1.99 sends it)', async () => {
    const message = 'Authentication Error - Expired Key. Key Expiry time 2026-10-04 03:47:58+00:00 and current time 2026-10-04 03:48:00+00:00'
    const { http } = router({ '/key/info': reply(401, { error: { message, type: 'expired_key', param: 'sk-...c817', code: '401' } }) })
    const result = await fetchSnapshot(request(http))

    expect(!result.ok && result.failure.kind).toBe('expired')
  })

  test('a user or team without a record is not a problem: no budget there, no note', async () => {
    const missing = reply(404, { error: { message: 'User jane not found', type: 'internal_server_error', param: 'None', code: '404' } })
    const { http } = router({ ...standardRoutes(), '/user/info': missing, '/team/info': missing })
    const result = await fetchSnapshot(request(http))

    expect(result.ok && result.snapshot.user).toBeNull()
    expect(result.ok && result.snapshot.team).toBeNull()
    expect(result.ok && result.snapshot.notes).toEqual([])
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
