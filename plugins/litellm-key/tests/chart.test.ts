import { describe, expect, test } from 'claude-code/testing'

import type { UsageDay } from '../types'
import { plot } from '../hooks/chart'
import { utcDay } from '../hooks/format'
import { NOW } from './support'

const day = (date: string, spend: number): UsageDay => ({
  date,
  spend,
  requests: 0,
  failed: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  models: [],
})

/** One day each, ending on the day of NOW (a Saturday), oldest first. */
const history = (spends: readonly number[]): UsageDay[] =>
  spends.map((spend, at) => day(utcDay(NOW, spends.length - 1 - at), spend))

describe('plot', () => {
  const week = history([0, 1.5, 4, 0, 2, 8.7, 6])

  test('gives each day a slot, with the bars centered in it, and as many rows as asked', () => {
    const drawn = plot(week, 76, 6)

    expect(drawn?.gutter).toBe(6)
    expect(drawn?.slot).toBe(10)
    expect(drawn?.width).toBe(70)
    expect(drawn?.bars).toHaveLength(6)
    expect(drawn?.bars.every(row => row.length === 70)).toBe(true)
    // Six wide, four apart, two to spare at the left: the first bar of a day that spent nothing is blank.
    expect(drawn?.bars.at(-1)?.slice(0, 12)).toBe('              '.slice(0, 12))
    expect(drawn?.bars.at(-1)?.slice(10, 22)).toBe('  ██████    ')
  })

  test('draws the tallest day to the top row and the others in proportion', () => {
    const drawn = plot(week, 76, 6)
    const top = drawn?.bars[0] ?? ''

    expect(top.slice(50, 60)).toBe('  ██████  ')
    expect(top.slice(60, 70)).toBe('          ')
    expect(drawn?.bars.at(-1)?.slice(60, 70)).toBe('  ██████  ')
  })

  test('names the top and the bottom of the axis', () => {
    expect(plot(week, 76, 6)?.ticks).toEqual({ top: '$8.70', bottom: '$0' })
  })

  test('labels each day by its weekday and its spend, today in the last slot', () => {
    const drawn = plot(week, 76, 6)

    expect(drawn?.days?.map(label => label.text)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    expect(drawn?.days?.map(label => label.isToday)).toEqual([false, false, false, false, false, false, true])
    expect(drawn?.days?.map(label => label.date)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
    expect(drawn?.amounts).toEqual(['·', '$1.50', '$4.00', '·', '$2.00', '$8.70', '$6.00'])
    expect(drawn?.ends).toBeNull()
  })

  test('keeps the names but drops the amounts when the slots are too narrow for them', () => {
    const drawn = plot(history(Array.from({ length: 14 }, (_, at) => at)), 76, 6)

    expect(drawn?.slot).toBe(5)
    expect(drawn?.days).toHaveLength(14)
    expect(drawn?.amounts).toBeNull()
    expect(drawn?.ends).toBeNull()
  })

  test('has only the first and the last day to say when the bars are too close for labels', () => {
    const drawn = plot(history(Array.from({ length: 30 }, (_, at) => at % 7)), 76, 6)

    expect(drawn?.slot).toBe(2)
    expect(drawn?.days).toBeNull()
    expect(drawn?.amounts).toBeNull()
    expect(drawn?.ends).toBe(`Sep 4${' '.repeat(50)}Oct 3`)
    expect(drawn?.ends).toHaveLength(60)
  })

  test('gives up when the days will not fit as bars, or there is nothing to draw', () => {
    expect(plot(history(Array.from({ length: 30 }, () => 1)), 20, 6)).toBeNull()
    expect(plot([], 76, 6)).toBeNull()
    expect(plot(week, 76, 0)).toBeNull()
  })

  test('draws no bars for days that spent nothing, and keeps a one-line axis', () => {
    const drawn = plot(history([0, 0, 0]), 40, 3)

    expect(drawn?.ticks).toEqual({ top: '$0', bottom: '$0' })
    expect(drawn?.gutter).toBe(3)
    expect(drawn?.bars.every(row => row.trim() === '')).toBe(true)
  })

  test('never lets a bar run past the room it was given', () => {
    for (const columns of [18, 30, 44, 60, 76, 120, 200]) {
      for (const length of [7, 14, 30]) {
        const drawn = plot(history(Array.from({ length }, (_, at) => at + 1)), columns, 5)

        if (drawn !== null) {
          expect(drawn.gutter + drawn.width).toBeLessThanOrEqual(columns)
          expect(drawn.bars.every(row => row.length === drawn.width)).toBe(true)
        }
      }
    }
  })
})
