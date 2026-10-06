import { describe, expect, test } from 'claude-code/testing'

import { isoDay, shortDate, weekday } from '../hooks/calendar'
import { ago, change, clean, columnChart, count, redact, shortMoney, times, withoutCredentials } from '../hooks/format'

describe('charts', () => {
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

describe('numbers and time', () => {
  test('count groups the thousands of a whole number', () => {
    expect(count(0)).toBe('0')
    expect(count(1234567)).toBe('1,234,567')
    expect(count(1234.6)).toBe('1,235')
    expect(count(-9876)).toBe('-9,876')
  })

  test('times says how many times, to a tenth under ten', () => {
    expect(times(4.74)).toBe('4.7×')
    expect(times(3)).toBe('3×')
    expect(times(0.4)).toBe('0.4×')
    expect(times(12.4)).toBe('12×')
    expect(times(Number.POSITIVE_INFINITY)).toBe('—')
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

  test('isoDay is the UTC day of a timestamp, and nothing for a time no calendar has', () => {
    expect(isoDay(Date.parse('2026-10-03T23:59:59Z'))).toBe('2026-10-03')
    expect(isoDay(Date.parse('2026-10-04T00:00:00Z'))).toBe('2026-10-04')
    expect(isoDay(1e16)).toBe('')
    expect(isoDay(Number.NaN)).toBe('')
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

describe('what the proxy says goes out clean', () => {
  test('redact hides the sha256 of a key, which is what the proxy knows it by, and the api_key of a url', () => {
    const hash = '0123456789abcdef'.repeat(4)

    expect(redact(`Key Hash (Token) =${hash}. Unable to find token`)).toBe('Key Hash (Token) =…. Unable to find token')
    expect(redact(`${hash.toUpperCase()} and ${hash}`)).toBe('… and …')
    expect(redact('fetching "http://x/user/daily/activity?user_id=jane&api_key=0123456789abcdef0123&page_size=1000"')).toBe(
      'fetching "http://x/user/daily/activity?user_id=jane&api_key=…&page_size=1000"',
    )
    expect(redact('api_key=')).toBe('api_key=')
  })

  test('redact leaves alone what only looks a little like a hash', () => {
    expect(redact('request 0123456789abcdef is done')).toBe('request 0123456789abcdef is done')
    expect(redact(`${'a'.repeat(63)} ${'a'.repeat(65)}`)).toBe(`${'a'.repeat(63)} ${'a'.repeat(65)}`)
  })

  test('redact drops the credentials of a url, up to the last @ of the userinfo', () => {
    expect(redact('Could not reach https://bob:hunter2@litellm.test/key/info')).toBe('Could not reach https://litellm.test/key/info')
    expect(redact('https://bob:p@ss@litellm.test')).toBe('https://litellm.test')
    expect(redact('see https://litellm.test/a@b')).toBe('see https://litellm.test/a@b')
    expect(withoutCredentials('https://bob:p@ss@litellm.test/x')).toBe('https://litellm.test/x')
    expect(withoutCredentials('https://litellm.test/a@b')).toBe('https://litellm.test/a@b')
  })

  test('clean drops what the engine would refuse to draw, and the escape sequences with it', () => {
    expect(clean('\u001b[31mred\u001b[0m text')).toBe('red text')
    expect(clean('title\u001b]0;evil\u0007 here')).toBe('title here')
    expect(clean('a\u0000b\u0007c\u007fd\u0085e')).toBe('abcde')
    expect(clean('keeps\ttabs\nand lines, é, 日本 and 🙂')).toBe('keeps\ttabs\nand lines, é, 日本 and 🙂')
  })

  test('redact cleans too', () => {
    expect(redact('bad \u001b[31mkey\u001b[0m')).toBe('bad key')
  })
})
