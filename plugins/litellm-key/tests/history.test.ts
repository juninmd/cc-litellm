import { describe, expect, test } from 'claude-code/testing'

import type { Usage, UsageModel } from '../types'
import { utcDay } from '../hooks/format'
import { COMPARABLE, RANGES, metricOf, nextMetric, nextRange, totalsOf, usageCompare, usageOver, usageTrend } from '../hooks/history'
import { day, history, model, usageOf } from './history-fixtures'
import { near } from './near'
import { NOW } from './support'

describe('usageOver', () => {
  test('totals the last days of the history, today included', () => {
    const usage = history([9, 9, 9, 1, 2, 3, 4])
    const week = usageOver(usage, 7)
    const three = usageOver(usage, 3)

    expect(week.spend).toBe(37)
    expect(week.days).toHaveLength(7)
    near(week.average, 37 / 7)
    expect(three.days.map(item => item.spend)).toEqual([2, 3, 4])
    expect(three.spend).toBe(9)
    expect(three.requests).toBe(90)
    expect(three.tokens).toBe(9000)
    expect(three.inputTokens).toBe(7200)
    expect(three.outputTokens).toBe(1800)
    expect(three.cacheReadTokens).toBe(4500)
  })

  test('takes everything when the history is shorter than the range', () => {
    expect(usageOver(history([1, 2]), 30).days).toHaveLength(2)
    expect(usageOver(usageOf([]), 7)).toMatchObject({ spend: 0, average: 0, peak: null, activeDays: 0, models: [] })
    expect(totalsOf([])).toMatchObject({ spend: 0, average: 0, peak: null, activeDays: 0, models: [] })
  })

  test('finds the peak day and counts the days that did something', () => {
    const totals = usageOver(history([0, 5, 0, 12, 3, 0, 0]), 7)

    expect(totals.peak?.spend).toBe(12)
    expect(totals.peak?.date).toBe(utcDay(NOW, 3))
    expect(totals.activeDays).toBe(3)
    expect(usageOver(history([0, 0, 0]), 3).peak).toBeNull()
  })

  test('merges a model across the days and ranks them by spend', () => {
    const usage = usageOf([
      day('2026-10-01', 4, [model('claude-sonnet-4-5', 3, 3, 3000), model('claude-opus-4-1', 1, 1, 500)]),
      day('2026-10-02', 0),
      day('2026-10-03', 6, [model('claude-opus-4-1', 5, 4, 4000), model('claude-sonnet-4-5', 1, 2, 800)]),
    ])
    const { models } = usageOver(usage, 3)

    expect(models).toEqual([
      { model: 'claude-opus-4-1', spend: 6, requests: 5, tokens: 4500 },
      { model: 'claude-sonnet-4-5', spend: 4, requests: 5, tokens: 3800 },
    ])
  })

  test('breaks a tie between models by name', () => {
    const usage = usageOf([day('2026-10-03', 2, [model('b', 1), model('a', 1)])])

    expect(usageOver(usage, 1).models.map(item => item.model)).toEqual(['a', 'b'])
  })
})

describe('usageTrend', () => {
  // Full days only: today (the last entry) is not over, so it is never one of the days compared.
  const spends = [...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 15), 99]

  test('compares the last full days with the same number before them', () => {
    const trend = usageTrend(history(spends), 7)

    expect(trend?.current).toBe(105)
    expect(trend?.previous).toBe(70)
    expect(trend?.change).toEqual({ pct: 50, direction: 'up' })
  })

  test('sees a drop', () => {
    expect(
      usageTrend(history([...Array.from({ length: 7 }, () => 20), ...Array.from({ length: 7 }, () => 10), 0]), 7)
        ?.change,
    ).toEqual({
      pct: 50,
      direction: 'down',
    })
  })

  test('needs two full ranges of history, and a past that spent something', () => {
    expect(usageTrend(history(spends.slice(1)), 7)).toBeNull()
    expect(usageTrend(history(Array.from({ length: 30 }, () => 1)), 30)).toBeNull()
    expect(
      usageTrend(history([...Array.from({ length: 7 }, () => 0), ...Array.from({ length: 7 }, () => 4), 1]), 7),
    ).toBeNull()
  })
})

describe('nextRange', () => {
  test('knows the ranges the plugin shows', () => {
    expect(RANGES).toEqual([7, 14, 30])
  })

  test('steps through 7, 14 and 30 and around', () => {
    expect(nextRange(7)).toBe(14)
    expect(nextRange(14)).toBe(30)
    expect(nextRange(30)).toBe(7)
    expect(nextRange(3)).toBe(7)
  })
})

describe('metrics', () => {
  test('steps through spend, requests and tokens and around', () => {
    expect(nextMetric('spend')).toBe('requests')
    expect(nextMetric('requests')).toBe('tokens')
    expect(nextMetric('tokens')).toBe('spend')
  })

  test('picks what a day counts for each', () => {
    const busy = day('2026-10-03', 4)

    expect(metricOf(busy, 'spend')).toBe(4)
    expect(metricOf(busy, 'requests')).toBe(40)
    expect(metricOf(busy, 'tokens')).toBe(4000)
  })
})

describe('usageCompare', () => {
  const sonnet = (spend: number) => model('claude-sonnet-4-5', spend, Math.round(spend * 10))
  const opus = (spend: number) => model('claude-opus-4-1', spend, Math.round(spend * 10))
  /** The days of `usage` with the models `by` gives each place in the history (0 is the oldest of 30, 29 is today). */
  const withModels = (usage: Usage, by: (at: number) => UsageModel[]): Usage =>
    usageOf(usage.history.map((item, at) => ({ ...item, models: by(at) })))
  // 15 quiet days, then 7 days of $10, 7 of $15, and today: the last 7 full days are places 22 to 28, the 7 before 15 to 21.
  const spends = [...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 15), 99]

  test('sets the last full days against the same number before them, today left out', () => {
    const diff = usageCompare(history(spends), 7)

    expect(diff?.count).toBe(7)
    expect(diff?.current.spend).toBe(105)
    expect(diff?.previous.spend).toBe(70)
    expect(diff?.current.days.at(-1)?.date).toBe(utcDay(NOW, 1))
    expect(diff?.previous.days[0]?.date).toBe(utcDay(NOW, 14))
  })

  test('says what each model did, the one that moved most first', () => {
    const usage = withModels(history(spends), at =>
      at === 29 ? [sonnet(99)] : at >= 22 ? [sonnet(8), opus(7)] : at >= 15 ? [sonnet(8), opus(2)] : [],
    )
    const diff = usageCompare(usage, 7)

    expect(diff?.movers.map(item => [item.model, item.current, item.previous])).toEqual([
      ['claude-opus-4-1', 49, 14],
      ['claude-sonnet-4-5', 56, 56],
    ])
    expect(diff?.movers[0]?.change).toEqual({ pct: 250, direction: 'up' })
    expect(diff?.movers[1]?.change).toEqual({ pct: 0, direction: 'flat' })
  })

  test('calls a model that spent only now new, and one that spent only before gone', () => {
    const usage = withModels(history(spends), at => (at >= 22 && at < 29 ? [opus(15)] : at >= 15 && at < 22 ? [sonnet(10)] : []))
    const movers = Object.fromEntries((usageCompare(usage, 7)?.movers ?? []).map(item => [item.model, item]))

    expect(movers['claude-opus-4-1']).toMatchObject({ isNew: true, isGone: false, change: null })
    expect(movers['claude-sonnet-4-5']).toMatchObject({ isNew: false, isGone: true })
  })

  test('leaves out a model that did nothing in either stretch', () => {
    const usage = withModels(history(spends), at => (at === 25 ? [model('claude-haiku-4-5', 0, 0)] : []))

    expect(usageCompare(usage, 7)?.movers).toEqual([])
  })

  test('needs two full stretches of history, and an earlier one that spent something', () => {
    expect(usageCompare(history(Array.from({ length: 14 }, () => 5)), 7)).toBeNull()
    expect(usageCompare(history(Array.from({ length: 30 }, () => 5)), 30)).toBeNull()
    expect(usageCompare(history([...Array.from({ length: 22 }, () => 0), ...Array.from({ length: 8 }, () => 5)]), 7)).toBeNull()
    expect(usageCompare(history(Array.from({ length: 30 }, () => 5)), 14)?.count).toBe(14)
  })

  test('is offered for the ranges the history can hold twice', () => {
    expect(COMPARABLE).toEqual([7, 14])
  })
})
