import { describe, expect, test } from 'claude-code/testing'

import { boot, start } from './boot'
import { activity } from './activity-fixtures'
import { keysOf, mount, texts } from './pane-kit'
import { keyBody, reply, standardRoutes } from './support'

const BARS = /^[ ▁▂▃▄▅▆▇█]{20,}$/

/** The standard key, with the pane already open on the Usage tab. */
const usageTab = async (...[$, on, setup]: [Parameters<typeof start>[0], Parameters<typeof boot>[0], Parameters<typeof boot>[1]?]) => {
  const { log, clock } = boot(on, setup)

  await start($, clock)
  const ui = await mount($, 'terminal')

  await ui.press({ key: 'tab-usage' })

  return { ui, log }
}

describe('the usage tab', () => {
  test('draws a bar for each day, labeled with its weekday and spend', async ($, on) => {
    const { ui } = await usageTab($, on)

    expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
    expect(await texts(ui, BARS)).toHaveLength(6)
    const weekdays = (await ui.findAll({ type: 'Button' })).filter(button => button.key?.startsWith('day-'))

    expect(weekdays.map(button => button.props.label)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    expect(await ui.find({ type: 'Text', text: /^\$8\.70$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$1\.50$/ })).toBeDefined()
  })

  test('labels the top and the bottom of the axis', async ($, on) => {
    const { ui } = await usageTab($, on)

    expect(await ui.find({ type: 'Text', text: /^\s*\$8\.70$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\s*\$0$/ })).toBeDefined()
  })

  test('counts requests or tokens instead of spend, one press at a time', async ($, on) => {
    const { ui, log } = await usageTab($, on)

    expect((await ui.find({ key: 'metric' }))?.props).toMatchObject({ label: 'chart: spend', hotkey: 'm' })
    await ui.press({ key: 'metric' })
    expect(await ui.find({ type: 'Text', text: /^Requests per day \(UTC\)$/ })).toBeDefined()
    expect((await ui.find({ key: 'metric' }))?.props.label).toBe('chart: requests')
    expect(await ui.find({ type: 'Text', text: /^\s*90$/ })).toBeDefined()
    await ui.press({ key: 'metric' })
    expect(await ui.find({ type: 'Text', text: /^Tokens per day \(UTC\)$/ })).toBeDefined()
    await ui.press({ key: 'metric' })
    expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
    expect(log.stored.prefs).toEqual({ range: 7, sort: 'spend', metric: 'spend' })
  })

  test('makes each weekday a button to pick the day, with a hint until one is picked', async ($, on) => {
    const { ui } = await usageTab($, on)
    const days = (await keysOf(ui)).filter(key => key?.startsWith('day-'))

    expect(days).toEqual(['day-2026-09-27', 'day-2026-09-28', 'day-2026-09-29', 'day-2026-09-30', 'day-2026-10-01', 'day-2026-10-02', 'day-2026-10-03'])
    expect((await ui.find({ key: 'day-2026-10-01' }))?.props).toMatchObject({ label: 'Thu', dimColor: true })
    expect(await ui.find({ type: 'Text', text: /^Pick a day under the chart for its details$/ })).toBeDefined()
  })

  test('says what the picked day did, with its models, and marks the day', async ($, on) => {
    const { ui } = await usageTab($, on)

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
    const { ui } = await usageTab($, on)

    await ui.press({ key: 'day-2026-10-02' })
    expect(await ui.find({ type: 'Text', text: /^no activity$/ })).toBeDefined()
  })

  test('keeps the picked day while it is in the range, and goes back to the hint when it is not', async ($, on) => {
    const { ui } = await usageTab($, on)

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
    const { ui } = await usageTab($, on)

    expect(await ui.find({ type: 'Text', text: /^\$14\.20 · \$2\.03\/day$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^150 · \$0\.095 each$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^By model, last 7 days/ })).toBeDefined()
    // the share bar is the slim one of the pane: the part in lower half blocks, the rest a hairline
    expect(await ui.find({ type: 'Text', text: /^▄+▁* +75%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$10\.65 · 0 requests/ })).toBeDefined()
  })

  test('says which models moved against the days before, once the history holds both stretches', async ($, on) => {
    // 15 quiet days, 7 of $10, 7 of $15 and today: the last 7 full days against the 7 before
    const spends = [...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 15), 99]
    const shares = (at: number): Record<string, number> => (at >= 22 && at < 29 ? { 'claude-sonnet-4-5': 8 / 15, 'claude-opus-4-1': 7 / 15 } : { 'claude-sonnet-4-5': 0.8, 'claude-opus-4-1': 0.2 })
    const { ui } = await usageTab($, on, { routes: { ...standardRoutes(), '/user/daily/activity': activity(spends, shares) } })

    expect(await ui.find({ type: 'Text', text: /^By model, last 7 days · ▲▼ vs the 7 before/ })).toBeDefined()
    // the week holds today too, so opus has $14 and the 250% is its last 7 full days against the 7 before them
    expect(await ui.find({ type: 'Text', text: /\$61\.80 ▲ 250% · 618 requests/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Trend$/ })).toBeDefined()
  })

  test('steps through 7, 14 and 30 days, with d on the next one', async ($, on) => {
    const { ui, log } = await usageTab($, on)

    expect((await ui.find({ key: 'range-14' }))?.props.hotkey).toBe('d')
    expect((await ui.find({ key: 'range-30' }))?.props.hotkey).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: / 7d / })).toBeDefined()
    await ui.press({ key: 'range-14' })
    expect(await ui.find({ type: 'Text', text: / 14d / })).toBeDefined()
    expect((await ui.find({ key: 'range-30' }))?.props.hotkey).toBe('d')
    expect(await ui.find({ type: 'Text', text: /^By model, last 14 days/ })).toBeDefined()
    await ui.press({ key: 'range-30' })
    expect((await ui.find({ key: 'range-7' }))?.props.hotkey).toBe('d')
    expect(await texts(ui, BARS)).toHaveLength(6)
    expect(await ui.find({ type: 'Text', text: /^Sep 4 +Oct 3$/ })).toBeDefined()
    expect(log.copies).toEqual([])
  })

  test('remembers the range for the next session, and starts on the one it remembers', async ($, on) => {
    const first = boot(on)

    await start($, first.clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-usage' })
    await ui.press({ key: 'range-30' })
    expect(first.log.stored.prefs).toEqual({ range: 30, sort: 'spend', metric: 'spend' })
  })

  test('starts on the range it remembers', async ($, on) => {
    const { ui } = await usageTab($, on, { store: { prefs: { range: 14, sort: 'name' } } })

    expect(await ui.find({ type: 'Text', text: /^By model, last 14 days/ })).toBeDefined()
  })

  test('ignores a stored range, sort or metric it does not know', async ($, on) => {
    const { ui } = await usageTab($, on, { store: { prefs: { range: 9, sort: 'size', metric: 'joy' } } })

    expect(await ui.find({ type: 'Text', text: /^By model, last 7 days/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Spend per day/ })).toBeDefined()
  })

  test('copies the days as CSV', async ($, on) => {
    const { ui, log } = await usageTab($, on)

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
    expect(await texts(ui, /^[·▁-█]{30}$/)).toHaveLength(1)
  })
})

describe('the usage tab without a history', () => {
  test('says it is off when show_usage is', { options: { show_usage: false } }, async ($, on) => {
    const { ui } = await usageTab($, on)

    expect(await ui.find({ type: 'Text', text: /Usage history is off. Turn show_usage on/ })).toBeDefined()
  })

  test('says the key has no user', async ($, on) => {
    const { ui } = await usageTab($, on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ user_id: null })) } })

    expect(await ui.find({ type: 'Text', text: /This key has no user/ })).toBeDefined()
  })

  test('says the proxy did not answer, and the note that tells why', async ($, on) => {
    const { ui } = await usageTab($, on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

    expect(await ui.find({ type: 'Text', text: /The proxy did not return usage history/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /usage history unavailable/ })).toBeDefined()
  })
})
