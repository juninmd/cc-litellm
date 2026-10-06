import { describe, expect, test } from 'claude-code/testing'

import {
  compact,
  maskKey,
  money,
  percent,
  plural,
  redact,
  rule,
  span,
  gauge,
  sparkline,
  truncate,
  truncateMiddle,
  until,
  usedShare,
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

  test('usedShare reads a cap of $0 as used up, as the banner does, and no cap as none', () => {
    expect(usedShare(26.1, 50)).toBe(52)
    expect(usedShare(0, 0)).toBe(100)
    expect(usedShare(5, null)).toBeNull()
  })

  test('plural counts', () => {
    expect(plural(1, 'request')).toBe('1 request')
    expect(plural(3, 'request')).toBe('3 requests')
  })
})

describe('charts', () => {
  test('gauge fills in eighths of a cell and keeps the track apart', () => {
    expect(gauge(0.5, 10)).toEqual({ full: '█████', track: '░░░░░' })
    expect(gauge(0.3, 4)).toEqual({ full: '█▎', track: '░░' })
    expect(gauge(0, 4)).toEqual({ full: '', track: '░░░░' })
    expect(gauge(2, 4)).toEqual({ full: '████', track: '' })
    expect(gauge(Number.NaN, 4)).toEqual({ full: '', track: '░░░░' })
    expect(gauge(-1, 4)).toEqual({ full: '', track: '░░░░' })
    expect(gauge(0.5, 0)).toEqual({ full: '', track: '' })
    // a hair under the cap still rounds to a full bar, so the tone and the amounts are what tell it apart
    expect(gauge(0.999, 10)).toEqual({ full: '██████████', track: '' })
  })

  test('rule is a slim bar in whole cells, and any share above zero keeps one', () => {
    expect(rule(0.75, 16)).toEqual({ full: '▄'.repeat(12), track: '▁'.repeat(4) })
    expect(rule(0.03, 16)).toEqual({ full: '▄', track: '▁'.repeat(15) })
    expect(rule(0, 4)).toEqual({ full: '', track: '▁▁▁▁' })
    expect(rule(1, 4)).toEqual({ full: '▄▄▄▄', track: '' })
    expect(rule(5, 4)).toEqual({ full: '▄▄▄▄', track: '' })
    expect(rule(Number.NaN, 4)).toEqual({ full: '', track: '▁▁▁▁' })
    expect(rule(0.5, 0)).toEqual({ full: '', track: '' })
  })

  test('sparkline scales to the biggest value', () => {
    expect(sparkline([0, 0, 0])).toBe('···')
    // a day with nothing is a dot: "none" must never look like "a little"
    expect(sparkline([0, 4, 8])).toBe('·▅█')
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

  test('truncateMiddle keeps both ends, so names that differ at the end stay apart', () => {
    const a = 'Model claude-sonnet-4-5'
    const b = 'Model claude-sonnet-4-6'

    expect(truncateMiddle(a, 16)).toBe('Model cl…net-4-5')
    expect(truncateMiddle(a, 16)).toHaveLength(16)
    expect(truncateMiddle(a, 16)).not.toBe(truncateMiddle(b, 16))
    // the plain cut is what made them collide
    expect(truncate(a, 16)).toBe(truncate(b, 16))
    expect(truncateMiddle('abcdef', 6)).toBe('abcdef')
  })

  test('truncateMiddle is exact in the tight cases and never longer than asked', () => {
    expect(truncateMiddle('abcdef', 2)).toBe('a…')
    expect(truncateMiddle('abcdef', 1)).toBe('…')
    expect(truncateMiddle('abcdef', 0)).toBe('')
    for (let max = 0; max <= 12; max += 1) {
      expect(truncateMiddle('abcdefghijklmnopqrstuvwxyz', max).length).toBeLessThanOrEqual(max)
    }
  })
})
