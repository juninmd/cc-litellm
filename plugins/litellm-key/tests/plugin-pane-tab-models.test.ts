import { describe, expect, test } from 'claude-code/testing'

import { boot, start } from './boot'
import type { Reads } from './pane-kit'
import { mount, texts } from './pane-kit'
import { KEY, reply, standardRoutes, withKey } from './support'

const rowsOf = (ui: Reads) => texts(ui, /^claude-/)

/** The standard key, with the pane already open on the Models tab. */
const modelsTab = async (...[$, on, setup]: [Parameters<typeof start>[0], Parameters<typeof boot>[0], Parameters<typeof boot>[1]?]) => {
  const { log, clock } = boot(on, setup)

  await start($, clock)
  const ui = await mount($, 'terminal')

  await ui.press({ key: 'tab-models' })

  return { ui, log }
}

describe('the models tab', () => {
  test('lists the models of the key with what each spent, the biggest first', async ($, on) => {
    const { ui } = await modelsTab($, on)

    expect(await ui.find({ type: 'Text', text: /^3 models$/ })).toBeDefined()
    expect(await rowsOf(ui)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
    expect(await ui.find({ type: 'Text', text: /^\$10\.65 · 0 requests$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^no use$/ })).toBeDefined()
  })

  test('lets a model nobody used fade, without a bar', async ($, on) => {
    const { ui } = await modelsTab($, on)

    expect((await ui.find({ type: 'Text', text: /^claude-haiku-4-5$/ }))?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^claude-sonnet-4-5$/ }))?.props.bold).toBe(true)
    expect(await texts(ui, /^▄+▁* +\d+%$/)).toHaveLength(2)
  })

  test('narrows the list as one types, and says how many are left', async ($, on) => {
    const { ui } = await modelsTab($, on)

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
    const { ui } = await modelsTab($, on)

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

  test('sorts by name or by spend, and remembers how', async ($, on) => {
    const { ui, log } = await modelsTab($, on)

    expect((await ui.find({ key: 'sort' }))?.props).toMatchObject({ label: 'sort: spend', hotkey: 's' })
    await ui.press({ key: 'sort' })
    expect(await rowsOf(ui)).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
    expect((await ui.find({ key: 'sort' }))?.props.label).toBe('sort: name')
    expect(log.stored.prefs).toEqual({ range: 7, sort: 'name', metric: 'spend' })
    await ui.press({ key: 'sort' })
    expect(await rowsOf(ui)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
  })

  test('has a button, with a hotkey, that moves the keyboard to the filter', async ($, on) => {
    const { ui } = await modelsTab($, on)

    expect((await ui.find({ key: 'filter-focus' }))?.props).toMatchObject({ label: 'Filter', hotkey: 'f' })
    expect((await ui.find({ key: 'filter' }))?.type).toBe('Input')
    await ui.press({ key: 'filter-focus' })
  })

  test('counts spend over the range that is chosen', async ($, on) => {
    const { ui } = await modelsTab($, on)

    await ui.press({ key: 'range-14' })
    expect(await ui.find({ type: 'Text', text: /^\$10\.65 · 0 requests$/ })).toBeDefined()
  })

  test('shows the cap a model has', async ($, on) => {
    const { ui } = await modelsTab($, on, { routes: withKey({ model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } } }) })

    expect(await ui.find({ type: 'Text', text: /\$3\.55 · 0 requests · cap \$5\.00\/1d/ })).toBeDefined()
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
    const { ui } = await modelsTab($, on, { routes: { ...standardRoutes(), '/v1/models': reply(500, 'x'), '/user/daily/activity': reply(500, 'x') } })

    expect(await ui.find({ type: 'Text', text: /can call every model the proxy serves/ })).toBeDefined()
  })

  test('says why there are no amounts when there is no history', async ($, on) => {
    const { ui } = await modelsTab($, on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(500, 'x') } })

    expect(await rowsOf(ui)).toHaveLength(3)
    expect(await ui.find({ type: 'Text', text: /No usage history, so no amounts/ })).toBeDefined()
  })

  test('stops at a number of rows and says how to reach the rest', async ($, on) => {
    const ids = Array.from({ length: 75 }, (_, at) => ({ id: `model-${String(at).padStart(2, '0')}` }))
    const { ui } = await modelsTab($, on, { routes: { ...standardRoutes(), '/v1/models': reply(200, { data: ids }) } })

    await ui.press({ key: 'sort' })
    // The 75 the proxy lists, and the two the history saw that it did not list.
    expect(await ui.find({ type: 'Text', text: /^77 models$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+17 more: type in the filter/ })).toBeDefined()
  })
})

describe('the details tab', () => {
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

  test('says the version and database of the proxy, and how long /key/info took', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/health/readiness': reply(200, { litellm_version: '1.77.0', db: 'connected' }) } })

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-details' })
    expect(await ui.find({ type: 'Text', text: /^v1\.77\.0 · database connected$/ })).toBeDefined()
    // the mock clock does not move during a request: no time to say, and no made-up one
    expect(await ui.find({ type: 'Text', text: /ms to read \/key\/info/ })).toBeUndefined()
  })
})
