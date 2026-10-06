import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { boot, start } from './boot'
import { keyBody, reply, standardRoutes } from './support'

const PANE = {
  title: 'LiteLLM key',
  isFocused: false,
  bodyColumns: 76,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

const mount = ($: Engine, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: 'litellm-key', surface: 'terminal', component: 'Pane', requestId: 'litellm-key', props: { ...PANE, ...props } })

const spending = (spend: number) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody({ spend })) })

describe('how the pane looks', () => {
  test('an empty budget reads as an empty bar: the track is dim and nothing is filled', { options: { show_related: false, show_usage: false } }, async ($, on) => {
    const { clock } = boot(on, { routes: spending(0) })

    await start($, clock)
    const ui = await mount($)

    expect(await ui.find({ type: 'Text', text: /^█/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^░+$/ }))?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^ {2}0%$/ })).toBeDefined()
  })

  test('color is never the only signal: a mark sits beside a budget that is not fine', async ($, on) => {
    const { clock } = boot(on, { routes: spending(45) })

    await start($, clock)
    const ui = await mount($)

    expect(await ui.find({ type: 'Text', text: /^▲$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /90%/ }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /^✖$/ })).toBeUndefined()
  })

  test('99.6% reads 100% on screen but the proxy still answers: a warning, not the cross of a spent-up budget', async ($, on) => {
    const { clock } = boot(on, { routes: spending(49.8) })

    await start($, clock)
    const ui = await mount($)

    expect(await ui.find({ type: 'Text', text: /^100%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▲$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✖$/ })).toBeUndefined()
  })

  test('the wide table carries the marks too: a cross when spent up', async ($, on) => {
    const { clock } = boot(on, { routes: spending(55) })

    await start($, clock)
    const ui = await mount($, { bodyColumns: 140 })

    expect(await ui.find({ type: 'Text', text: /^✖$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /110%/ }))?.props.color).toBe('error')
  })

  test('a share past 999% is capped, so five digits never touch the amounts', async ($, on) => {
    const { clock } = boot(on, { routes: spending(625) })

    await start($, clock)
    const ui = await mount($, { bodyColumns: 140 })

    expect(await ui.find({ type: 'Text', text: /^999%\+$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$625\.00 \/ \$50\.00/ })).toBeDefined()
  })

  test('the compact layout keeps the mark too, and still fits the amounts on the line', { options: { compact_pane: true } }, async ($, on) => {
    const { clock } = boot(on, { routes: spending(45) })

    await start($, clock)
    const ui = await mount($, { placement: 'inline', bodyColumns: 80 })

    expect(await ui.find({ type: 'Text', text: /^▲$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$45\.00 \/ \$50\.00 · resets in 6d 12h$/ })).toBeDefined()
  })

  test('the amounts and the percentage are never drawn dim: they are what the pane is for', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($)

    expect((await ui.find({ type: 'Text', text: /\$12\.50 \/ \$50\.00 · \$37\.50 left/ }))?.props.dimColor).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /25%/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /prod-claude/ }))?.props.bold).toBe(true)
  })

  test('the status is a chip, and its word carries the meaning', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const chip = await (await mount($)).find({ type: 'Text', text: /● active/ })

    expect(chip?.props.inverse).toBe(true)
    expect(chip?.props.color).toBe('success')
  })

  test('the dock gets titled sections and the week, with a letter under each day', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($)

    for (const title of ['BUDGETS', 'KEY', 'LAST 7 DAYS']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${title}$`) })).toBeDefined()
    }
    // 27 Sep to 3 Oct (a Saturday): three empty days, then 1.5, 4, nothing and 8.7
    expect(await ui.find({ type: 'Text', text: /^···▂▄·█$/ })).toBeDefined()
    const letters = await ui.find({ type: 'Text', text: /^SMTWTFS$/ })

    expect(letters).toBeDefined()
    expect(letters?.props.dimColor).toBeFalsy()
  })

  test('rows are scarce inline, so there it keeps no titles', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, { placement: 'inline', bodyColumns: 80 })

    for (const title of ['BUDGETS', 'KEY', 'LAST 7 DAYS']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${title}$`) })).toBeUndefined()
    }
    expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Last 7 days$/ })).toBeDefined()
  })

  test('each button names its key, because no surface draws the hotkey, and nothing else repeats them', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($)
    const buttons = await ui.findAll({ type: 'Button' })

    expect(buttons.map(button => [button.props.label, button.props.hotkey])).toEqual([
      ['Usage', '2'],
      ['Models', '3'],
      ['Details', '4'],
      ['Refresh (r)', 'r'],
      ['Copy (c)', 'c'],
      ['Close (q)', 'q'],
    ])
    expect(await ui.find({ type: 'Text', text: /r refresh/ })).toBeUndefined()
  })

  test('the failure state keeps its keys too, without Copy, and its hint is not dim', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const ui = await mount($)

    expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['Refresh (r)', 'Close (q)'])
    const hint = await ui.find({ type: 'Text', text: /claude plugin configure litellm-key/ })

    expect(hint).toBeDefined()
    expect(hint?.props.dimColor).toBeFalsy()
  })
})
