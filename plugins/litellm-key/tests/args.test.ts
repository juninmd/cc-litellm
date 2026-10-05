import { describe, expect, test } from 'claude-code/testing'

import { closest, parseDay, rangeIn, splitArgs, strayNumber } from '../hooks/args'

describe('splitArgs', () => {
  test('takes the first word as it was typed and the rest apart', () => {
    expect(splitArgs('  Usage  30 ')).toEqual({ word: 'Usage', rest: ['30'] })
    expect(splitArgs('copy usage 14')).toEqual({ word: 'copy', rest: ['usage', '14'] })
  })

  test('has nothing to say about nothing', () => {
    expect(splitArgs('')).toEqual({ word: '', rest: [] })
    expect(splitArgs('   ')).toEqual({ word: '', rest: [] })
  })
})

describe('rangeIn', () => {
  test('finds the first word that names a range, with or without the d', () => {
    expect(rangeIn(['14'], [7, 14, 30], 7)).toBe(14)
    expect(rangeIn(['30d'], [7, 14, 30], 7)).toBe(30)
    expect(rangeIn(['usage', '14D'], [7, 14, 30], 7)).toBe(14)
  })

  test('falls back for a word that is no range, or no word at all', () => {
    expect(rangeIn([], [7, 14, 30], 7)).toBe(7)
    expect(rangeIn(['9'], [7, 14, 30], 14)).toBe(14)
    expect(rangeIn(['x14', '1.4e1'], [7, 14, 30], 7)).toBe(7)
  })
})

describe('strayNumber', () => {
  test('names a number that is no range, so the person can be told', () => {
    expect(strayNumber(['9'], [7, 14, 30])).toBe('9')
    expect(strayNumber(['usage', '45d'], [7, 14, 30])).toBe('45d')
  })

  test('has none to name when every number is a range, or there are no numbers', () => {
    expect(strayNumber(['14'], [7, 14, 30])).toBeNull()
    expect(strayNumber(['opus'], [7, 14, 30])).toBeNull()
    expect(strayNumber([], [7, 14, 30])).toBeNull()
  })
})

describe('closest', () => {
  const words = ['usage', 'models', 'compare', 'copy', 'check', 'csv', 'debug', 'day', 'ping']

  test('finds the word a slip of the fingers was after', () => {
    expect(closest('usgae', words)).toBe('usage')
    expect(closest('modles', words)).toBe('models')
    expect(closest('comapre', words)).toBe('compare')
    expect(closest('Debgu', words)).toBe('debug')
  })

  test('counts a swap of two neighbours as one slip, which a short command needs', () => {
    expect(closest('hlep', ['help', 'usage'])).toBe('help')
    expect(closest('ifno', ['info', 'usage'])).toBe('info')
    expect(closest('pnig', ['ping', 'pace'])).toBe('ping')
    expect(closest('dya', ['day', 'debug'])).toBe('day')
  })

  test('takes the start of a word as the word', () => {
    expect(closest('mod', words)).toBe('models')
    expect(closest('com', words)).toBe('compare')
  })

  test('holds a short word to a tighter standard, and knows when nothing is near', () => {
    expect(closest('dax', words)).toBe('day')
    expect(closest('xyz', words)).toBeNull()
    expect(closest('wat', words)).toBeNull()
    expect(closest('', words)).toBeNull()
  })

  test('takes the nearest word when more than one is near', () => {
    expect(closest('chek', words)).toBe('check')
    expect(closest('cop', words)).toBe('copy')
  })
})

describe('parseDay', () => {
  // Ten days ending on Sat Oct 3, 2026.
  const days = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']

  test('knows today and yesterday', () => {
    expect(parseDay('', days)).toBe('2026-10-03')
    expect(parseDay('today', days)).toBe('2026-10-03')
    expect(parseDay('Yesterday', days)).toBe('2026-10-02')
  })

  test('reads a whole date, and a date without the year, in the history', () => {
    expect(parseDay('2026-09-28', days)).toBe('2026-09-28')
    expect(parseDay('09-28', days)).toBe('2026-09-28')
    expect(parseDay('9/28', days)).toBe('2026-09-28')
    expect(parseDay('10-3', days)).toBe('2026-10-03')
  })

  test('takes a weekday as the latest one the history has, today included', () => {
    expect(parseDay('sat', days)).toBe('2026-10-03')
    expect(parseDay('Thursday', days)).toBe('2026-10-01')
    expect(parseDay('mon', days)).toBe('2026-09-28')
  })

  test('has no day for what is not in the history, or is not a day', () => {
    expect(parseDay('2025-01-01', days)).toBeNull()
    expect(parseDay('02-30', days)).toBeNull()
    expect(parseDay('someday', days)).toBeNull()
    expect(parseDay('mo', days)).toBeNull()
    expect(parseDay('today', [])).toBeNull()
    expect(parseDay('yesterday', ['2026-10-03'])).toBeNull()
  })
})
