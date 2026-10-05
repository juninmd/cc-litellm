import type { Usage, UsageDay, UsageModel } from '../types'
import type { Change } from './format'
import { change } from './format'

/** How many days of history the proxy is asked for; the pane shows the last 7, 14 or all 30 of them. */
export const USAGE_DAYS = 30
export const RANGES: readonly number[] = [7, 14, 30]

export type UsageTotals = {
  days: UsageDay[]
  spend: number
  requests: number
  failed: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  /** Every model that did something in the range, the one that spent most first. */
  models: UsageModel[]
  /** Spend per day over the whole range, today's part-day included. */
  average: number
  /** The day that spent most; null when nothing was spent. */
  peak: UsageDay | null
  /** Days with some spend or some request. */
  activeDays: number
}

export type Trend = { current: number; previous: number; change: Change }

const sum = (days: readonly UsageDay[], pick: (day: UsageDay) => number): number =>
  days.reduce((total, day) => total + pick(day), 0)

/** Alphabetical order, for a sort that needs a name to break a tie. */
export const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The next range after `range` in 7, 14, 30 and back to 7; a range nobody knows starts over at 7. */
export const nextRange = (range: number): number => {
  const at = RANGES.indexOf(range)

  return RANGES[(at + 1) % RANGES.length] ?? 7
}

/** Totals over the last `count` days of the history (all of it when it is shorter). */
export const usageOver = (usage: Usage, count: number): UsageTotals => {
  const days = usage.days.slice(-Math.max(1, count))
  const perModel = new Map<string, UsageModel>()
  let peak: UsageDay | null = null

  for (const day of days) {
    for (const item of day.models) {
      const held = perModel.get(item.model)

      perModel.set(item.model, {
        model: item.model,
        spend: (held?.spend ?? 0) + item.spend,
        requests: (held?.requests ?? 0) + item.requests,
        tokens: (held?.tokens ?? 0) + item.tokens,
      })
    }
    if (day.spend > (peak?.spend ?? 0)) {
      peak = day
    }
  }
  const spend = sum(days, day => day.spend)

  return {
    days,
    spend,
    requests: sum(days, day => day.requests),
    failed: sum(days, day => day.failed),
    tokens: sum(days, day => day.tokens),
    inputTokens: sum(days, day => day.inputTokens),
    outputTokens: sum(days, day => day.outputTokens),
    cacheReadTokens: sum(days, day => day.cacheReadTokens),
    models: [...perModel.values()].sort((a, b) => b.spend - a.spend || byName(a.model, b.model)),
    average: days.length === 0 ? 0 : spend / days.length,
    peak,
    activeDays: days.filter(day => day.spend > 0 || day.requests > 0).length,
  }
}

/**
 * The `count` full days up to yesterday against the `count` days before them. Today is left out, since it is not over
 * and would always look like a drop. Null when the history is too short to hold both, or the earlier days spent nothing.
 */
export const usageTrend = (usage: Usage, count: number): Trend | null => {
  const done = usage.days.slice(0, -1)

  if (done.length < count * 2) {
    return null
  }
  const current = sum(done.slice(-count), day => day.spend)
  const previous = sum(done.slice(-count * 2, -count), day => day.spend)
  const moved = change(current, previous)

  return moved === null ? null : { current, previous, change: moved }
}

/**
 * What the key has spent per day lately: the last full days, up to a week, counted from the first one with any spend, so
 * a young key is not averaged with the days before it existed. Null when none of them spent anything.
 */
export const recentDaily = (usage: Usage): number | null => {
  const done = usage.days.slice(0, -1).slice(-7)
  const first = done.findIndex(day => day.spend > 0)

  if (first < 0) {
    return null
  }
  const used = done.slice(first)

  return sum(used, day => day.spend) / used.length
}
