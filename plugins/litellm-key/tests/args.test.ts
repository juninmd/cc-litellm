import { describe, expect, test } from 'claude-code/testing'

import { parseArgs, parseCount, parseDuration, parseMoney, tokenize } from '../hooks/args'

const BOOLEANS = new Set(['yes', 'set'])

describe('tokenize', () => {
  test('splits on whitespace and keeps quoted values together', () => {
    expect(tokenize('new "my key" --models a,b')).toEqual(['new', 'my key', '--models', 'a,b'])
    expect(tokenize("x 'it is' y")).toEqual(['x', 'it is', 'y'])
  })

  test('keeps an empty quoted value and ignores extra spaces', () => {
    expect(tokenize('  a   ""  b ')).toEqual(['a', '', 'b'])
    expect(tokenize('')).toEqual([])
  })
})

describe('parseArgs', () => {
  test('reads positionals, valued flags, = flags and boolean flags', () => {
    const parsed = parseArgs('new ci --budget 10 --every=30d --yes extra', BOOLEANS)

    expect(parsed.positional).toEqual(['new', 'ci', 'extra'])
    expect(parsed.flags).toEqual({ budget: '10', every: '30d', yes: true })
    expect(parsed.errors).toEqual([])
  })

  test('a boolean flag never swallows the next word', () => {
    expect(parseArgs('--set 5', BOOLEANS)).toMatchObject({ positional: ['5'], flags: { set: true } })
  })

  test('-y is --yes, and a negative number stays a positional', () => {
    expect(parseArgs('-y -5', BOOLEANS)).toMatchObject({ positional: ['-5'], flags: { yes: true } })
  })

  test('a valued flag at the end is an error, not a silent true', () => {
    expect(parseArgs('--budget', BOOLEANS).errors).toEqual(['--budget needs a value'])
  })

  test('flag names are case-insensitive', () => {
    expect(parseArgs('--YES', BOOLEANS).flags).toEqual({ yes: true })
  })
})

describe('parseMoney', () => {
  test('accepts plain, decimal and $-prefixed amounts', () => {
    expect(parseMoney('10', 'x')).toEqual({ ok: true, value: 10 })
    expect(parseMoney('$2.50', 'x')).toEqual({ ok: true, value: 2.5 })
    expect(parseMoney('0.0001', 'x')).toEqual({ ok: true, value: 0.0001 })
  })

  test('rejects zero, negatives, non-numbers, exponents, commas, long decimals and huge amounts', () => {
    for (const input of ['', '0', '-5', 'abc', '1e9', '10,5', '1.23456', '999999999999', undefined, 'Infinity', 'NaN']) {
      expect(parseMoney(input, 'The amount').ok).toBe(false)
    }
  })

  test('names the field it is validating', () => {
    const result = parseMoney('nope', '--budget')

    expect(!result.ok && result.message).toContain('--budget')
  })
})

describe('parseDuration and parseCount', () => {
  test('durations take a count and a LiteLLM unit', () => {
    for (const ok of ['30d', '12h', '1w', '1mo', '90m', '30s', '30D']) {
      expect(parseDuration(ok, 'x').ok).toBe(true)
    }
    for (const bad of ['30', 'd', '0d', '-1d', '30x', '1.5d', '30 d', '9999999d']) {
      expect(parseDuration(bad, 'x').ok).toBe(false)
    }
  })

  test('counts are whole numbers above zero', () => {
    expect(parseCount('60', 'x')).toEqual({ ok: true, value: 60 })
    for (const bad of ['0', '-1', '1.5', 'a', '', '1e3']) {
      expect(parseCount(bad, 'x').ok).toBe(false)
    }
  })
})
