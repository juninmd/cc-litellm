import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { boot, run, start, urls } from './boot'
import { BASE, KEY, keyBody, reply, standardRoutes } from './support'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
// the filled part of a bar (whole cells and one partial eighth) and its track
const FILLED = /^[█▏▎▍▌▋▊▉]+$/
const TRACK = /^░+$/

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
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: FILLED })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: TRACK })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ 25%$/ })).toBeDefined()
      // the percentage sits beside the bar once, not again in the amounts
      expect(await ui.find({ type: 'Text', text: /\(25%\)/ })).toBeUndefined()
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

      expect(await ui.find({ type: 'Text', text: FILLED })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left · resets in 6d 12h \(30d\)/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
      await ui.unmount()
    }
  })

  test('keeps the roomy stacked layout in the dock, even with compact_pane on', { options: COMPACT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left · resets in 6d 12h \(30d\)/ })).toBeDefined()
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

      expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left · resets in 6d 12h \(30d\)/ })).toBeDefined()
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

      expect(await ui.find({ type: 'Text', text: FILLED })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ 25%$/ })).toBeDefined()
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

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left · resets in 6d 12h \(30d\)/ })).toBeDefined()
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

    expect(await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left · resets in 6d 12h \(30d\)/ })).toBeDefined()
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
    const bar = await ui.find({ type: 'Text', text: /^█+$/ })
    const share = await ui.find({ type: 'Text', text: /120%/ })

    expect(bar?.props.color).toBe('error')
    expect(share?.props.color).toBe('error')
    // not color alone: the mark is there for anyone who cannot tell red from green
    expect(await ui.find({ type: 'Text', text: /^✖$/ })).toBeDefined()
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
