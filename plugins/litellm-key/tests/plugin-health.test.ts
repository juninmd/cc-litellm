import { describe, expect, test } from 'claude-code/testing'
import { boot, run, start, urls } from './boot'
import { BASE, KEY, NOW, keyBody, reply, standardRoutes } from './support'

const DAY = 86_400_000

describe('a slow or dead proxy', () => {
  const slow = (sleep: () => (ms: number) => Promise<void>) => ({
    ...standardRoutes(),
    '/key/info': async () => {
      await sleep()(20_000)

      return reply(200, keyBody())
    },
  })

  test('the pane opens at once and says it is still reading', async ($, on) => {
    let wait = async (_ms: number): Promise<void> => {}
    const { log, clock } = boot(on, { routes: slow(() => wait) })

    wait = clock.sleep
    const running = run($, '')

    await clock.advance(3_000)
    const { text } = await running

    expect(log.opens).toEqual(['litellm-key'])
    expect(text).toContain('Reading the key')
  })

  test('a request that never answers is given up on after 4 seconds', async ($, on) => {
    let wait = async (_ms: number): Promise<void> => {}
    const { clock } = boot(on, { routes: slow(() => wait) })

    wait = clock.sleep
    const running = run($, 'info')

    await clock.advance(5_000)
    const { text } = await running

    expect(text).toContain('Could not reach litellm.test')
    expect(text).toContain('no answer within 4s')
  })

  test('a refused connection is reported once, not once per candidate root', async ($, on) => {
    const { net, clock } = boot(on, {
      env: { ANTHROPIC_BASE_URL: `${BASE}/anthropic`, ANTHROPIC_AUTH_TOKEN: KEY },
      routes: { '/key/info': () => { throw new Error('connect ECONNREFUSED') } },
    })

    await start($, clock)

    expect(urls(net).filter(url => url.endsWith('/key/info'))).toHaveLength(1)
  })
})

describe('warnings', () => {
  const near = (spend: number) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody({ spend })) })

  test('toasts once when the budget crosses the threshold, again at 95% and 100%', async ($, on) => {
    let spend = 30
    const routes = { ...standardRoutes(), '/key/info': () => reply(200, keyBody({ spend })) }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    expect(log.toasts).toEqual([])

    spend = 41
    await run($, 'refresh')
    expect(log.toasts).toEqual(['82% of the key budget is used ($41.00 of $50.00)'])

    await run($, 'refresh')
    expect(log.toasts).toHaveLength(1)

    spend = 48
    await run($, 'refresh')
    expect(log.toasts.at(-1)).toBe('96% of the key budget is used ($48.00 of $50.00)')

    spend = 51
    await run($, 'refresh')
    expect(log.toasts.at(-1)).toBe('The key is over budget ($51.00 of $50.00)')
    expect(log.toasts).toHaveLength(3)
  })

  test('remembers what it already said across sessions', async ($, on) => {
    const { log, clock } = boot(on, {
      routes: near(41),
      store: { notified: ['budget:sk-...7890:' + Date.parse('2026-10-10T00:00:00Z') / 60_000 + ':50:80'] },
    })

    await start($, clock)

    expect(log.toasts).toEqual([])
  })

  test('a raised budget is a new threshold, so the same percentage warns again after a grant', async ($, on) => {
    let spend = 41
    let limit = 50
    const routes = {
      ...standardRoutes(),
      '/key/info': () => reply(200, keyBody({ spend, max_budget: limit })),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    expect(log.toasts).toEqual(['82% of the key budget is used ($41.00 of $50.00)'])
    limit = 100
    spend = 85
    await run($, 'refresh')
    expect(log.toasts).toEqual([
      '82% of the key budget is used ($41.00 of $50.00)',
      '85% of the key budget is used ($85.00 of $100.00)',
    ])
  })

  test('does not repeat itself when the proxy jitters the reset time by a few seconds', async ($, on) => {
    let jitter = 0
    const routes = {
      ...standardRoutes(),
      '/key/info': () => reply(200, keyBody({ spend: 45, budget_reset_at: new Date(Date.parse('2026-10-10T00:00:00Z') + jitter).toISOString() })),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    jitter = 7_000
    await run($, 'refresh')
    jitter = 11_000
    await run($, 'refresh')

    expect(log.toasts).toHaveLength(1)
  })

  test('warns again after the budget resets', async ($, on) => {
    let resetAt = '2026-10-10T00:00:00Z'
    const routes = { ...standardRoutes(), '/key/info': () => reply(200, keyBody({ spend: 45, budget_reset_at: resetAt })) }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    expect(log.toasts).toHaveLength(1)

    resetAt = '2026-11-10T00:00:00Z'
    await run($, 'refresh')
    expect(log.toasts).toHaveLength(2)
  })

  test('warns about a key that expires within three days and about a dead key', async ($, on) => {
    const soon = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ expires: new Date(NOW + 2 * DAY).toISOString() })) } })

    await start($, soon.clock)
    expect(soon.log.toasts).toEqual(['The key expires in 2d'])
  })

  test('a blocked key is announced once', async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ blocked: true, status: 'revoked' })) } })

    await start($, clock)
    await run($, 'refresh')

    expect(log.toasts).toEqual(['The key is revoked'])
  })
})

describe('failures', () => {
  test('keeps the last good reading through a hiccup and says so', async ($, on) => {
    let isUp = true
    const routes = {
      ...standardRoutes(),
      '/key/info': () => (isUp ? reply(200, keyBody()) : reply(502, 'bad gateway')),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    isUp = false
    const { text } = await run($, 'refresh')

    expect(text).toContain('(stale) The proxy answered 502')
    expect(log.statuses.at(-1)).toContain('stale: HTTP 502')
    expect(log.toasts).toEqual([])
  })

  test('drops the reading and toasts when the key is rejected', async ($, on) => {
    let isValid = true
    const routes = {
      ...standardRoutes(),
      '/key/info': () =>
        isValid
          ? reply(200, keyBody())
          : reply(401, { error: { message: 'bad key', type: 'auth_error', param: 'None', code: '401' } }),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    isValid = false
    const { text } = await run($, 'refresh')

    expect(text).toContain('The proxy rejected the key (401)')
    expect(log.statuses.at(-1)).toBe('key rejected (401)')
    expect(log.toasts).toHaveLength(1)
    expect(log.toasts[0]).toContain('rejected the key')

    await run($, 'refresh')
    expect(log.toasts).toHaveLength(1)
  })

  test('the master key gets an honest explanation', async ($, on) => {
    const routes = {
      '/key/info': reply(404, { error: { message: 'Key not found in database', type: 'not_found_error', param: 'key', code: '404' } }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)

    expect((await run($, 'info')).text).toContain('master key')
  })
})
