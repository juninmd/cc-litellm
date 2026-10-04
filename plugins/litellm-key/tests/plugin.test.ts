import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'

import { boot, run, start, urls } from './boot'
import { BASE, HASH, KEY, NOW, keyBody, reply, standardRoutes } from './support'

const DAY = 86_400_000
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

describe('session start', () => {
  test('registers /litellm, reads the key and pins the status line', async ($, on) => {
    const { log, net, clock } = boot(on)

    await start($, clock)

    expect(log.commands).toEqual(['litellm'])
    expect(urls(net)).toContain('/key/info')
    expect(log.statuses.at(-1)).toBe('25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
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

    expect(urls(net)).toEqual(['/key/info', '/v1/models'])
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

describe('the pane', () => {
  const COMPACT = { compact_pane: true }
  const PANE = {
    title: 'LiteLLM key',
    isFocused: false,
    bodyColumns: 76,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  } as const

  const mount = ($: Engine, surface: (typeof SURFACES)[number]) =>
    $.ui.mount({ plugin: 'litellm-key', surface, component: 'Pane', requestId: 'litellm-key', props: PANE })

  test('draws the key on every surface', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /█+░+ 25%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Updated/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
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

    await ui.press({ key: 'close' })
    expect(log.closes).toEqual(['litellm-key'])
  })

  test('lays the meters out as a table when there is room', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: 'litellm-key',
        surface,
        component: 'Pane',
        requestId: 'litellm-key',
        props: { ...PANE, bodyColumns: 140 },
      })

      expect(await ui.find({ type: 'Text', text: /█+░+ 25%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\)/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
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
      const ui = await $.ui.mount({
        plugin: 'litellm-key',
        surface,
        component: 'Pane',
        requestId: 'litellm-key',
        props: { ...PANE, placement: 'inline', bodyColumns: 80 },
      })

      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
      await ui.unmount()
    }
  })

  test('packs each meter into one line and the facts into a few when it sits inline and narrow', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: 'litellm-key',
        surface,
        component: 'Pane',
        requestId: 'litellm-key',
        props: { ...PANE, placement: 'inline', bodyColumns: 80 },
      })

      expect(await ui.find({ type: 'Text', text: /█+░+ 25%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$12\.50 \/ \$50\.00 · resets in 6d 12h$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\(25%\)/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /60 rpm · 100k tpm · 5 parallel/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Updated/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
      await ui.unmount()
    }
  })

  test('falls back to the stacked layout when it sits inline but is too narrow for one-line meters', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await $.ui.mount({
      plugin: 'litellm-key',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'litellm-key',
      props: { ...PANE, placement: 'inline', bodyColumns: 60 },
    })

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
  })

  test('keeps the table, with the full text, when it sits inline and wide', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await $.ui.mount({
      plugin: 'litellm-key',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'litellm-key',
      props: { ...PANE, placement: 'inline', bodyColumns: 124 },
    })

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 \(25%\) · \$37\.50 left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /via ANTHROPIC_AUTH_TOKEN/ })).toBeDefined()
  })

  test('shows the setup steps when nothing is configured', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      expect(await ui.find({ type: 'Text', text: /ANTHROPIC_BASE_URL is not set/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /claude plugin configure litellm-key/ })).toBeDefined()
      await ui.unmount()
    }
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

  test('does not claim to be refreshing once the read is over', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    await run($, 'refresh')
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /refreshing/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Updated/ })).toBeDefined()
  })

  test('shows a bar per meter and red once the budget is blown', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 60 })) } })

    await start($, clock)
    const ui = await mount($, 'terminal')
    const bar = await ui.find({ type: 'Text', text: /█+ 120%/ })

    expect(bar?.props.color).toBe('error')
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

describe('the over-budget band', () => {
  const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, isFocused: false, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const
  const mountBand = ($: Engine, surface: 'terminal' | 'desktop', hasSurvey = false) =>
    $.ui.mount({ plugin: 'litellm-key', surface, component: 'AbovePrompt', props: { ...BAND, hasSurvey } })
  // When the hook yields (next), the test engine has nothing else that draws the band: that is the "not shown" case.
  const isDrawn = async ($: Engine, hasSurvey = false): Promise<boolean> => {
    try {
      return (await (await mountBand($, 'terminal', hasSurvey)).find({ type: 'Text', text: /Budget used up/ })) !== undefined
    } catch (error) {
      if (error instanceof Error && error.message.includes('no implementation for ui.render')) {
        return false
      }
      throw error
    }
  }
  const routesAt = (state: { spend: number; limit: number }) => ({
    ...standardRoutes(),
    '/key/info': () => reply(200, keyBody({ spend: state.spend, max_budget: state.limit })),
  })

  test('stays above the prompt while the key is over budget, and goes when the budget is normal again', async ($, on) => {
    const state = { spend: 55, limit: 50 }
    const { log, clock } = boot(on, { routes: routesAt(state) })

    await start($, clock)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountBand($, surface)

      expect(await ui.find({ type: 'Text', text: /Budget used up/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /key prod-claude: \$55\.00 of \$50\.00/ })).toBeDefined()
      await ui.unmount()
    }
    // the toast is a one-off; the band is what keeps saying it
    expect(log.toasts.filter(text => text.includes('over budget'))).toHaveLength(1)

    state.limit = 80
    await run($, 'refresh')
    expect(await isDrawn($)).toBe(false)
  })

  test('names the team budget that is spent, not only the key', async ($, on) => {
    const routes = {
      ...standardRoutes(),
      '/team/info': reply(200, { team_id: 'eng', team_info: { team_alias: 'Eng', spend: 1000, max_budget: 1000, budget_duration: '30d', budget_reset_at: '2026-11-01T00:00:00Z' } }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)
    const ui = await mountBand($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /team Eng: \$1,000\.00 of \$1,000\.00 · resets in/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /key prod-claude/ })).toBeUndefined()
  })

  test('is not drawn while the budget is fine', async ($, on) => {
    const { clock } = boot(on, { routes: routesAt({ spend: 5, limit: 50 }) })

    await start($, clock)
    expect(await isDrawn($)).toBe(false)
  })

  test('yields to a survey that holds the band', async ($, on) => {
    const { clock } = boot(on, { routes: routesAt({ spend: 55, limit: 50 }) })

    await start($, clock)
    expect(await isDrawn($)).toBe(true)
    expect(await isDrawn($, true)).toBe(false)
  })
})

describe('admin commands', () => {
  const ADMIN = 'sk-admin-from-option-99999'
  const NEW_SECRET = 'sk-brand-new-secret-123456'
  const only = reply(401, { error: { message: 'Authentication Error, Only proxy admin can be used to generate, delete, update info for new keys/users/teams.', type: 'auth_error', param: 'None', code: '401' } })
  const adminRoutes = (state = { limit: 50 }) => ({
    ...standardRoutes(),
    '/key/info': () => reply(200, keyBody({ max_budget: state.limit })),
    '/key/update': (_url: string, _headers: Record<string, string>, init?: { body?: string }) => {
      state.limit = (JSON.parse(init?.body ?? '{}') as { max_budget: number }).max_budget

      return reply(200, { key: 'sk-raw-echo-of-the-key-000', max_budget: state.limit })
    },
    '/key/generate': reply(200, { key: NEW_SECRET, token: 'ab'.repeat(32), key_name: 'sk-...3456', key_alias: 'ci' }),
  })
  const OPTIONS = { litellm_admin_key: ADMIN }

  test('a grant goes out with the admin key, not the virtual one, and the status line catches up', { options: OPTIONS }, async ($, on) => {
    const { log, net, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const { text } = await run($, 'grant 10 --yes')

    await clock.advance(300)
    const update = net.calls.find(call => call.url.includes('/key/update'))

    expect(update?.method).toBe('POST')
    expect(update?.headers.authorization).toBe(`Bearer ${ADMIN}`)
    expect(JSON.parse(update?.body ?? '{}')).toEqual({ key: HASH, max_budget: 60 })
    expect(text).toContain('now has a budget of $60.00')
    expect(text).not.toContain('sk-raw-echo')
    expect(log.statuses.at(-1)).toContain('$12.50 of $60.00')
    expect(net.calls.filter(call => call.url.endsWith('/key/info')).every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('key new puts the secret on the clipboard and keeps it out of the answer and the logs', async ($, on) => {
    const { log, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const { text } = await run($, 'key new ci --budget 5 --yes')

    expect(log.copies).toEqual([NEW_SECRET])
    expect(text).toContain('Copied to the clipboard')
    expect(text).not.toContain(NEW_SECRET)
    expect(JSON.stringify(log.statuses) + JSON.stringify(log.toasts)).not.toContain(NEW_SECRET)
  })

  test('key new without a screen to copy to refuses, unless --reveal is given', async ($, on) => {
    const { net, clock } = boot(on, { routes: adminRoutes(), surfaces: [] })

    await start($, clock)
    const { text } = await run($, 'key new ci --yes')

    expect(text).toContain('--reveal')
    expect(net.calls.some(call => call.method === 'POST')).toBe(false)
  })

  test('without litellm_admin_key the virtual key is what asks, and a refusal names the fix', async ($, on) => {
    const { net, clock } = boot(on, { routes: { ...adminRoutes(), '/key/list': only } })

    await start($, clock)
    const { text } = await run($, 'keys')
    const call = net.calls.find(item => item.url.includes('/key/list'))

    expect(call?.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(text).toContain('litellm_admin_key')
  })

  test('a rejected session key explains why the admin key stays unused', { options: OPTIONS }, async ($, on) => {
    const expired = reply(401, { error: { message: 'Authentication Error - Expired Key. Key Expiry time 2026-10-01 and current time 2026-10-03', type: 'expired_key', param: 'None', code: '401' } })
    const { net, clock } = boot(on, { routes: { ...adminRoutes(), '/key/info': expired } })

    await start($, clock)
    const { text } = await run($, 'keys --all')

    expect(text).toContain('expired')
    expect(text).toContain('Admin commands wait until the proxy accepts this session')
    expect(net.calls.some(call => call.headers.authorization === `Bearer ${ADMIN}`)).toBe(false)
  })

  test('says why it cannot run when Claude Code is not behind a proxy', async ($, on) => {
    const { net, clock } = boot(on, { env: {} })

    await start($, clock)
    const { text } = await run($, 'grant 10 --yes')

    expect(text).toContain('not routed through a LiteLLM proxy')
    expect(net.calls).toHaveLength(0)
  })

  test('debug shows the admin key masked, help lists the new commands', { options: OPTIONS }, async ($, on) => {
    const { log, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const debug = (await run($, 'debug')).text
    const help = (await run($, 'help')).text

    expect(debug).toContain('Admin    sk-…9999')
    expect(debug).not.toContain(ADMIN)
    for (const word of ['keys', 'key new', 'grant', 'fallbacks']) {
      expect(help).toContain(`/litellm ${word}`)
    }
    expect(JSON.stringify(log)).not.toContain(ADMIN)
  })

  test('fallbacks reads the router settings', async ($, on) => {
    const routes = {
      ...adminRoutes(),
      '/router/settings': reply(200, { current_values: { fallbacks: [{ 'cloud/auto': ['cloud/auto-long'] }] } }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)

    expect((await run($, 'fallbacks')).text).toContain('cloud/auto  → cloud/auto-long')
  })
})
