import { describe, expect, test } from 'claude-code/testing'

import {
  ago,
  bar,
  change,
  columnChart,
  compact,
  gauge,
  isoDay,
  maskKey,
  miniBar,
  money,
  percent,
  plural,
  redact,
  shortDate,
  shortMoney,
  span,
  sparkline,
  truncate,
  until,
  utcDay,
  weekday,
} from '../hooks/format'

describe('money', () => {
  test('keeps cents, groups thousands and keeps tiny amounts visible', () => {
    expect(money(0)).toBe('$0.00')
    expect(money(12.5)).toBe('$12.50')
    expect(money(1234567.891)).toBe('$1,234,567.89')
    expect(money(0.0042)).toBe('$0.0042')
    expect(money(0.00001)).toBe('<$0.0001')
    expect(money(-3)).toBe('-$3.00')
  })

  test('has a dash for a missing value', () => {
    expect(money(null)).toBe('—')
    expect(money(undefined)).toBe('—')
    expect(money(Number.NaN)).toBe('—')
  })
})

describe('numbers', () => {
  test('compact shortens big counts', () => {
    expect(compact(812)).toBe('812')
    expect(compact(34500)).toBe('34.5k')
    expect(compact(1_000_000)).toBe('1M')
    expect(compact(5_120_000)).toBe('5.1M')
    expect(compact(2_300_000_000)).toBe('2.3B')
  })

  test('percent is rounded and null without a positive limit', () => {
    expect(percent(26.1, 50)).toBe(52)
    expect(percent(5, 0)).toBeNull()
    expect(percent(5, null)).toBeNull()
  })

  test('plural counts', () => {
    expect(plural(1, 'request')).toBe('1 request')
    expect(plural(3, 'request')).toBe('3 requests')
  })
})

describe('charts', () => {
  test('bar fills in proportion and clamps', () => {
    expect(bar(0.5, 10)).toBe('█████░░░░░')
    expect(bar(2, 4)).toBe('████')
    expect(bar(-1, 4)).toBe('░░░░')
    expect(bar(Number.NaN, 4)).toBe('░░░░')
  })

  test('sparkline scales to the biggest value', () => {
    expect(sparkline([0, 0, 0])).toBe('▁▁▁')
    expect(sparkline([0, 4, 8])).toBe('▁▅█')
    expect(sparkline([])).toBe('')
  })

  test('gauge fills in eighths of a cell, filled part and empty track apart', () => {
    expect(gauge(0.5, 10)).toEqual({ filled: '█████', empty: '░░░░░' })
    expect(gauge(0.83, 30)).toEqual({ filled: `${'█'.repeat(24)}▉`, empty: '░'.repeat(5) })
    expect(gauge(0.25, 4)).toEqual({ filled: '█', empty: '░░░' })
    expect(gauge(0.3125, 4)).toEqual({ filled: '█▎', empty: '░░' })
  })

  test('gauge shows a little use, never calls a nearly full bar full, and has no width to give at zero', () => {
    expect(gauge(0.001, 10)).toEqual({ filled: '▏', empty: '░'.repeat(9) })
    expect(gauge(0.999, 10)).toEqual({ filled: `${'█'.repeat(9)}▉`, empty: '' })
    expect(gauge(1, 10)).toEqual({ filled: '█'.repeat(10), empty: '' })
    expect(gauge(7, 10)).toEqual({ filled: '█'.repeat(10), empty: '' })
    expect(gauge(0, 3)).toEqual({ filled: '', empty: '░░░' })
    expect(gauge(Number.NaN, 3)).toEqual({ filled: '', empty: '░░░' })
    expect(gauge(0.5, 0)).toEqual({ filled: '', empty: '' })
  })

  test('miniBar is a whole-cell meter that shows a little and never calls a nearly full one full', () => {
    expect(miniBar(0.25, 6)).toBe('▰▰▱▱▱▱')
    expect(miniBar(0.001, 6)).toBe('▰▱▱▱▱▱')
    expect(miniBar(0.999, 6)).toBe('▰▰▰▰▰▱')
    expect(miniBar(1, 6)).toBe('▰▰▰▰▰▰')
    expect(miniBar(2, 3)).toBe('▰▰▰')
    expect(miniBar(0, 3)).toBe('▱▱▱')
    expect(miniBar(Number.NaN, 3)).toBe('▱▱▱')
  })

  test('miniBar has nothing to draw in no width at all', () => {
    expect(miniBar(0.5, 0)).toBe('')
    expect(miniBar(1, -3)).toBe('')
    expect(miniBar(1, Number.NaN)).toBe('')
  })

  test('columnChart draws one bar per value, tallest to the top, in rows from the top down', () => {
    expect(columnChart([0, 4, 8], 2, 1, 1)).toEqual(['    █', '  █ █'])
    expect(columnChart([1, 8], 1, 1, 0)).toEqual(['▁█'])
    expect(columnChart([2, 8], 1, 2, 1)).toEqual(['▂▂ ██'])
  })

  test('columnChart keeps a tiny value visible and draws nothing for zeros', () => {
    expect(columnChart([0.001, 100], 1, 1, 0)).toEqual(['▁█'])
    expect(columnChart([0, 0, 0], 2, 1, 1)).toEqual(['     ', '     '])
    expect(columnChart([], 3, 1, 1)).toEqual(['', '', ''])
  })
})

describe('time', () => {
  test('span drops the small units of long spans', () => {
    expect(span(30_000)).toBe('30s')
    expect(span(5 * 60_000)).toBe('5m')
    expect(span(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m')
    expect(span(4 * 86_400_000 + 3 * 3_600_000)).toBe('4d 3h')
    expect(span(41 * 86_400_000 + 3 * 3_600_000)).toBe('41d')
    expect(span(6 * 86_400_000 + 12 * 3_600_000 - 400)).toBe('6d 12h')
    expect(span(59_900)).toBe('59s')
  })

  test('until looks both ways', () => {
    expect(until(null, 1000)).toBeNull()
    expect(until(1000 + 2 * 3_600_000, 1000)).toBe('in 2h')
    expect(until(1000, 1000 + 2 * 3_600_000)).toBe('2h ago')
  })

  test('utcDay counts back in whole days', () => {
    const night = Date.parse('2026-10-03T01:00:00Z')

    expect(utcDay(night, 0)).toBe('2026-10-03')
    expect(utcDay(night, 6)).toBe('2026-09-27')
  })

  test('ago says just now for a moment and counts after that', () => {
    expect(ago(1000, 4000)).toBe('just now')
    expect(ago(5000, 1000)).toBe('just now')
    expect(ago(0, 12_000)).toBe('12s ago')
    expect(ago(0, 125_000)).toBe('2m ago')
  })

  test('weekday and shortDate read a proxy day, and say nothing about nonsense', () => {
    expect(weekday('2026-10-03')).toBe('Sat')
    expect(weekday('2026-10-05')).toBe('Mon')
    expect(shortDate('2026-10-03')).toBe('Oct 3')
    expect(shortDate('2026-12-25')).toBe('Dec 25')
    expect(weekday('nope')).toBe('')
    expect(shortDate('nope')).toBe('nope')
  })

  test('isoDay is the UTC day of a timestamp', () => {
    expect(isoDay(Date.parse('2026-10-03T23:59:59Z'))).toBe('2026-10-03')
    expect(isoDay(Date.parse('2026-10-04T00:00:00Z'))).toBe('2026-10-04')
  })
})

describe('shapes', () => {
  test('shortMoney stays within about six cells', () => {
    expect(shortMoney(0)).toBe('$0')
    expect(shortMoney(0.004)).toBe('<$0.01')
    expect(shortMoney(0.42)).toBe('$0.42')
    expect(shortMoney(9.5)).toBe('$9.50')
    expect(shortMoney(12.34)).toBe('$12.3')
    expect(shortMoney(12.04)).toBe('$12')
    expect(shortMoney(412)).toBe('$412')
    expect(shortMoney(1234)).toBe('$1.2k')
    expect(shortMoney(123_456)).toBe('$123k')
    expect(shortMoney(2_500_000)).toBe('$2.5M')
    expect(shortMoney(-3.5)).toBe('-$3.50')
    expect(shortMoney(Number.NaN)).toBe('—')
  })

  test('change is how far it moved, in whole percent, and nothing without a past', () => {
    expect(change(120, 100)).toEqual({ pct: 20, direction: 'up' })
    expect(change(80, 100)).toEqual({ pct: 20, direction: 'down' })
    expect(change(100, 100)).toEqual({ pct: 0, direction: 'flat' })
    expect(change(5, 0)).toBeNull()
    expect(change(Number.NaN, 4)).toBeNull()
  })
})

describe('secrets', () => {
  test('maskKey keeps only the end', () => {
    expect(maskKey('sk-abcdefgh1234')).toBe('sk-…1234')
    expect(maskKey('abcdefghijkl')).toBe('…ijkl')
    expect(maskKey('short')).toBe('••••')
  })

  test('redact hides the given secrets, sk- keys and bearer tokens', () => {
    const secret = 'sk-test-secret-1234567890'

    expect(redact(`bad key ${secret}`, [secret])).not.toContain(secret)
    expect(redact('Authorization: Bearer abcdef123456')).toBe('Authorization: Bearer …')
    expect(redact('got sk-AAAABBBBCCCC here')).toBe('got sk-… here')
    expect(redact('nothing to hide')).toBe('nothing to hide')
  })

  test('truncate adds an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(truncate('abc', 4)).toBe('abc')
  })
})
