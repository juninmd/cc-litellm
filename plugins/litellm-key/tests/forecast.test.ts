import { describe, expect, test } from 'claude-code/testing'

import type { Budget } from '../types'
import { advanceSession, allowance, beginSession, forecast, parseDuration } from '../hooks/forecast'
import { NOW, near } from './support'

const DAY = 86_400_000

const budget = (extra: Partial<Budget> = {}): Budget => ({
  spend: 21,
  limit: 50,
  softLimit: null,
  duration: '30d',
  resetAt: NOW + 9 * DAY,
  ...extra,
})

describe('parseDuration', () => {
  test('reads the periods LiteLLM writes', () => {
    expect(parseDuration('30s')).toBe(30_000)
    expect(parseDuration('45m')).toBe(2_700_000)
    expect(parseDuration('24h')).toBe(DAY)
    expect(parseDuration('30d')).toBe(30 * DAY)
    expect(parseDuration('1w')).toBe(7 * DAY)
    expect(parseDuration('1mo')).toBe(30 * DAY)
  })

  test('tells a month from a minute, ignores case and padding, and takes fractions', () => {
    expect(parseDuration('2MO')).toBe(60 * DAY)
    expect(parseDuration('2m')).toBe(120_000)
    expect(parseDuration(' 2d ')).toBe(2 * DAY)
    expect(parseDuration('1.5h')).toBe(5_400_000)
  })

  test('says nothing about what it does not know', () => {
    for (const text of ['', 'soon', '10', '5y', '0d', '-3d', 'd', null, undefined]) {
      expect(parseDuration(text)).toBeNull()
    }
  })
})

describe('forecast', () => {
  test('projects a window from what it has spent so far', () => {
    const pace = forecast(budget(), NOW)

    // 21 of 30 days gone, $21 spent: $1 a day, $30 by the reset, the cap is nowhere near.
    expect(pace?.basis).toBe('window')
    near(pace?.perDay, 1)
    near(pace?.projected, 30)
    expect(pace?.projectedPct).toBe(60)
    expect(pace?.beforeReset).toBe(false)
    near(pace?.emptyAt, NOW + 29 * DAY, 500)
  })

  test('says when the cap is reached ahead of the reset', () => {
    const pace = forecast(budget({ spend: 42 }), NOW)

    near(pace?.perDay, 2)
    expect(pace?.projectedPct).toBe(120)
    expect(pace?.beforeReset).toBe(true)
    near(pace?.emptyAt, NOW + 4 * DAY, 500)
  })

  test('is empty already once the cap is passed', () => {
    const pace = forecast(budget({ spend: 55 }), NOW)

    expect(pace?.emptyAt).toBe(NOW)
    expect(pace?.beforeReset).toBe(true)
  })

  test('works on short windows too', () => {
    const pace = forecast(budget({ spend: 4, limit: 5, duration: '1h', resetAt: NOW + 30 * 60_000 }), NOW)

    expect(pace?.projectedPct).toBe(160)
    expect(pace?.beforeReset).toBe(true)
    near(pace?.emptyAt, NOW + 7.5 * 60_000, 500)
  })

  test('waits for the window to have some history before it trusts a rate', () => {
    const early = budget({ resetAt: NOW + 29 * DAY })

    expect(forecast(early, NOW)).toBeNull()
    expect(forecast(budget({ duration: '1h', resetAt: NOW + 55 * 60_000 }), NOW)).toBeNull()
  })

  test('trusts the window from a tenth of the period on, and from 15 minutes whatever the period', () => {
    // 30 days: a tenth is 3 days. 1 hour: a tenth is 6 minutes, so the 15 minutes of floor decide.
    expect(forecast(budget({ resetAt: NOW + 27.1 * DAY }), NOW)).toBeNull()
    expect(forecast(budget({ resetAt: NOW + 26.9 * DAY }), NOW)?.basis).toBe('window')
    expect(forecast(budget({ duration: '1h', resetAt: NOW + 46 * 60_000 }), NOW)).toBeNull()
    expect(forecast(budget({ duration: '1h', resetAt: NOW + 44 * 60_000 }), NOW)?.basis).toBe('window')
  })

  test('falls back to the recent daily spend when the window cannot say', () => {
    const early = forecast(budget({ resetAt: NOW + 29 * DAY }), NOW, 2)
    const open = forecast(budget({ duration: null, resetAt: null, spend: 10 }), NOW, 4)

    // $29 left at $2 a day: 14.5 days, which is before a reset 29 days off.
    expect(early?.basis).toBe('recent')
    expect(early?.perDay).toBe(2)
    expect(early?.projected).toBeNull()
    expect(early?.beforeReset).toBe(true)
    near(early?.emptyAt, NOW + 14.5 * DAY, 500)
    // No reset to be before: it only says when.
    expect(open?.beforeReset).toBe(false)
    near(open?.emptyAt, NOW + 10 * DAY, 500)
  })

  test('ignores a reset that is already past and a period it cannot read', () => {
    expect(forecast(budget({ resetAt: NOW - 1000 }), NOW)).toBeNull()
    expect(forecast(budget({ duration: 'weekly' }), NOW)).toBeNull()
    expect(forecast(budget({ resetAt: NOW - 1000 }), NOW, 3)?.basis).toBe('recent')
  })

  test('has nothing to say about numbers that are not numbers', () => {
    expect(forecast(budget({ spend: Number.POSITIVE_INFINITY }), NOW, 2)).toBeNull()
    expect(forecast(budget({ spend: Number.NaN }), NOW, 2)).toBeNull()
    expect(forecast(budget({ limit: Number.POSITIVE_INFINITY }), NOW, 2)).toBeNull()
    expect(forecast(budget({ limit: Number.NaN }), NOW, 2)).toBeNull()
  })

  test('has nothing to say without a cap, a spend or a rate', () => {
    expect(forecast(budget({ limit: null }), NOW, 2)).toBeNull()
    expect(forecast(budget({ limit: 0 }), NOW, 2)).toBeNull()
    expect(forecast(budget({ spend: 0 }), NOW, 2)).toBeNull()
    expect(forecast(budget({ duration: null, resetAt: null }), NOW)).toBeNull()
    expect(forecast(budget({ duration: null, resetAt: null }), NOW, 0)).toBeNull()
  })
})

describe('allowance', () => {
  test('spreads what is left over the time to the reset', () => {
    const room = allowance(budget(), NOW)

    // $29 left for 9 days.
    near(room?.perDay, 29 / 9)
    near(room?.perHour, 29 / 9 / 24)
    expect(room?.ms).toBe(9 * DAY)
  })

  test('is the same whatever the pace was: it only needs a cap and a reset', () => {
    expect(allowance(budget({ spend: 0 }), NOW)?.perDay).toBeGreaterThan(0)
    near(allowance(budget({ spend: 0, duration: null }), NOW)?.perDay, 50 / 9)
  })

  test('counts a short window by the hour', () => {
    const room = allowance(budget({ spend: 4, limit: 5, duration: '1h', resetAt: NOW + 2 * 3_600_000 }), NOW)

    near(room?.perHour, 0.5)
    near(room?.perDay, 12)
  })

  test('has nothing to say in the last hour before the reset, where any figure would be absurd', () => {
    expect(allowance(budget({ resetAt: NOW + 3_600_000 - 1 }), NOW)).toBeNull()
    expect(allowance(budget({ resetAt: NOW + 3_600_000 }), NOW)?.ms).toBe(3_600_000)
  })

  test('has nothing to say once the cap is reached, or without a cap or a reset still to come', () => {
    expect(allowance(budget({ spend: 50 }), NOW)).toBeNull()
    expect(allowance(budget({ spend: 55 }), NOW)).toBeNull()
    expect(allowance(budget({ limit: null }), NOW)).toBeNull()
    expect(allowance(budget({ limit: 0 }), NOW)).toBeNull()
    expect(allowance(budget({ resetAt: null }), NOW)).toBeNull()
    expect(allowance(budget({ resetAt: NOW - 1000 }), NOW)).toBeNull()
  })

  test('has nothing to say about numbers that are not numbers', () => {
    expect(allowance(budget({ spend: Number.NaN }), NOW)).toBeNull()
    expect(allowance(budget({ limit: Number.POSITIVE_INFINITY }), NOW)).toBeNull()
  })
})

describe('session', () => {
  test('starts at nothing, counting from the first reading', () => {
    expect(beginSession(NOW, 12.5)).toEqual({ since: NOW, spend: 0, last: 12.5 })
  })

  test('adds what each new reading shows', () => {
    const first = beginSession(NOW, 12.5)
    const next = advanceSession(first, 13.25)

    expect(next).toEqual({ since: NOW, spend: 0.75, last: 13.25 })
    expect(advanceSession(next, 13.25)).toEqual(next)
    near(advanceSession(next, 14.25).spend, 1.75)
  })

  test('counts all of a reading that fell far below the last one: the budget reset in between', () => {
    const before = { since: NOW, spend: 3, last: 49 }

    expect(advanceSession(before, 1.5)).toEqual({ since: NOW, spend: 4.5, last: 1.5 })
    expect(advanceSession({ since: NOW, spend: 0, last: 10 }, 0)).toEqual({ since: NOW, spend: 0, last: 0 })
  })

  test('adds nothing for a small step back: counters that disagree for a moment are not a reset', () => {
    const before = { since: NOW, spend: 3, last: 40 }
    const back = advanceSession(before, 39.99)

    expect(back).toEqual({ since: NOW, spend: 3, last: 39.99 })
    near(advanceSession(back, 40.5).spend, 3.51)
    near(advanceSession(before, 19.99).spend, 22.99)
    expect(advanceSession(before, 20).spend).toBe(3)
  })
})
