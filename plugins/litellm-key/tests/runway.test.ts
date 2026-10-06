import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { facts } from '../hooks/facts'
import { runway, runwayAlert, runwayRow } from '../hooks/runway'
import { statusText } from '../hooks/summary'
import { NOW, snapshotOf, withKey } from './support'

const DAY = 86_400_000

// The standard key: $12.50 of $50, resets in 6.5 days, and $14.20 spent in the 6.5 days the history covers up to NOW ($2.18 a day).
const spending = (spend: number, extra: Record<string, unknown> = {}) => snapshotOf(withKey({ spend, ...extra }))

const patchBudget = (snapshot: Snapshot, patch: Partial<Snapshot['key']['budget']>): Snapshot => ({
  ...snapshot,
  key: { ...snapshot.key, budget: { ...snapshot.key.budget, ...patch } },
})

describe('runway', () => {
  test('a key that lasts until the reset says so, and is not a warning', async () => {
    const found = runway(await spending(12.5), NOW)

    expect(found?.kind).toBe('lasts')
    expect(found && runwayRow(found, NOW)).toEqual({ text: 'lasts until the reset at $2.18/day', tone: 'ok' })
  })

  test('a key on course to run out before the reset says when, and warns', async () => {
    const found = runway(await spending(45), NOW)

    expect(found?.kind).toBe('runs-out')
    expect(found && runwayRow(found, NOW)).toEqual({
      text: 'out in 2d 6h at $2.18/day · resets in 6d 12h',
      tone: 'warn',
    })
  })

  test('a young key is averaged over its own days, not over seven', async () => {
    const old = await spending(12.5)
    const young = await spending(12.5, { created_at: new Date(NOW - 2 * DAY).toISOString() })

    // the whole window would say "lasts"; two days of life say it runs out
    expect(runway(old, NOW)?.kind).toBe('lasts')
    expect(runway(young, NOW)).toMatchObject({ kind: 'runs-out', perDay: 14.2 / 2 })
    // and never fewer than one day, so a key made an hour ago does not extrapolate an hour into a month
    expect(runway(await spending(12.5, { created_at: new Date(NOW - 3_600_000).toISOString() }), NOW)).toMatchObject({
      perDay: 14.2,
    })
  })

  test('without a reset it names the date it would run out, and warns only when that is near', async () => {
    const calm = runway(await spending(12.5, { budget_duration: null, budget_reset_at: null }), NOW)
    const near = runway(await spending(49, { budget_duration: null, budget_reset_at: null }), NOW)

    expect(calm && runwayRow(calm, NOW)).toEqual({ text: 'out in 17d at $2.18/day', tone: 'ok' })
    expect(near && runwayRow(near, NOW)).toMatchObject({ tone: 'warn' })
  })

  test('the window is the days it covers, not seven: just after midnight UTC it holds 6 days and a half hour', async () => {
    const base = await spending(12.5)
    const night = Date.parse('2026-10-04T00:30:00Z')
    const days = ['09-28', '09-29', '09-30', '10-01', '10-02', '10-03', '10-04'].map(day => ({ date: `2026-${day}`, spend: 0 }))
    // a steady $10 a day for 6 days and half an hour; dividing by 7 would read $8.60 and call it "lasts"
    const usage = base.usage && { ...base.usage, days, spend: 10 * (6 + 0.5 / 24) }
    const found = runway(patchBudget({ ...base, usage }, { resetAt: night + 2.2 * DAY, spend: 30 }), night)

    expect(found?.kind).toBe('runs-out')
    expect(Math.abs((found && 'perDay' in found ? found.perDay : 0) - 10)).toBeLessThan(1e-6)
  })

  test('says nothing when there is nothing to say', async () => {
    const quiet = { budget_duration: null, budget_reset_at: null }
    const base = await spending(12.5)

    expect(runway(await spending(12.5, { max_budget: null }), NOW)).toBeNull()
    expect(runway(await spending(50), NOW)).toBeNull() // already spent up
    expect(runway(await spending(12.5, { status: 'expired', expires: new Date(NOW - DAY).toISOString() }), NOW)).toBeNull()
    expect(runway({ ...base, usage: null }, NOW)).toBeNull()
    expect(runway({ ...base, usage: base.usage && { ...base.usage, days: [] } }, NOW)).toBeNull()
    // without the hash the usage covers every key of the user, and its pace says nothing about this cap
    expect(runway({ ...base, key: { ...base.key, keyHash: null } }, NOW)).toBeNull()
    expect(runway({ ...base, usage: base.usage && { ...base.usage, spend: 0 } }, NOW)).toBeNull()
    expect(runway(patchBudget(base, { resetAt: NOW - 1000 }), NOW)).toBeNull() // the reset is due: the spend is about to be zero
    // a pace so slow it would last longer than a year, with no reset to measure it against
    expect(runway({ ...(await spending(12.5, quiet)), usage: base.usage && { ...base.usage, spend: 0.001 } }, NOW)).toBeNull()
  })

  test('the status line warns when the budget runs out before its reset, however far off, and is quiet when it lasts', async () => {
    const base = await spending(25)
    // $1 a day over the 6.5 days the history covers, $25 left: out in 25 days, five before a reset 30 days away
    const slow = patchBudget({ ...base, usage: base.usage && { ...base.usage, spend: 6.5 } }, { resetAt: NOW + 30 * DAY })

    expect(statusText(await spending(12.5), null, NOW)).not.toContain('out in')
    expect(statusText(await spending(45), null, NOW)).toMatch(/ · out in 2d 6h at this pace$/)
    expect(runwayAlert(await spending(12.5), NOW)).toBeNull()
    expect(runwayAlert(await spending(45), NOW)).toBe('out in 2d 6h at this pace')
    expect(runwayAlert(slow, NOW)).toBe('out in 25d at this pace')
  })

  test('with no reset the status line waits until the end is near', async () => {
    const open = { budget_duration: null, budget_reset_at: null }

    expect(runwayAlert(await spending(12.5, open), NOW)).toBeNull() // out in 17 days
    expect(runwayAlert(await spending(49, open), NOW)).toBe('out in 10h 59m at this pace')
  })

  test('the pane and /litellm info get the row, with its tone', async () => {
    const calm = facts(await spending(12.5), NOW).find(row => row.label === 'Runway')
    const urgent = facts(await spending(45), NOW).find(row => row.label === 'Runway')

    expect(calm).toEqual({ label: 'Runway', text: 'lasts until the reset at $2.18/day', tone: 'ok' })
    expect(urgent?.tone).toBe('warn')
    expect(facts(await spending(12.5, { max_budget: null }), NOW).some(row => row.label === 'Runway')).toBe(false)
  })
})
