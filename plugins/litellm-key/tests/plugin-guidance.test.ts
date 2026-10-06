import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { boot, run, start, urls } from './boot'
import { keyBody, reply, standardRoutes } from './support'

const ALERT = "Today's spend is $8.70, over your daily alert of $5.00"
const toldOf = (toasts: string[]) => toasts.filter(text => text.startsWith("Today's spend"))
const reads = (net: Parameters<typeof urls>[0]) => urls(net).filter(url => url === '/user/daily/activity').length

describe('the daily alert', () => {
  test('is told once when today passes it, and not again on the next readings', { options: { daily_alert: 5 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    expect(toldOf(log.toasts)).toEqual([ALERT])

    await clock.advance(5 * 60_000)
    expect(toldOf(log.toasts)).toEqual([ALERT])
  })

  test('is not told again in a later session of the same day', { options: { daily_alert: 5 } }, async ($, on) => {
    const { log, clock } = boot(on, { store: { notified: ['daily:2026-10-03:5'] } })

    await start($, clock)

    expect(toldOf(log.toasts)).toEqual([])
  })

  test('is told again when the limit changes: a new limit is a new warning', { options: { daily_alert: 6 } }, async ($, on) => {
    const { log, clock } = boot(on, { store: { notified: ['daily:2026-10-03:5'] } })

    await start($, clock)

    expect(toldOf(log.toasts)).toEqual(["Today's spend is $8.70, over your daily alert of $6.00"])
  })

  test('puts today on the status line while it is over, and nothing is said while it is under', { options: { daily_alert: 5 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.statuses.at(-1)).toContain(' · today $8.70 (alert $5.00)')
  })

  test('is quiet when today stays under it', { options: { daily_alert: 20 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(toldOf(log.toasts)).toEqual([])
    expect(log.statuses.at(-1)).not.toContain('today')
  })

  test('is off by default', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(toldOf(log.toasts)).toEqual([])
    expect(log.statuses.at(-1)).not.toContain('today')
  })

  test('has the usage history read every three minutes, since today is the figure it watches', { options: { daily_alert: 5 } }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = reads(net)

    await clock.advance(120_000)
    expect(reads(net)).toBe(first)
    await clock.advance(130_000)
    expect(reads(net)).toBe(first + 1)
  })

  test('without it the history is read every ten minutes, as before', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = reads(net)

    await clock.advance(250_000)
    expect(reads(net)).toBe(first)
    await clock.advance(450_000)
    expect(reads(net)).toBe(first + 1)
  })
})

describe('show_toasts', () => {
  const NEAR = { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 45 })) }

  test('is on by default: a budget near its cap is a toast', async ($, on) => {
    const { log, clock } = boot(on, { routes: NEAR })

    await start($, clock)

    expect(log.toasts).toContain('90% of the key budget is used ($45.00 of $50.00)')
  })

  test('off keeps the warnings to the status line, the pane and the command', { options: { show_toasts: false, daily_alert: 5 } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: NEAR })

    await start($, clock)

    expect(log.toasts).toEqual([])
    expect(log.statuses.at(-1)).toContain('90% of budget')
    expect(log.statuses.at(-1)).toContain('today $8.70')
    expect((await run($, 'info')).text).toContain('$45.00 / $50.00')
  })

  test('off keeps the failures out of the toasts too, and the status line says it', { options: { show_toasts: false } }, async ($, on) => {
    const routes = { '/key/info': reply(401, { error: { message: 'bad key', type: 'auth_error', code: '401', param: 'None' } }) }
    const { log, clock } = boot(on, { routes })

    await start($, clock)

    expect(log.toasts).toEqual([])
    expect(log.statuses.at(-1)).toBe('key rejected (401)')
  })
})

describe('what the session spent', () => {
  const growing = (spend: { now: number; isDown?: boolean }) => ({
    ...standardRoutes(),
    '/key/info': () => (spend.isDown ? reply(500, 'boom') : reply(200, keyBody({ spend: spend.now }))),
  })

  test('starts from nothing, and counts what each reading adds', async ($, on) => {
    const spend = { now: 12.5 }
    const { clock } = boot(on, { routes: growing(spend) })

    await start($, clock)
    expect((await run($, 'info')).text).toMatch(/Session +nothing spent since \d\d:\d\d \(just now\)/)

    spend.now = 13.1
    await run($, 'refresh')
    expect((await run($, 'info')).text).toMatch(/Session +\+\$0\.60 since \d\d:\d\d \(just now\)/)

    spend.now = 13.4
    await run($, 'refresh')
    expect((await run($, 'info')).text).toMatch(/Session +\+\$0\.90 since/)
  })

  test('says the rate once half an hour has gone by', async ($, on) => {
    const spend = { now: 12.5 }
    const { clock } = boot(on, { routes: growing(spend) })

    await start($, clock)
    spend.now = 13.1
    await clock.advance(60 * 60_000)

    expect((await run($, 'info')).text).toMatch(/Session +\+\$0\.60 since \d\d:\d\d \(1h ago\) · \$0\.60\/h/)
  })

  test('survives a reset of the budget: a spend far below the last counts whole', async ($, on) => {
    const spend = { now: 40 }
    const { clock } = boot(on, { routes: growing(spend) })

    await start($, clock)
    spend.now = 2
    await run($, 'refresh')

    expect((await run($, 'info')).text).toMatch(/Session +\+\$2\.00 since/)
  })

  test('is kept while the proxy is unreachable, with the last good reading', async ($, on) => {
    const spend = { now: 12.5, isDown: false }
    const { clock } = boot(on, { routes: growing(spend) })

    await start($, clock)
    spend.now = 13.5
    await run($, 'refresh')
    spend.isDown = true
    await run($, 'refresh')
    const { text } = await run($, 'info')

    expect(text).toMatch(/Session +\+\$1\.00 since/)
    expect(text).toContain('(stale)')
  })
})

describe('the pane', () => {
  const mount = ($: Engine, surface: 'terminal' | 'mobile') =>
    $.ui.mount({
      plugin: 'litellm-key',
      surface,
      component: 'Pane',
      requestId: 'litellm-key',
      props: { title: 'LiteLLM key', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })

  test('says what the key can spend a day, what a request costs, what today did and what the session spent', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const surface of ['terminal', 'mobile'] as const) {
      const ui = await mount($, surface)

      expect(await ui.find({ type: 'Text', text: /\$5\.77\/day to last until the reset/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /about 396 more requests at \$0\.095 each/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$8\.70 · 90 requests · 4\.7× the usual day \(\$1\.83\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /nothing spent since \d\d:\d\d/ })).toBeDefined()
      await ui.unmount()
    }
  })
})
