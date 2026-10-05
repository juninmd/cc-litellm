import { describe, expect, test } from 'claude-code/testing'

import { DAY, SURFACES, boot, keysOf, mount, run, start, texts, urls } from './harness'
import type { Reads } from './harness'
import { BASE, KEY, NOW, keyBody, reply, router, standardRoutes, withKey } from './support'

describe('session start', () => {
  test('registers /litellm, reads the key and pins the status line', async ($, on) => {
    const { log, net, clock } = boot(on)

    await start($, clock)

    expect(log.commands).toEqual(['litellm'])
    expect(urls(net)).toContain('/key/info')
    expect(log.statuses.at(-1)).toBe('▰▰▱▱▱▱ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('a store that fails does not stop the plugin', async ($, on) => {
    const { log, net, clock } = boot(on, { storeFails: true })

    await start($, clock)
    await clock.advance(60_000)

    expect(urls(net).filter(url => url === '/key/info')).toHaveLength(2)
    expect(log.statuses.at(-1)).toMatch(/^▰▰▱▱▱▱ 25% of budget · \$12\.50 of \$50\.00 · resets in 6d 1[12]h \(30d\)$/)
    expect((await run($, 'info')).text).toContain('$12.50 / $50.00 (25%)')
  })

  test('a pane that stayed up while the code reloaded keeps its clock', async ($, on) => {
    const { log, clock } = boot(on)

    log.panes.add('litellm-key')
    await start($, clock)
    await clock.advance(2_000)

    expect(log.invalidations).toBe(2)
  })

  test('status_bar off keeps the text alone', { options: { status_bar: false } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.statuses.at(-1)).toBe('25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('says when the budget runs out at this pace, while that is before it resets', async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 42 })) } })

    await start($, clock)

    expect(log.statuses.at(-1)).toBe('▰▰▰▰▰▱ 84% of budget · $42.00 of $50.00 · resets in 6d 12h (30d) · empty in 4d 11h')
  })

  test('show_forecast off leaves the pace out of the status line', { options: { show_forecast: false } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 42 })) } })

    await start($, clock)

    expect(log.statuses.at(-1)).not.toContain('empty in')
  })

  test('re-reads on the refresh interval and not before', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = urls(net).filter(url => url === '/key/info').length

    await clock.advance(59_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first)
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first + 1)
  })

  test('a finished turn triggers a throttled re-read', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    await clock.advance(25_000)
    const before = urls(net).filter(url => url === '/key/info').length

    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)

    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)
  })

  test('says nothing in the status line when Claude Code is not behind a proxy', async ($, on) => {
    const { log, net, clock } = boot(on, { env: {} })

    await start($, clock)

    expect(net.calls).toHaveLength(0)
    expect(log.statuses.at(-1)).toBeUndefined()
    expect(log.toasts).toEqual(['Not configured. Run /litellm for setup help.'])
  })
})

describe('/litellm', () => {
  test('info prints the whole summary and never the key', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('prod-claude')
    expect(text).toContain('$12.50 / $50.00')
    expect(text).toContain('eng-platform')
    expect(text).not.toContain(KEY)
  })

  test('opens the pane and answers with one line', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const { text } = await run($, '')

    expect(log.opens).toEqual(['litellm-key'])
    expect(text).toBe('25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('falls back to text when nothing draws (headless)', async ($, on) => {
    const { log, clock } = boot(on, { surfaces: [] })

    await start($, clock)
    const { text } = await run($, '')

    expect(log.opens).toHaveLength(0)
    expect(text).toContain('prod-claude · sk-...7890')
  })

  test('says why the pane could not open', async ($, on) => {
    const { clock } = boot(on, { open: { isPlaced: false, reason: 'too narrow' } })

    await start($, clock)
    const { text } = await run($, 'pane')

    expect(text).toContain('too narrow')
  })

  test('refresh reads again at once, even inside the throttle window', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const before = urls(net).filter(url => url === '/key/info').length

    await run($, 'refresh')
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)
  })

  test('models lists what the key can call', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'models')).text).toBe('Models (3): claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5')
  })

  test('debug says where the url and the key come from, without the key', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'debug')

    expect(text).toContain('litellm.test')
    expect(text).toContain('from ANTHROPIC_AUTH_TOKEN')
    expect(text).toContain('sk-…7890')
    expect(text).not.toContain(KEY)
  })

  test('debug says whether the compact pane is on', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('compact pane off')
  })

  test('debug says the compact pane is on when the option asks for it', { options: { compact_pane: true } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('compact pane on')
  })

  test('close and help and a typo', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect((await run($, 'close')).text).toBe('Pane closed.')
    expect(log.closes).toEqual(['litellm-key'])
    expect((await run($, 'help')).text).toContain('/litellm refresh')
    expect((await run($, 'wat')).text).toContain('Unknown option "wat"')
  })

  test('explains the setup when there is nothing to read', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('ANTHROPIC_BASE_URL is not set')
    expect(text).toContain('claude plugin configure litellm-key')
  })

  test('reads the url and key from the settings.json env block too', async ($, on) => {
    const { net, clock } = boot(on, {
      env: {},
      settingsEnv: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY },
    })

    await start($, clock)

    expect(urls(net)).toContain('/key/info')
  })
})

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

describe('first command', () => {
  test('a command that arrives before the first read waits for it and sees the result', async ($, on) => {
    boot(on)

    const { text } = await run($, 'debug')

    expect(text).toContain('Result   ok at')
  })

  test('info as the very first thing also has the data', async ($, on) => {
    boot(on)

    expect((await run($, 'info')).text).toContain('prod-claude')
  })
})

describe('options', () => {
  const OWN = { litellm_url: 'https://other.test', litellm_key: 'sk-from-option-123456' }

  test('litellm_url and litellm_key win over the environment', { options: OWN }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)

    expect(net.calls.length).toBeGreaterThan(0)
    for (const call of net.calls) {
      expect(call.url.startsWith('https://other.test/')).toBe(true)
      expect(call.headers.authorization).toBe('Bearer sk-from-option-123456')
    }
  })

  test('show_status_line off keeps the line empty', { options: { show_status_line: false } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.statuses.every(line => line === undefined)).toBe(true)
  })

  test('show_related and show_usage off skip those endpoints', { options: { show_related: false, show_usage: false } }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)

    expect(urls(net)).toEqual(['/key/info', '/v1/models', '/health/readiness'])
  })

  test('refresh_seconds sets the interval', { options: { refresh_seconds: 30 } }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = urls(net).filter(url => url === '/key/info').length

    await clock.advance(31_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first + 1)
  })

  test('warn_percent moves the first warning', { options: { warn_percent: 20 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.toasts).toEqual(['25% of the key budget is used ($12.50 of $50.00)'])
  })
})

describe('warnings', () => {
  const near = (spend: number) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody({ spend })) })

  test('a store that fails still toasts a warning, once', { options: { show_forecast: false } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: near(41), storeFails: true })

    await start($, clock)
    await clock.advance(180_000)

    expect(log.toasts).toEqual(['82% of the key budget is used ($41.00 of $50.00)'])
  })

  test('a budget a hair under its cap is not called over it', { options: { show_forecast: false } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: near(49.8) })

    await start($, clock)

    expect(log.toasts).toEqual(['99% of the key budget is used ($49.80 of $50.00)'])
    expect((await run($, 'info')).text).not.toMatch(/over its cap|over budget/)
    expect(log.statuses.at(-1)).toMatch(/99% of budget/)
  })

  test('a budget of zero is a cap that is reached', { options: { show_forecast: false } }, async ($, on) => {
    const routes = { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 3, max_budget: 0 })) }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('$3.00 / $0.00 (100%)')
    expect(text).toContain('$3.00 over')
    expect(log.statuses.at(-1)).toMatch(/▰{6} 100% of budget · \$3\.00 of \$0\.00 · over budget/)
    expect(log.toasts).toEqual(['The key is over budget ($3.00 of $0.00)'])
  })

  test('toasts once when the budget crosses the threshold, again at 95% and 100%', { options: { show_forecast: false } }, async ($, on) => {
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

  test('remembers what it already said across sessions', { options: { show_forecast: false } }, async ($, on) => {
    const { log, clock } = boot(on, {
      routes: near(41),
      store: { notified: ['budget:sk-...7890:' + Date.parse('2026-10-10T00:00:00Z') / 60_000 + ':80'] },
    })

    await start($, clock)

    expect(log.toasts).toEqual([])
  })

  test('does not repeat itself when the proxy jitters the reset time by a few seconds', { options: { show_forecast: false } }, async ($, on) => {
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

  test('warns again after the budget resets', { options: { show_forecast: false } }, async ($, on) => {
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

  test('warns again once less than a day is left', { options: { refresh_seconds: 3600, show_forecast: false } }, async ($, on) => {
    const routes = {
      ...standardRoutes(),
      '/key/info': reply(200, keyBody({ expires: new Date(NOW + 2.5 * DAY).toISOString() })),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    expect(log.toasts).toEqual(['The key expires in 2d 12h'])

    await clock.advance(10 * 3_600_000)
    expect(log.toasts).toHaveLength(1)

    await clock.advance(30 * 3_600_000)
    expect(log.toasts).toHaveLength(2)
    expect(log.toasts[1]).toMatch(/^The key expires in \d+h$/)
  })

  test('a blocked key is announced once', async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ blocked: true, status: 'revoked' })) } })

    await start($, clock)
    await run($, 'refresh')

    expect(log.toasts).toEqual(['The key is revoked'])
  })

  describe('pace', () => {
    const fast = (spend: number, resetAt = '2026-10-10T00:00:00Z') => ({
      ...standardRoutes(),
      '/key/info': () => reply(200, keyBody({ spend, budget_reset_at: resetAt })),
    })

    test('warns once when the budget will run out before it resets, with the threshold warning beside it', async ($, on) => {
      const { log, clock } = boot(on, { routes: fast(41) })

      await start($, clock)
      await run($, 'refresh')
      await run($, 'refresh')

      expect(log.toasts).toEqual([
        '82% of the key budget is used ($41.00 of $50.00)',
        'At this pace the key budget runs out in 5d 3h, before it resets',
      ])
    })

    test('warns before the threshold is crossed, when the pace is what is wrong', async ($, on) => {
      const { log, clock } = boot(on, { routes: fast(39.5) })

      await start($, clock)

      // 79% is under the 80% line, but $39.50 in 23 of 30 days is $1.68 a day: the last $10.50 lasts about 6 days.
      expect(log.toasts).toEqual(['At this pace the key budget runs out in 6d 5h, before it resets'])
    })

    test('stays quiet while the pace holds, and once the budget is over', async ($, on) => {
      const calm = boot(on, { routes: fast(12.5) })

      await start($, calm.clock)
      expect(calm.log.toasts).toEqual([])
      expect((await run($, 'refresh')).text).toContain('25%')
    })

    test('says the budget is over, and nothing about a pace, once it is', async ($, on) => {
      const { log, clock } = boot(on, { routes: fast(52) })

      await start($, clock)
      await run($, 'refresh')

      expect(log.toasts).toEqual(['The key is over budget ($52.00 of $50.00)'])
    })

    test('says it again in the next budget window', async ($, on) => {
      let resetAt = '2026-10-10T00:00:00Z'
      const routes = { ...standardRoutes(), '/key/info': () => reply(200, keyBody({ spend: 39.5, budget_reset_at: resetAt })) }
      const { log, clock } = boot(on, { routes })

      await start($, clock)
      expect(log.toasts).toHaveLength(1)
      resetAt = '2026-10-17T00:00:00Z'
      await run($, 'refresh')
      await run($, 'refresh')
      expect(log.toasts.filter(text => text.startsWith('At this pace'))).toHaveLength(2)
    })

    test('show_forecast off keeps it to the thresholds', { options: { show_forecast: false } }, async ($, on) => {
      const { log, clock } = boot(on, { routes: fast(39.5) })

      await start($, clock)

      expect(log.toasts).toEqual([])
    })
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

  test('an error the proxy colours is told in plain words, and the pane draws it', async ($, on) => {
    const routes = {
      '/key/info': reply(401, {
        error: { message: '\u001b[31mbad key\u001b[0m\u0000', type: 'auth_error', param: 'None', code: '401' },
      }),
    }
    const { log, clock } = boot(on, { routes })

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('The proxy rejected the key (401): bad key')
    expect(text).not.toContain('\u001b')
    expect(log.toasts[0]).toBe('The proxy rejected the key (401): bad key')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: 'litellm-key',
        surface,
        component: 'Pane',
        requestId: 'litellm-key',
        props: { title: 'LiteLLM key', isFocused: false, bodyColumns: 76, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
      })

      expect(await ui.find({ type: 'Text', text: /The proxy rejected the key \(401\): bad key/ })).toBeDefined()
      await ui.unmount()
    }
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

describe('the pane', () => {
  const COMPACT = { compact_pane: true }
  const spending = (spend: number) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody({ spend })) })

  test('draws the key on every surface', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░+ 25%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Updated 12:00:00 \(just now\) · every 60s/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1: Overview/ })).toBeDefined()
      expect(await keysOf(ui)).toEqual(['refresh', 'copy', 'close', 'tab-usage', 'tab-models', 'tab-details'])
      await ui.unmount()
    }
  })

  test('Refresh reads again, Copy puts the summary on the clipboard, Close closes', async ($, on) => {
    const { log, net, clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')
    const before = urls(net).filter(url => url === '/key/info').length

    await ui.press({ key: 'refresh' })
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)

    await ui.press({ key: 'copy' })
    expect(log.copies).toHaveLength(1)
    expect(log.copies[0]).toContain('prod-claude')
    expect(log.copies[0]).not.toContain(KEY)
    expect(log.toasts).toEqual(['Copied the summary'])

    await ui.press({ key: 'close' })
    expect(log.closes).toEqual(['litellm-key'])
  })

  test('says when the clipboard would not take it', async ($, on) => {
    const { log, clock } = boot(on, { copy: { isCopied: false, reason: 'no-clipboard' } })

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'copy' })
    expect(log.toasts).toEqual(['Could not copy the summary (no-clipboard)'])
  })

  test('lays the meters out as a table when there is room', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface, { bodyColumns: 140 })

      expect(await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░+ 25%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\)/ })).toBeDefined()
      expect(await keysOf(ui)).toContain('refresh')
      await ui.unmount()
    }
  })

  test('keeps the roomy stacked layout in the dock, even with compact_pane on', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
  })

  test('keeps the stacked layout inline and narrow while compact_pane is off', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface, { placement: 'inline', bodyColumns: 80 })

      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
      expect(await keysOf(ui)).toContain('close')
      await ui.unmount()
    }
  })

  test('packs each meter into one line and the facts into a few when it sits inline and narrow', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface, { placement: 'inline', bodyColumns: 80 })

      expect(await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░+ 25%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$12\.50 \/ \$50\.00 · resets in 6d 12h$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\(25%\)/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /60 rpm · 100k tpm · 5 parallel/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Updated/ })).toBeDefined()
      expect(await keysOf(ui)).toContain('refresh')
      await ui.unmount()
    }
  })

  test('falls back to the stacked layout when it sits inline but is too narrow for one-line meters', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal', { placement: 'inline', bodyColumns: 60 })

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
  })

  test('keeps the table, with the full text, when it sits inline and wide', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal', { placement: 'inline', bodyColumns: 124 })

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
  })

  test('shows the setup steps when nothing is configured, and copies them', async ($, on) => {
    const { log, clock } = boot(on, { env: {} })

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      expect(await ui.find({ type: 'Text', text: /ANTHROPIC_BASE_URL is not set/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /claude plugin configure litellm-key/ })).toBeDefined()
      expect((await ui.find({ type: 'Code' }))?.text).toContain('"ANTHROPIC_AUTH_TOKEN": "<your virtual key>"')
      expect(await keysOf(ui)).toEqual(['refresh', 'copy', 'close'])
      await ui.unmount()
    }
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'copy' })
    expect(log.copies[0]).toContain('"ANTHROPIC_BASE_URL": "https://your-litellm-host"')
    expect(log.toasts.at(-1)).toBe('Copied the settings snippet')
  })

  test('warns above the data while showing the last good reading', async ($, on) => {
    let isUp = true
    const routes = { ...standardRoutes(), '/key/info': () => (isUp ? reply(200, keyBody()) : reply(503, 'down')) }
    const { clock } = boot(on, { routes })

    await start($, clock)
    isUp = false
    await run($, 'refresh')
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /Showing the last good reading/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
  })

  test('says why it has nothing, in a box, when the key is refused', async ($, on) => {
    const { clock } = boot(on, { routes: { '/key/info': reply(401, { error: { message: 'bad key', type: 'auth_error', param: 'None', code: '401' } }) } })

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /The proxy rejected the key \(401\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /may be invalid, expired or blocked/ })).toBeDefined()
    expect(await keysOf(ui)).toEqual(['refresh', 'close'])
  })

  test('does not claim to be refreshing once the read is over', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    await run($, 'refresh')
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /refreshing/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Updated/ })).toBeDefined()
  })

  test('shows a bar per meter, filled in the color of its tone, red once the budget is blown', async ($, on) => {
    const { clock } = boot(on, { routes: spending(60) })

    await start($, clock)
    const ui = await mount($, 'terminal')
    const bar = await ui.find({ type: 'Text', text: /^█+ 120%$/ })

    expect(bar?.props.color).toBe('error')
  })

  test('dims the empty track of a bar and colors a healthy one green', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')
    const bar = await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░+ 25%$/ })
    const track = bar?.children.find(child => typeof child === 'object' && child !== null && (child as { type?: string }).type === 'Text') as
      | { props: { color: string } }
      | undefined

    expect(bar?.props.color).toBe('success')
    expect(track?.props.color).toBe('inactive')
  })

  test('marks a meter that is not fine with a sign as well as a color', async ($, on) => {
    const { clock } = boot(on, { routes: spending(42) })

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await texts(ui, /^▲$/)).toHaveLength(1)
    expect(await texts(ui, /^·$/)).toHaveLength(3)
  })

  describe('overview', () => {
    test('sets how far into its period the budget is right under the budget, to be read against it', async ($, on) => {
      const { clock } = boot(on, { routes: spending(42) })

      await start($, clock)
      const ui = await mount($, 'terminal')
      const time = await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░+ 78%$/ })

      expect(time?.props.color).toBe('suggestion')
      expect(await ui.find({ type: 'Text', text: /^Time$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^day 24 of 30 \(78%\) · 6d 12h left$/ })).toBeDefined()
    })

    test('has no time bar when the pace is turned off', { options: { show_forecast: false } }, async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)

      expect(await (await mount($, 'terminal')).find({ type: 'Text', text: /^Time$/ })).toBeUndefined()
    })

    test('shows a mark in the header, and says so below, while it reads', async ($, on) => {
      let isSlow = false
      let wait = async (_ms: number): Promise<void> => {}
      const routes = {
        ...standardRoutes(),
        '/key/info': async () => {
          if (isSlow) {
            await wait(3_000)
          }

          return reply(200, keyBody())
        },
      }
      const { clock } = boot(on, { routes })

      wait = clock.sleep
      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /^↻$/ })).toBeUndefined()
      isSlow = true
      const reading = run($, 'refresh')

      await clock.settle()
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: /^↻$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /· refreshing…$/ })).toBeDefined()
      await clock.advance(3_000)
      await reading
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: /^↻$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /refreshing/ })).toBeUndefined()
    })

    test('says nothing needs attention while all is well', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /Nothing needs attention/ })).toBeDefined()
    })

    test('counts the alerts it has no room for', async ($, on) => {
      const { clock } = boot(on, {
        routes: withKey({
          spend: 42,
          status: 'revoked',
          budget_limits: [{ budget_duration: '1h', max_budget: 1, reset_at: new Date(NOW + 1800_000).toISOString() }],
          budget_limits_usage: { '1h': { current_spend: 2 } },
          model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } },
          model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 6, budget_limit: 5, time_period: '1d' } },
        }),
      })

      await start($, clock)
      const ui = await mount($, 'terminal')

      // Five things need a look; four are listed, the fifth is counted.
      expect(await texts(ui, /^[✗▲] (The key is|Key budget|Window|Model|At this)/)).toHaveLength(4)
      expect(await ui.find({ type: 'Text', text: /^\+1 more$/ })).toBeDefined()
    })

    test('lists what needs a look, with signs', async ($, on) => {
      const { clock } = boot(on, { routes: spending(42) })

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await texts(ui, /^▲ Key budget is at 84%: \$42\.00 of \$50\.00$/)).toHaveLength(1)
      expect(await texts(ui, /^▲ At this pace the key budget runs out in 4d 11h, before it resets$/)).toHaveLength(1)
      expect(await ui.find({ type: 'Text', text: /Nothing needs attention/ })).toBeUndefined()
    })

    test('has one line for the alerts in the compact layout: how many, and the worst', { options: COMPACT }, async ($, on) => {
      const routes = {
        ...withKey({
          spend: 52,
          status: 'revoked',
          budget_limits: [{ budget_duration: '1h', max_budget: 1, reset_at: new Date(NOW + 1800_000).toISOString() }],
          budget_limits_usage: { '1h': { current_spend: 2 } },
        }),
      }
      const { clock } = boot(on, { routes })

      await start($, clock)
      const ui = await mount($, 'terminal', { placement: 'inline', bodyColumns: 90 })

      expect(await texts(ui, /^[✗▲] (\d alerts · )?(The key|Key budget|Window)/)).toEqual(['✗ 3 alerts · The key is revoked'])
      expect(await ui.find({ type: 'Text', text: /more$/ })).toBeUndefined()
    })

    test('has the pace, and when the budget runs out, as rows', async ($, on) => {
      const calm = boot(on)

      await start($, calm.clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /^\$0\.53\/day · on pace for \$15\.96 \(32%\) at the reset$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^in .* before the reset$/ })).toBeUndefined()
    })

    test('show_forecast off takes the pace out of the pane', { options: { show_forecast: false } }, async ($, on) => {
      const { clock } = boot(on, { routes: spending(42) })

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /on pace/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /At this pace/ })).toBeUndefined()
    })

    test('says what was spent since Claude Code started', async ($, on) => {
      let spend = 12.5
      const routes = { ...standardRoutes(), '/key/info': () => reply(200, keyBody({ spend })) }
      const { clock } = boot(on, { routes })

      await start($, clock)
      const before = await mount($, 'terminal')

      expect(await texts(before, /nothing spent since/)).toHaveLength(1)
      await before.unmount()
      spend = 13.75
      await clock.advance(60_000)
      await run($, 'refresh')
      const ui = await mount($, 'terminal')

      expect(await texts(ui, /^\+\$1\.25 since 12:00 \(/)).toHaveLength(1)
    })

    test('draws an arrow after the percentage of a budget that will not last to its reset', async ($, on) => {
      const { clock } = boot(on, { routes: spending(42) })

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await texts(ui, /^ → 107%$/)).toHaveLength(1)
      expect((await ui.find({ type: 'Text', text: /^ → 107%$/ }))?.props.color).toBe('warning')
    })

    test('has no arrow while the pace holds, nor once the budget is over', async ($, on) => {
      const calm = boot(on)

      await start($, calm.clock)
      expect(await texts(await mount($, 'terminal'), / → \d+%/)).toEqual([])
    })

    test('names the proxy and where the key came from, and starts with who the key is and what can be done', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /^litellm\.test · via ANTHROPIC_AUTH_TOKEN$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^prod-claude · sk-\.\.\.7890$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^● active$/ })).toBeDefined()
      expect(await ui.find({ type: 'Link' })).toBeUndefined()
    })

    test('puts the host beside the name in the compact layout, which has no line of its own for it', { options: COMPACT }, async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal', { placement: 'inline', bodyColumns: 100 })

      expect(await ui.find({ type: 'Text', text: /^litellm\.test$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeUndefined()
    })

    test('sums many models up as how many, and which spent most', async ($, on) => {
      const ids = Array.from({ length: 9 }, (_, at) => ({ id: `model-${at}` }))
      const { clock } = boot(on, { routes: { ...standardRoutes(), '/v1/models': reply(200, { data: ids }) } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      expect(await ui.find({ type: 'Text', text: /^11 · most used: claude-sonnet-4-5, claude-opus-4-1$/ })).toBeDefined()
    })
  })

  describe('tabs', () => {
    test('switch with a press on a tab, and the active one is no button', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: / 2: Usage / })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1: Overview/ })).toBeUndefined()
      expect(await keysOf(ui)).toContain('tab-overview')
      expect(await keysOf(ui)).not.toContain('tab-usage')
      await ui.press({ key: 'tab-overview' })
      expect(await ui.find({ type: 'Text', text: / 1: Overview / })).toBeDefined()
    })

    test('give every tab its hotkey', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')
      const hotkeys = Object.fromEntries((await ui.findAll({ type: 'Button' })).map(button => [button.key, button.props.hotkey]))

      expect(hotkeys).toMatchObject({ 'tab-usage': '2', 'tab-models': '3', 'tab-details': '4', refresh: 'r', copy: 'c', close: 'q' })
    })

    test('keep the one that was open when the pane is drawn again', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const first = await mount($, 'terminal')

      await first.press({ key: 'tab-models' })
      const second = await mount($, 'desktop')

      expect(await second.find({ type: 'Text', text: / 3: Models / })).toBeDefined()
    })

    test('copy the tab that is showing', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'copy' })
      await ui.press({ key: 'tab-models' })
      await ui.press({ key: 'copy' })
      await ui.press({ key: 'tab-details' })
      await ui.press({ key: 'copy' })

      expect(log.copies[0]).toContain('Usage · last 7 days · litellm.test')
      expect(log.copies[1]).toContain('Models (3) · spend over the last 7 days')
      expect(log.copies[2]).toContain('Connection')
      expect(JSON.stringify(log.copies)).not.toContain(KEY)
      expect(log.toasts).toEqual(['Copied the usage report', 'Copied the model list', 'Copied the key details'])
    })
  })

  describe('usage', () => {
    test('draws a bar for each day, labeled with its weekday and spend', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
      expect(await texts(ui, /^[ ▁▂▃▄▅▆▇█]{20,}$/)).toHaveLength(6)
      const weekdays = (await ui.findAll({ type: 'Button' })).filter(button => button.key?.startsWith('day-'))

      expect(weekdays.map(button => button.props.label)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
      expect(await ui.find({ type: 'Text', text: /^\$8\.70$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$1\.50$/ })).toBeDefined()
    })

    test('labels the top and the bottom of the axis', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^\s*\$8\.70$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\s*\$0$/ })).toBeDefined()
    })

    test('makes each weekday a button to pick the day, with a hint until one is picked', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect((await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => key?.startsWith('day-'))).toEqual([
        'day-2026-09-27',
        'day-2026-09-28',
        'day-2026-09-29',
        'day-2026-09-30',
        'day-2026-10-01',
        'day-2026-10-02',
        'day-2026-10-03',
      ])
      expect((await ui.find({ key: 'day-2026-10-01' }))?.props).toMatchObject({ label: 'Thu', dimColor: true })
      expect(await ui.find({ type: 'Text', text: /^Pick a day under the chart for its details$/ })).toBeDefined()
    })

    test('says what the picked day did, with its models, and marks the day', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'day-2026-10-03' })
      expect(await ui.find({ type: 'Text', text: /^Sat Oct 3 \(today\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$8\.70 · 90 requests · 1\.7M tokens$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^claude-sonnet-4-5 \$6\.5\d \(75%\) · claude-opus-4-1 \$2\.1\d \(25%\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Pick a day/ })).toBeUndefined()
      expect((await ui.find({ type: 'Text', text: /^Sat$/ }))?.props.inverse).toBe(true)
      expect(await ui.find({ key: 'day-2026-10-03' })).toBeUndefined()
      await ui.press({ key: 'day-2026-09-30' })
      expect(await ui.find({ type: 'Text', text: /^Wed Sep 30$/ })).toBeDefined()
      expect(await ui.find({ key: 'day-2026-10-03' })).toBeDefined()
    })

    test('says a day with nothing in it had no activity', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'day-2026-10-02' })
      expect(await ui.find({ type: 'Text', text: /^no activity$/ })).toBeDefined()
    })

    test('keeps the picked day while it is in the range, and goes back to the hint when it is not', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'day-2026-10-01' })
      await ui.press({ key: 'range-14' })
      expect(await ui.find({ type: 'Text', text: /^Thu Oct 1$/ })).toBeDefined()
      await ui.press({ key: 'range-30' })
      // At 30 days the bars are too close to carry a day each: no buttons, no hint, no day.
      expect(await ui.find({ type: 'Text', text: /^Thu Oct 1$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^Pick a day/ })).toBeUndefined()
      await ui.press({ key: 'range-7' })
      expect(await ui.find({ type: 'Text', text: /^Thu Oct 1$/ })).toBeDefined()
    })

    test('sums the range up and ranks the models with a share bar each', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^\$14\.20 · \$2\.03\/day$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^150 · \$0\.095 each$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^By model, last 7 days/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?░* +75%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$10\.65 · 113 requests/ })).toBeDefined()
    })

    test('steps through 7, 14 and 30 days, with d on the next one', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect((await ui.find({ key: 'range-14' }))?.props.hotkey).toBe('d')
      expect((await ui.find({ key: 'range-30' }))?.props.hotkey).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: / 7d / })).toBeDefined()
      await ui.press({ key: 'range-14' })
      expect(await ui.find({ type: 'Text', text: / 14d / })).toBeDefined()
      expect((await ui.find({ key: 'range-30' }))?.props.hotkey).toBe('d')
      expect(await ui.find({ type: 'Text', text: /^By model, last 14 days/ })).toBeDefined()
      await ui.press({ key: 'range-30' })
      expect((await ui.find({ key: 'range-7' }))?.props.hotkey).toBe('d')
      expect(await texts(ui, /^[ ▁▂▃▄▅▆▇█]{20,}$/)).toHaveLength(6)
      expect(await ui.find({ type: 'Text', text: /^Sep 4 +Oct 3$/ })).toBeDefined()
      expect(log.copies).toEqual([])
    })

    test('remembers the range for the next session', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'range-30' })

      expect(log.stored.prefs).toEqual({ range: 30, sort: 'spend', metric: 'spend' })
    })

    test('starts on the range it remembers', async ($, on) => {
      const { clock } = boot(on, { store: { prefs: { range: 14, sort: 'name' } } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^By model, last 14 days/ })).toBeDefined()
    })

    test('ignores a stored range or sort it does not know', async ($, on) => {
      const { clock } = boot(on, { store: { prefs: { range: 9, sort: 'size' } } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^By model, last 7 days/ })).toBeDefined()
    })

    test('copies the days as CSV', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect((await ui.find({ key: 'csv' }))?.props.hotkey).toBe('v')
      await ui.press({ key: 'csv' })

      expect(log.copies[0]?.split('\n')[0]).toBe('date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens')
      expect(log.copies[0]?.split('\n')).toHaveLength(8)
      expect(log.toasts).toEqual(['Copied 7 days as CSV'])
    })

    test('falls back to a line of blocks where the days will not fit as bars', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal', { bodyColumns: 20 })

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'range-30' })
      expect(await texts(ui, /^[▁-█]{30}$/)).toHaveLength(1)
    })

  })

  describe('usage without a history', () => {
    test('says it is off when show_usage is', { options: { show_usage: false } }, async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /Usage history is off. Turn show_usage on/ })).toBeDefined()
    })

    test('says the key has no user', async ($, on) => {
      const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ user_id: null })) } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /This key has no user/ })).toBeDefined()
    })

    test('says the proxy did not answer', async ($, on) => {
      const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /The proxy did not return usage history/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /usage history unavailable/ })).toBeDefined()
    })
  })

  describe('models', () => {
    const rowsOf = async (ui: Reads) => texts(ui, /^claude-/)

    test('lists the models of the key with what each spent, the biggest first', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect(await ui.find({ type: 'Text', text: /^3 models$/ })).toBeDefined()
      expect(await rowsOf(ui)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
      expect(await ui.find({ type: 'Text', text: /^\$10\.65 · 113 requests$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^no use$/ })).toBeDefined()
    })

    test('lets a model nobody used fade, without a bar', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect((await ui.find({ type: 'Text', text: /^claude-haiku-4-5$/ }))?.props.dimColor).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^claude-sonnet-4-5$/ }))?.props.bold).toBe(true)
      expect(await texts(ui, /^█+[▏▎▍▌▋▊▉]?░* +\d+%$/)).toHaveLength(2)
    })

    test('narrows the list as one types, and says how many are left', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      await ui.input({ key: 'filter', text: 'OPUS', kind: 'change' })
      expect(await rowsOf(ui)).toEqual(['claude-opus-4-1'])
      expect(await ui.find({ type: 'Text', text: /^1 of 3 models$/ })).toBeDefined()
      expect((await ui.find({ key: 'filter' }))?.props.value).toBe('OPUS')
      await ui.input({ key: 'filter', text: 'zzz' })
      expect(await ui.find({ type: 'Text', text: /No model matches "zzz"/ })).toBeDefined()
      await ui.input({ key: 'filter', text: '', kind: 'change' })
      expect(await rowsOf(ui)).toHaveLength(3)
    })

    test('keeps the filter that is on in view, and clears it with a button', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect((await ui.find({ key: 'filter' }))?.props.placeholder).toBe('type to narrow the list')
      expect(await ui.find({ key: 'filter-clear' })).toBeUndefined()
      await ui.input({ key: 'filter', text: 'opus', kind: 'change' })
      // Enter empties the field, so the filter that is still on is what the field says in its place.
      expect((await ui.find({ key: 'filter' }))?.props.placeholder).toBe('opus')
      expect((await ui.find({ key: 'filter-clear' }))?.props).toMatchObject({ label: 'clear', hotkey: 'x' })
      await ui.press({ key: 'filter-clear' })
      expect(await rowsOf(ui)).toHaveLength(3)
      expect((await ui.find({ key: 'filter' }))?.props).toMatchObject({ value: '', placeholder: 'type to narrow the list' })
      expect(await ui.find({ key: 'filter-clear' })).toBeUndefined()
    })

    test('sorts by name or by spend', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect((await ui.find({ key: 'sort' }))?.props).toMatchObject({ label: 'sort: spend', hotkey: 's' })
      await ui.press({ key: 'sort' })
      expect(await rowsOf(ui)).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
      expect((await ui.find({ key: 'sort' }))?.props.label).toBe('sort: name')
      expect(log.stored.prefs).toEqual({ range: 7, sort: 'name', metric: 'spend' })
      await ui.press({ key: 'sort' })
      expect(await rowsOf(ui)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
    })

    test('has a button, with a hotkey, that moves the keyboard to the filter', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect((await ui.find({ key: 'filter-focus' }))?.props).toMatchObject({ label: 'Filter', hotkey: 'f' })
      expect((await ui.find({ key: 'filter' }))?.type).toBe('Input')
      await ui.press({ key: 'filter-focus' })
    })

    test('counts spend over the range that is chosen', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      await ui.press({ key: 'range-14' })
      expect(await ui.find({ type: 'Text', text: /^\$10\.65 · 113 requests$/ })).toBeDefined()
    })

    test('shows the cap a model has', async ($, on) => {
      const { clock } = boot(on, { routes: withKey({ model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } } }) })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect(await ui.find({ type: 'Text', text: /\$3\.55 · 38 requests · cap \$5\.00\/1d/ })).toBeDefined()
    })

    test('has no field where the surface draws none, and still lists the models', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'mobile')

      await ui.press({ key: 'tab-models' })
      expect(await ui.find({ type: 'Input' })).toBeUndefined()
      expect(await ui.find({ key: 'filter-focus' })).toBeUndefined()
      expect(await rowsOf(ui)).toHaveLength(3)
    })

    test('says what it does not know when the proxy lists nothing and nothing was used', async ($, on) => {
      const { clock } = boot(on, {
        routes: { ...standardRoutes(), '/v1/models': reply(500, 'x'), '/user/daily/activity': reply(500, 'x') },
      })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect(await ui.find({ type: 'Text', text: /can call every model the proxy serves/ })).toBeDefined()
    })

    test('stops at a number of rows and says how to reach the rest', async ($, on) => {
      const ids = Array.from({ length: 75 }, (_, at) => ({ id: `model-${String(at).padStart(2, '0')}` }))
      const { clock } = boot(on, { routes: { ...standardRoutes(), '/v1/models': reply(200, { data: ids }) } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      await ui.press({ key: 'sort' })
      // The 75 the proxy lists, and the two the history saw that it did not list.
      expect(await ui.find({ type: 'Text', text: /^77 models$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\+17 more: type in the filter/ })).toBeDefined()
    })
  })

  describe('details', () => {
    test('groups what the proxy said, and links the dashboard', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-details' })
      for (const group of ['Key', 'Budget', 'Limits', 'Connection']) {
        expect(await ui.find({ type: 'Text', text: new RegExp(`^${group}$`) })).toBeDefined()
      }
      expect(await ui.find({ type: 'Text', text: /^01234567…cdef \(sha256\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^via ANTHROPIC_AUTH_TOKEN \(sk-…7890\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^12:00:00 \(just now\) · every 60s$/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Link' })).map(link => link.props.href)).toEqual(['https://litellm.test/ui'])
      expect(await ui.find({ type: 'Text', text: /^Dashboard$/ })).toBeDefined()
      expect(JSON.stringify(await ui.drawn())).not.toContain(KEY)
    })
  })

  test('says how long ago it read, as the clock moves on', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /\(just now\)/ })).toBeDefined()
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /Updated 12:00:00 \(30s ago\) · every 60s/ })).toBeDefined()
  })

  test('says how to give it the keyboard, and which keys then work', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const away = await mount($, 'terminal')

    expect(await away.find({ type: 'Text', text: /ctrl\+x tab, or a click, gives the pane the keyboard/ })).toBeDefined()
    await away.unmount()
    const held = await mount($, 'terminal', { isFocused: true })

    expect(await held.find({ type: 'Text', text: /^1-4 tabs · r refresh · c copy · q or esc close$/ })).toBeDefined()
    expect(await held.find({ type: 'Text', text: /gives the pane the keyboard/ })).toBeUndefined()
  })

  test('on Models, where the filter keeps Esc, the footer says Esc only hands the keys back', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const held = await mount($, 'terminal', { isFocused: true })

    await held.press({ key: 'tab-models' })
    expect(await held.find({ type: 'Text', text: /f filter · q close · esc back to the prompt/ })).toBeDefined()
    expect(await held.find({ type: 'Text', text: /q or esc close/ })).toBeUndefined()
  })

  test('keeps the words about keys and focus for the terminal, where they hold', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface, { isFocused: true })
      const hint = await ui.find({ type: 'Text', text: /1-4 tabs · r refresh/ })

      expect(hint !== undefined).toBe(surface === 'terminal')
      await ui.unmount()
    }
  })

  test('a proxy that sends escape sequences and absurd dates does not take the pane down', async ($, on) => {
    const esc = '\u001b[31m'
    const routes = {
      ...standardRoutes(),
      '/key/info': reply(
        200,
        keyBody({
          key_alias: `${esc}prod\u0000-claude`,
          created_at: 1e16,
          expires: 1e16,
          models: [`${esc}claude\u0007`],
        }),
      ),
      '/v1/models': reply(200, { data: [{ id: `${esc}gpt\u007f-5` }, { id: 'claude-sonnet-4-5' }] }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      for (const tab of ['usage', 'models', 'details', 'overview']) {
        await ui.press({ key: `tab-${tab}` })
        expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
      }
      await ui.unmount()
    }
  })

  test('draws the same tree on every surface, whatever the tab', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      for (const tab of ['usage', 'models', 'details', 'overview']) {
        await ui.press({ key: `tab-${tab}` })
        expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
      }
      await ui.unmount()
    }
  })

  describe('commands and the clock', () => {
    test('/litellm tab opens the pane on that tab, by name or number', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await run($, 'tab usage')
      expect(log.opens).toEqual(['litellm-key'])
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: / 2: Usage / })).toBeDefined()
      await run($, 'tab 3')
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: / 3: Models / })).toBeDefined()
      await run($, 'view details')
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: / 4: Details / })).toBeDefined()
    })

    test('Esc closes the pane, except on the models tab, where it is for leaving the filter', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      await run($, '')
      expect(log.escapes).toEqual([true])
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-models' })
      expect(log.escapes).toEqual([true, false])
      await ui.press({ key: 'tab-usage' })
      expect(log.escapes).toEqual([true, false, true])
      await ui.press({ key: 'tab-details' })
      await ui.press({ key: 'tab-overview' })
      expect(log.escapes).toEqual([true, false, true])
    })

    test('opens straight on the models tab without Esc closing it', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      await run($, 'tab models')
      await run($, 'tab usage')

      expect(log.escapes).toEqual([false, true])
    })

    test('/litellm tab says which tabs there are when it is given a wrong one', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)

      expect((await run($, 'tab nope')).text).toBe('Unknown tab "nope". The tabs are overview, usage, models, details.')
      expect((await run($, 'tab')).text).toContain('The tabs are')
      expect(log.opens).toEqual([])
    })

    test('/litellm opens the pane on the tab it was left on', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-details' })
      await ui.unmount()
      await run($, '')

      expect(await (await mount($, 'terminal')).find({ type: 'Text', text: / 4: Details / })).toBeDefined()
    })

    test('/litellm usage prints the table of days, for 7 days or the range asked', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const week = (await run($, 'usage')).text
      const month = (await run($, 'usage 30')).text
      const odd = (await run($, 'usage 9')).text

      expect(week).toContain('Usage · last 7 days · litellm.test')
      expect(week).toContain('Oct 3   Sat       $8.70        90     1.7M')
      expect(month).toContain('Usage · last 30 days · litellm.test')
      expect(month).toContain('Sep 4')
      expect(odd).toContain('last 7 days')
      expect(week).not.toContain(KEY)
    })

    test('without a pane to draw, /litellm tab prints that tab as text', async ($, on) => {
      const { log, clock } = boot(on, { surfaces: [] })

      await start($, clock)

      expect((await run($, 'tab usage')).text).toContain('Usage · last 7 days')
      expect((await run($, 'tab models')).text).toContain('Models (3) · spend over the last 7 days')
      expect((await run($, 'tab details')).text).toContain('Connection')
      expect((await run($, '')).text).toContain('Connection')
      expect(log.opens).toEqual([])
    })

    test('info has the pace and the session in it', async ($, on) => {
      const { clock } = boot(on, { routes: spending(42) })

      await start($, clock)
      const { text } = await run($, 'info')

      expect(text).toMatch(/Pace\s+\$1\.79\/day · on pace for \$53\.62/)
      expect(text).toMatch(/Session\s+nothing spent since 12:00/)
    })

    test('debug says what the pane is on', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const { text } = await run($, 'debug')

      expect(text).toContain('status line on (bar on)')
      expect(text).toContain('forecast on')
      expect(text).toContain('Pane     overview tab · 7 days · sorted by spend')
    })

    test('the help lists the new commands', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const { text } = await run($, 'help')

      expect(text).toContain('/litellm tab <name>')
      expect(text).toContain('/litellm usage [7|14|30]')
    })

    test('redraws the pane every second while it is open, and not once it is closed', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      expect(log.invalidations).toBe(0)
      await run($, '')
      await clock.advance(3_000)
      expect(log.invalidations).toBe(3)
      await run($, 'close')
      await clock.advance(3_000)
      expect(log.invalidations).toBe(3)
      await run($, '')
      await clock.advance(2_000)
      expect(log.invalidations).toBe(5)
    })

    test('stops redrawing a pane the engine dropped by itself, and starts again when it is opened', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      await run($, '')
      await clock.advance(2_000)
      expect(log.invalidations).toBe(2)

      log.panes.delete('litellm-key')
      await clock.advance(5_000)
      expect(log.invalidations).toBe(2)

      await run($, '')
      await clock.advance(2_000)
      expect(log.invalidations).toBe(4)
    })

    test('debug never prints the credentials that sit in the url', async ($, on) => {
      const { clock } = boot(on, {
        env: { ANTHROPIC_BASE_URL: 'https://bob:p@ss@litellm.test', ANTHROPIC_AUTH_TOKEN: KEY },
      })

      await start($, clock)
      const { text } = await run($, 'debug')

      expect(text).toContain('Proxy    litellm.test (tries https://litellm.test; using https://litellm.test)')
      expect(text).not.toContain('bob')
      expect(text).not.toContain('p@ss')
    })

    test('reads the key every tick, and the models and the usage every ten minutes', async ($, on) => {
      const { net, clock } = boot(on)
      const count = (path: string) => urls(net).filter(url => url === path).length

      await start($, clock)
      expect([count('/key/info'), count('/v1/models'), count('/user/daily/activity')]).toEqual([1, 1, 1])

      await clock.advance(5 * 60_000)
      expect([count('/key/info'), count('/v1/models'), count('/user/daily/activity')]).toEqual([6, 1, 1])

      await clock.advance(6 * 60_000)
      expect(count('/v1/models')).toBe(2)
      expect(count('/user/daily/activity')).toBe(2)
    })

    test('a command reads again only when what it has is older than 15 seconds', async ($, on) => {
      const { net, clock } = boot(on)
      const keyReads = () => urls(net).filter(url => url === '/key/info').length

      await start($, clock)
      await run($, 'info')
      expect(keyReads()).toBe(1)

      await clock.advance(20_000)
      await run($, 'info')
      expect(keyReads()).toBe(2)
    })

    test('keeps one clock for the pane, however often it is opened', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      await run($, '')
      await run($, 'tab usage')
      await run($, 'tab models')
      await clock.advance(2_000)

      expect(log.invalidations).toBe(2)
    })
  })
})

describe('privacy', () => {
  test('the key only ever travels in the authorization header, to the proxy', async ($, on) => {
    const { log, net, clock } = boot(on)

    await start($, clock)
    await run($, 'refresh')
    await run($, 'info')
    await run($, 'debug')

    expect(net.calls.length).toBeGreaterThan(0)
    for (const call of net.calls) {
      expect(call.url.startsWith(BASE)).toBe(true)
      expect(call.url).not.toContain(KEY)
      expect(call.headers.authorization).toBe(`Bearer ${KEY}`)
    }
    expect(JSON.stringify(log)).not.toContain(KEY)
  })
})
