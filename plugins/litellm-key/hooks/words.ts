import { weekday } from './calendar'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** What was typed after `/litellm`: the first word as it was written, and the words after it. */
export const splitWords = (raw: string): { word: string; rest: string[] } => {
  const [word = '', ...rest] = raw.trim().split(/\s+/).filter(Boolean)

  return { word, rest }
}

/** The first word that names one of the `allowed` ranges ("14" or "14d"); `fallback` when none does. */
export const rangeIn = (words: readonly string[], allowed: readonly number[], fallback: number): number => {
  for (const word of words) {
    const match = /^(\d+)d?$/i.exec(word)
    const days = match ? Number(match[1]) : Number.NaN

    if (allowed.includes(days)) {
      return days
    }
  }

  return fallback
}

/** A number among `words` that is not one of the `allowed` ranges, to tell the person instead of guessing. */
export const strayNumber = (words: readonly string[], allowed: readonly number[]): string | null =>
  words.find(word => /^\d+d?$/i.test(word) && !allowed.includes(Number.parseInt(word, 10))) ?? null

/** How many slips of the fingers lie between two words; a swap of two neighbours ("hlep") is one, not two. */
const distance = (a: string, b: string): number => {
  const width = b.length + 1
  const grid = new Array<number>((a.length + 1) * width).fill(0)
  const at = (row: number, column: number): number => grid[row * width + column] ?? 0

  for (let row = 0; row <= a.length; row += 1) {
    for (let column = 0; column <= b.length; column += 1) {
      if (row === 0 || column === 0) {
        grid[row * width + column] = row + column

        continue
      }
      let best = Math.min(
        at(row - 1, column) + 1,
        at(row, column - 1) + 1,
        at(row - 1, column - 1) + (a.charAt(row - 1) === b.charAt(column - 1) ? 0 : 1),
      )

      if (row > 1 && column > 1 && a.charAt(row - 1) === b.charAt(column - 2) && a.charAt(row - 2) === b.charAt(column - 1)) {
        best = Math.min(best, at(row - 2, column - 2) + 1)
      }
      grid[row * width + column] = best
    }
  }

  return at(a.length, b.length)
}

/** The word of `words` that `word` most likely meant, if it is near enough to one to be a slip of the fingers. */
export const closest = (word: string, words: readonly string[]): string | null => {
  const needle = word.toLowerCase()
  let best: string | null = null
  let least = Number.POSITIVE_INFINITY

  if (needle === '') {
    return null
  }
  for (const candidate of words) {
    const gap = distance(needle, candidate)
    const isNear = gap <= (candidate.length >= 5 ? 2 : 1) || (needle.length >= 2 && candidate.startsWith(needle))

    if (isNear && gap < least) {
      best = candidate
      least = gap
    }
  }

  return best
}

const pad = (digits: string): string => digits.padStart(2, '0')

/**
 * The day of the history a person meant, as `YYYY-MM-DD`: "today", "yesterday", a date ("2026-10-03" or "10-03"), or a
 * weekday ("mon", "monday") for the latest one the history has. Null when the words name no day it holds.
 */
export const parseDay = (word: string, days: readonly string[]): string | null => {
  const text = word.trim().toLowerCase()

  if (text === '' || text === 'today') {
    return days[days.length - 1] ?? null
  }
  if (text === 'yesterday') {
    return days[days.length - 2] ?? null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return days.includes(text) ? text : null
  }
  const short = /^(\d{1,2})[-/](\d{1,2})$/.exec(text)

  if (short) {
    const suffix = `-${pad(short[1] ?? '')}-${pad(short[2] ?? '')}`

    return [...days].reverse().find(day => day.endsWith(suffix)) ?? null
  }
  if (text.length >= 3) {
    const name = WEEKDAYS.find(full => full.startsWith(text))

    if (name !== undefined) {
      return [...days].reverse().find(day => weekday(day).toLowerCase() === name.slice(0, 3)) ?? null
    }
  }

  return null
}
