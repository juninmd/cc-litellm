import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { BASE, KEY, NOW, keyBody, reply, router, standardRoutes } from './support'
import type { Route } from './support'

const DAY = 86_400_000
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

type Setup = {
  routes?: Record<string, Route>
  env?: Record<string, string>
  settingsEnv?: Record<string, string>
  surfaces?: readonly RenderSurface[]
  store?: Record<string, unknown>
  open?: { isPlaced: boolean; reason?: string }
}

const boot = (on: On, setup: Setup = {}) => {
  const log = {
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    opens: [] as string[],
    closes: [] as string[],
    copies: [] as string[],
    commands: [] as string[],
  }
  const net = router(setup.routes ?? standardRoutes())
  const clock = mock.clock(on, { now: NOW })

  mock.store(on, setup.store)
  mock.env(on, setup.env ?? { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('settings.read', () => ({ value: setup.settingsEnv ? { env: setup.settingsEnv } : {} }))
  on('session.surfaces', () => ({ value: setup.surfaces ?? ['terminal'] }))
  on('command.register', (_$, e) => {
    log.commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('http.fetch', async (_$, e) => {
    const answer = await net.http(e.url, e.init?.headers ?? {})

    return { value: { status: answer.status, ok: answer.status < 300, headers: {}, text: answer.text } }
  })
  on('ui.status', (_$, e) => {
    log.statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    log.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    log.opens.push(e.id)

    return { value: setup.open ? { isPlaced: setup.open.isPlaced, reason: setup.open.reason ?? '' } : { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    log.closes.push(e.id)

    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    log.copies.push(e.text)

    return { value: { isCopied: true } }
  })

  return { log, net, clock }
}

const run = ($: Engine, args: string) =>
  $.command.run({
    command: 'litellm',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 100 },
  })

const start = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await clock.advance(300)
}

const urls = (net: { calls: { url: string }[] }) => net.calls.map(call => call.url.replace(BASE, '').split('?')[0] ?? '')

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
      store: { notified: ['budget:sk-...7890:' + Date.parse('2026-10-10T00:00:00Z') / 60_000 + ':80'] },
    })

    await start($, clock)

    expect(log.toasts).toEqual([])
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
