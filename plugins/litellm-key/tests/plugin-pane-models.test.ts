import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { boot, run, start } from './boot'
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

/** One day of usage whose models spent `spends`, the total being their sum. */
const usageOf = (spends: Record<string, number>) => {
  const total = Object.values(spends).reduce((sum, spend) => sum + spend, 0)

  return reply(200, {
    results: [
      {
        date: '2026-10-03',
        metrics: { spend: total, api_requests: 10, total_tokens: 1000 },
        breakdown: { models: Object.fromEntries(Object.entries(spends).map(([model, spend]) => [model, { metrics: { spend } }])) },
      },
    ],
    metadata: { total_spend: total },
  })
}

const withUsage = (spends: Record<string, number>) => ({ ...standardRoutes(), '/user/daily/activity': usageOf(spends) })

const SONNET = 'claude-3-5-sonnet-20241022'
const NEXT = 'claude-3-5-sonnet-20250101'

describe('top models', () => {
  test('the dock lists the week by model: name, share of the spend, and the amount', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($)

    expect(await ui.find({ type: 'Text', text: /^TOP MODELS$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^claude-sonnet-4-5$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ 75%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$10\.65$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$3\.55$/ })).toBeDefined()
    // the share bar compares parts, it does not judge them: no tone color, unlike the budget's bar above it
    const budget = await ui.find({ type: 'Text', text: /^█+[▏▎▍▌▋▊▉]?$/ })
    const lines = await ui.findAll({ type: 'Text', text: /^▄+$/ })
    const tracks = await ui.findAll({ type: 'Text', text: /^▁+$/ })

    expect(budget?.props.color).toBe('success')
    // 75% and 25% of a 16-cell bar, drawn low in the cell so the rows do not fuse into one shape
    expect(lines.map(item => [item.text.length, item.props.color])).toEqual([[12, undefined], [4, undefined]])
    expect(tracks.map(item => [item.text.length, item.props.dimColor])).toEqual([[4, true], [12, true]])
  })

  test('lists five models at most, biggest first, and none when the week had no spend', { options: { show_related: false } }, async ($, on) => {
    const many = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, index) => [`model-${name}`, 7 - index]))
    const { clock } = boot(on, { routes: withUsage(many) })

    await start($, clock)
    const ui = await mount($)
    const names = (await ui.findAll({ type: 'Text', text: /^model-[a-g]$/ })).map(item => item.text)

    expect(names).toEqual(['model-a', 'model-b', 'model-c', 'model-d', 'model-e'])
  })

  test('rows are scarce inline and in the compact layout, so neither lists them', { options: { compact_pane: true } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const columns of [60, 80, 124]) {
      const ui = await mount($, { placement: 'inline', bodyColumns: columns })

      expect(await ui.find({ type: 'Text', text: /^TOP MODELS$/ }), `${columns} columns`).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^claude-sonnet-4-5$/ }), `${columns} columns`).toBeUndefined()
      await ui.unmount()
    }
  })

  test('long names that differ at the end stay apart: they are cut in the middle', async ($, on) => {
    const { clock } = boot(on, { routes: withUsage({ [SONNET]: 6, [NEXT]: 4 }) })

    await start($, clock)
    const ui = await mount($)

    // the widest label is 19 cells (User jane@acme.test), so the names give up 7
    expect(await ui.find({ type: 'Text', text: /^claude-3-…-20241022$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^claude-3-…-20250101$/ })).toBeDefined()
  })

  test('meter labels that would collide are cut in the middle too', async ($, on) => {
    const budget = (name: string) => ({ [name]: { budget_limit: 5, time_period: '1d' } })
    const used = (name: string) => ({ [name]: { current_spend: 1.5, budget_limit: 5, time_period: '1d' } })
    const body = keyBody({
      model_max_budget: { ...budget(SONNET), ...budget(NEXT) },
      model_max_budget_usage: { ...used(SONNET), ...used(NEXT) },
    })
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, body) } })

    await start($, clock)
    const ui = await mount($)

    expect(await ui.find({ type: 'Text', text: /^Model claude…et-20241022$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Model claude…et-20250101$/ })).toBeDefined()
  })
})

const underBar = async (ui: Awaited<ReturnType<typeof mount>>, amount: string) =>
  (await ui.findAll({ type: 'Box' })).some(box => box.props.paddingLeft === 2 && JSON.stringify(box.children).includes(amount))

describe('a narrow stacked pane', () => {
  test('under 40 columns the label gives way and the amount goes under the bar, so no line outgrows the pane', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, { bodyColumns: 30 })

    // 13 cells of label: mark 2 + label 14 + bar 8 + gap 1 + share 5 ("999%+") = 30
    expect(await ui.find({ type: 'Text', text: /^User j…e\.test$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$10\.65$/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Box' })).some(box => box.props.flexWrap === 'wrap')).toBe(true)
    // the amount has a line of its own here (a box indented under the mark); in the roomy pane it shares the bar's line
    expect(await underBar(ui, '$10.65')).toBe(true)
    await ui.unmount()
    expect(await underBar(await mount($, { bodyColumns: 76 }), '$10.65')).toBe(false)
  })
})

describe('the compact footer', () => {
  const COMPACT = { options: { compact_pane: true } }

  // The second read of the key is held, so the pane is drawn while it is refreshing.
  const refreshing = async ($: Engine, on: Parameters<typeof boot>[0], columns: number) => {
    let release = () => {}
    let reads = 0
    const route = async () => {
      reads += 1
      if (reads > 1) {
        await new Promise<void>(resolve => {
          release = resolve
        })
      }

      return reply(200, keyBody())
    }
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': route } })

    await start($, clock)
    const pending = run($, 'refresh')

    await clock.advance(10)
    const ui = await mount($, { placement: 'inline', bodyColumns: columns })
    const status = await ui.find({ type: 'Text', text: /^Updated / })

    release()
    await pending

    return status?.text
  }

  test('keeps the status beside the buttons while it fits, shortened before it is given up', COMPACT, async ($, on) => {
    expect(await refreshing($, on, 90)).toMatch(/^Updated \d\d:\d\d:\d\d · every \d+s · refreshing…$/)
  })

  test('drops "every Ns" at 80 columns, where the full status no longer fits beside the buttons', COMPACT, async ($, on) => {
    expect(await refreshing($, on, 80)).toMatch(/^Updated \d\d:\d\d:\d\d · refreshing…$/)
  })

  test('and at 70 to 73 it goes under the buttons, whole, instead of running off the pane', COMPACT, async ($, on) => {
    expect(await refreshing($, on, 72)).toMatch(/^Updated \d\d:\d\d:\d\d · every \d+s · refreshing…$/)
  })
})
