import { describe, expect, test } from 'claude-code/testing'

import type { ActivityDay, Snapshot } from '../types'
import { alertsOf } from '../hooks/alerts'
import { clock } from '../hooks/format'
import {
  advanceSession,
  allowance,
  allowanceRow,
  allowanceText,
  beginSession,
  dailyOver,
  eachText,
  headroomText,
  isSpike,
  recentDaily,
  sessionText,
  todayOf,
  todayRow,
} from '../hooks/guidance'
import { facts } from '../hooks/facts'
import { configOf } from '../hooks/settings'
import { statusText } from '../hooks/summary'
import { near } from './near'
import { NOW, snapshotOf, withKey } from './support'

const HOUR = 3_600_000
const DAY = 86_400_000

// The standard key: $12.50 of $50, resets in 6.5 days; 150 requests and $14.20 over the week, $8.70 and 90 of them today.
const spending = (spend: number, extra: Record<string, unknown> = {}) => snapshotOf(withKey({ spend, ...extra }))

const withHistory = (snapshot: Snapshot, edit: (days: ActivityDay[]) => ActivityDay[]): Snapshot => ({
  ...snapshot,
  usage: snapshot.usage && { ...snapshot.usage, history: edit(snapshot.usage.history) },
})

const withToday = (snapshot: Snapshot, patch: Partial<ActivityDay>): Snapshot =>
  withHistory(snapshot, days => days.map((day, at) => (at === days.length - 1 ? { ...day, ...patch } : day)))

describe('allowance', () => {
  const budget = { spend: 12.5, limit: 50, softLimit: null, duration: '30d', resetAt: NOW + 6.5 * DAY }

  test('is what the budget can spend a day from now to its reset', () => {
    const room = allowance(budget, NOW)

    near(room?.perDay, 37.5 / 6.5)
    expect(room?.ms).toBe(6.5 * DAY)
  })

  test('needs a cap, room under it, a reset to come and an hour to spread it over', () => {
    expect(allowance({ ...budget, limit: null }, NOW)).toBeNull()
    expect(allowance({ ...budget, resetAt: null }, NOW)).toBeNull()
    expect(allowance({ ...budget, spend: 50 }, NOW)).toBeNull()
    expect(allowance({ ...budget, spend: 60 }, NOW)).toBeNull()
    expect(allowance({ ...budget, resetAt: NOW - 1 }, NOW)).toBeNull()
    expect(allowance({ ...budget, resetAt: NOW + HOUR - 1 }, NOW)).toBeNull()
    expect(allowance({ ...budget, resetAt: NOW + HOUR }, NOW)).not.toBeNull()
    expect(allowance({ ...budget, spend: Number.NaN }, NOW)).toBeNull()
  })

  test('is said per day, and per hour once less than a day is left', () => {
    expect(allowanceText({ perDay: 5.77, ms: 6.5 * DAY })).toEqual({ text: '$5.77/day to last until the reset', tone: 'ok' })
    expect(allowanceText({ perDay: 4.8, ms: 6 * HOUR })).toEqual({ text: '$0.20/h to last until the reset', tone: 'ok' })
  })

  test('says how much less than the recent pace it is when the pace will not last, and warns', () => {
    expect(allowanceText({ perDay: 1, ms: 3 * DAY }, 4)).toEqual({
      text: '$1.00/day to last · 75% less than lately',
      tone: 'warn',
    })
    expect(allowanceText({ perDay: 1, ms: 3 * DAY }, 1).tone).toBe('ok')
    expect(allowanceText({ perDay: 1, ms: 3 * DAY }, 0.5).tone).toBe('ok')
    // never "0% less" nor "100% less": a cut that rounds to either is still a cut
    expect(allowanceText({ perDay: 0.999, ms: 3 * DAY }, 1).text).toContain('1% less')
    expect(allowanceText({ perDay: 0.001, ms: 3 * DAY }, 100).text).toContain('99% less')
  })

  test('for the key sets itself against the pace only when the key runs out before its reset', async () => {
    expect(allowanceRow(await spending(12.5), NOW)).toEqual({ text: '$5.77/day to last until the reset', tone: 'ok' })
    expect(allowanceRow(await spending(45), NOW)).toEqual({
      text: '$0.77/day to last · 65% less than lately',
      tone: 'warn',
    })
    expect(allowanceRow(await spending(50), NOW)).toBeNull()
    expect(allowanceRow(await spending(12.5, { max_budget: null }), NOW)).toBeNull()
  })
})

describe('headroom', () => {
  test('is how many more requests the cap holds at what a request cost in the last week', async () => {
    expect(headroomText(await spending(12.5))).toBe('about 396 more requests at $0.095 each')
  })

  test('says nothing without a cap, without room, without enough requests, spend or the key hash', async () => {
    const base = await spending(12.5)
    const week = (patch: Partial<NonNullable<Snapshot['usage']>>): Snapshot => ({ ...base, usage: base.usage && { ...base.usage, ...patch } })

    expect(headroomText(await spending(12.5, { max_budget: null }))).toBeNull()
    expect(headroomText(await spending(50))).toBeNull()
    expect(headroomText({ ...base, usage: null })).toBeNull()
    expect(headroomText(week({ requests: 9 }))).toBeNull()
    expect(headroomText(week({ spend: 0 }))).toBeNull()
    expect(headroomText({ ...base, key: { ...base.key, keyHash: null } })).toBeNull()
  })

  test('counts a request that cost less than a tenth of a cent with the digit cents would lose', () => {
    expect(eachText(14.2, 150)).toBe('$0.095')
    expect(eachText(5, 2)).toBe('$2.50')
    expect(eachText(0.01, 100)).toBe('$0.0001')
    expect(eachText(0.0004, 1)).toBe('$0.0004')
  })
})

describe('today', () => {
  test('is the last day of the history when it is the day now falls on', async () => {
    const base = await spending(12.5)

    expect(todayOf(base.usage, NOW)?.date).toBe('2026-10-03')
    expect(todayOf(base.usage, NOW + DAY)).toBeNull()
    expect(todayOf(null, NOW)).toBeNull()
    expect(todayOf(withHistory(base, () => []).usage, NOW)).toBeNull()
  })

  test('is told against the usual day, which is the last full days counted from the first one with spend', async () => {
    const base = await spending(12.5)

    near(recentDaily(base.usage), (1.5 + 4 + 0) / 3)
    expect(todayRow(base, NOW)).toEqual({
      label: 'Today',
      text: '$8.70 · 90 requests · 4.7× the usual day ($1.83)',
      tone: 'warn',
    })
    expect(recentDaily(withHistory(base, days => days.map(day => ({ ...day, spend: 0 }))).usage)).toBeNull()
    expect(recentDaily(null)).toBeNull()
  })

  test('marks a day that is three times the usual and a dollar more, and no other', () => {
    expect(isSpike(3, 1)).toBe(true) // exactly on the line
    expect(isSpike(3.5, 1)).toBe(true)
    expect(isSpike(2.9, 1)).toBe(false)
    expect(isSpike(0.04, 0.01)).toBe(false) // 4×, but a cent more is no news
    expect(isSpike(5, 0)).toBe(false)
  })

  test('is quiet while the day is, and says nothing of a usual day of a cent or less', async () => {
    const base = await spending(12.5)
    const quiet = withToday(base, { spend: 0, requests: 0 })
    const tiny = withHistory(base, days => days.map((day, at) => (at === days.length - 1 ? day : { ...day, spend: day.spend > 0 ? 0.001 : 0 })))

    expect(todayRow(quiet, NOW)).toBeNull()
    expect(todayRow(tiny, NOW)).toEqual({ label: 'Today', text: '$8.70 · 90 requests', tone: 'ok' })
    expect(todayRow(withToday(base, { spend: 0, requests: 3 }), NOW)).toEqual({ label: 'Today', text: '$0.00 · 3 requests', tone: 'ok' })
  })

  test('is over the daily alert once it has reached it', async () => {
    const base = await spending(12.5)

    near(dailyOver(base, NOW, 8.7) ?? 0, 8.7)
    expect(dailyOver(base, NOW, 8.71)).toBeNull()
    expect(dailyOver(base, NOW, 0)).toBeNull()
    expect(dailyOver(base, NOW + DAY, 1)).toBeNull()
  })
})

describe('the session', () => {
  test('starts from nothing at the first reading and counts what each reading adds', () => {
    const first = beginSession(NOW, 12.5)

    expect(first).toEqual({ since: NOW, spend: 0, last: 12.5 })
    near(advanceSession(first, 13).spend, 0.5)
    near(advanceSession(advanceSession(first, 13), 14.25).spend, 1.75)
  })

  test('counts all of a reading that fell far below the last: the budget reset', () => {
    near(advanceSession(beginSession(NOW, 40), 3).spend, 3)
  })

  test('counts nothing of a small step back: the proxy counters disagreeing for a moment', () => {
    const session = advanceSession(beginSession(NOW, 40), 39.9)

    expect(session.spend).toBe(0)
    expect(session.last).toBe(39.9)
    near(advanceSession(session, 40.5).spend, 0.6)
  })

  test('says what it spent since when, and the rate once it has run half an hour', () => {
    const since = NOW - 2 * HOUR
    const at = clock(since).slice(0, 5)

    expect(sessionText({ since, spend: 1.5, last: 14 }, NOW)).toBe(`+$1.50 since ${at} (2h ago) · $0.75/h`)
    expect(sessionText({ since: NOW - 10 * 60_000, spend: 1.5, last: 14 }, NOW)).toBe(
      `+$1.50 since ${clock(NOW - 10 * 60_000).slice(0, 5)} (10m ago)`,
    )
    expect(sessionText({ since: NOW - 3000, spend: 0, last: 14 }, NOW)).toBe(`nothing spent since ${clock(NOW - 3000).slice(0, 5)} (just now)`)
    expect(sessionText({ since, spend: 0, last: 14 }, NOW)).toBe(`nothing spent since ${at} (2h ago)`)
  })
})

describe('the facts of a key', () => {
  const row = (snapshot: Snapshot, label: string) => facts(snapshot, NOW).find(item => item.label === label)

  test('carry the allowance, the headroom, today and the session when there is something to say', async () => {
    const base = { ...(await spending(12.5)), session: { since: NOW - 2 * HOUR, spend: 1.5, last: 14 } }

    expect(row(base, 'Allowance')).toEqual({ label: 'Allowance', text: '$5.77/day to last until the reset', tone: 'ok' })
    expect(row(base, 'Headroom')?.text).toBe('about 396 more requests at $0.095 each')
    expect(row(base, 'Today')?.tone).toBe('warn')
    expect(row(base, 'Session')?.text).toContain('+$1.50')
  })

  test('keep the order: the runway, then the allowance and the headroom, today before the week, the session last', async () => {
    const base = { ...(await spending(12.5)), session: { since: NOW - HOUR, spend: 0, last: 12.5 } }
    const labels = facts(base, NOW).map(item => item.label)

    expect(labels.indexOf('Runway')).toBeLessThan(labels.indexOf('Allowance'))
    expect(labels.indexOf('Allowance')).toBeLessThan(labels.indexOf('Headroom'))
    expect(labels.indexOf('Today')).toBeLessThan(labels.indexOf('Last 7 days'))
    expect(labels.at(-1)).toBe('Session')
  })

  test('leave a row out when there is nothing to put in it', async () => {
    const base = await spending(12.5, { max_budget: null })
    const labels = facts({ ...base, usage: null }, NOW).map(item => item.label)

    for (const gone of ['Allowance', 'Headroom', 'Today', 'Session']) {
      expect(labels).not.toContain(gone)
    }
  })
})

describe('the daily alert', () => {
  test('is a toast once a day, and again for another limit', async () => {
    const base = await spending(12.5)
    const [first] = alertsOf(base, NOW, 80, 5).filter(alert => alert.id.startsWith('daily:'))

    expect(first).toEqual({ id: 'daily:2026-10-03:5', message: "Today's spend is $8.70, over your daily alert of $5.00" })
    expect(alertsOf(base, NOW, 80, 6).find(alert => alert.id.startsWith('daily:'))?.id).toBe('daily:2026-10-03:6')
    expect(alertsOf(base, NOW, 80, 20).some(alert => alert.id.startsWith('daily:'))).toBe(false)
    expect(alertsOf(base, NOW, 80).some(alert => alert.id.startsWith('daily:'))).toBe(false)
  })

  test('is on the status line while today is over it', async () => {
    const base = await spending(12.5)

    expect(statusText(base, null, NOW, 5)).toContain(' · today $8.70 (alert $5.00)')
    expect(statusText(base, null, NOW, 20)).not.toContain('today')
    expect(statusText(base, null, NOW)).not.toContain('today')
  })

  test('is on the status line of a key with no cap too, and before the expiry', async () => {
    const soon = new Date(NOW + DAY).toISOString()
    const base = await spending(12.5, { max_budget: null, expires: soon })

    expect(statusText(base, null, NOW, 5)).toMatch(/^\$12\.50 spent · no cap · today \$8\.70 \(alert \$5\.00\) · expires in 1d$/)
  })
})

describe('the options', () => {
  test('daily_alert is dollars to the cent, zero (off) by default, and never below zero', () => {
    expect(configOf({}).dailyAlert).toBe(0)
    expect(configOf({ daily_alert: 12.345 }).dailyAlert).toBe(12.35)
    expect(configOf({ daily_alert: -3 }).dailyAlert).toBe(0)
    expect(configOf({ daily_alert: 'a lot' }).dailyAlert).toBe(0)
    expect(configOf({ daily_alert: 5e9 }).dailyAlert).toBe(1_000_000)
  })

  test('show_toasts is on unless it is turned off', () => {
    expect(configOf({}).isToastShown).toBe(true)
    expect(configOf({ show_toasts: false }).isToastShown).toBe(false)
    expect(configOf({ show_toasts: true }).isToastShown).toBe(true)
  })
})
