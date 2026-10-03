import { describe, expect, test } from 'claude-code/testing'

import {
  bar,
  compact,
  maskKey,
  money,
  percent,
  plural,
  redact,
  span,
  sparkline,
  truncate,
  until,
  utcDay,
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
