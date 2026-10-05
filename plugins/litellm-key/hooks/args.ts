import { weekday } from './format'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** What was typed after `/litellm`: the first word as it was written, and the words after it. */
export const splitArgs = (raw: string): { word: string; rest: string[] } => {
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

/** Whether `words` carries a number that is not one of the `allowed` ranges, to tell the person instead of guessing. */
export const strayNumber = (words: readonly string[], allowed: readonly number[]): string | null =>
  words.find(word => /^\d+d?$/i.test(word) && !allowed.includes(Number.parseInt(word, 10))) ?? null

const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, at) => at)

  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]

    for (let j = 1; j <= b.length; j += 1) {
      next.push(
        Math.min(
          (row[j] ?? 0) + 1,
          (next[j - 1] ?? 0) + 1,
          (row[j - 1] ?? 0) + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1),
        ),
      )
    }
    row = next
  }

  return row[b.length] ?? Math.max(a.length, b.length)
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
