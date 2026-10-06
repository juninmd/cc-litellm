import type { ActivityDay, MetricName, Usage, UsageModel } from '../types'
import type { Change } from './format'
import { change } from './format'

/** The ranges the plugin shows of its 30 days of history. */
export const RANGES: readonly number[] = [7, 14, 30]
/** Ranges that can be set against the same number of days before them: the history holds 30, and today is left out. */
export const COMPARABLE: readonly number[] = [7, 14]
export const METRICS: readonly MetricName[] = ['spend', 'requests', 'tokens']

export type Totals = {
  days: ActivityDay[]
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
  peak: ActivityDay | null
  /** Days with some spend or some request. */
  activeDays: number
}

export type Trend = { current: number; previous: number; change: Change }

const sum = (days: readonly ActivityDay[], pick: (day: ActivityDay) => number): number =>
  days.reduce((total, day) => total + pick(day), 0)

/** Alphabetical order, for a sort that needs a name to break a tie. */
export const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The next metric after `metric` in spend, requests, tokens and back to spend. */
export const nextMetric = (metric: MetricName): MetricName => {
  const at = METRICS.indexOf(metric)

  return METRICS[(at + 1) % METRICS.length] ?? 'spend'
}

/** What a day counts for a metric: the number the chart draws a bar for. */
export const metricOf = (day: ActivityDay, metric: MetricName): number =>
  metric === 'requests' ? day.requests : metric === 'tokens' ? day.tokens : day.spend

/** The next range after `range` in 7, 14, 30 and back to 7; a range nobody knows starts over at 7. */
export const nextRange = (range: number): number => {
  const at = RANGES.indexOf(range)

  return RANGES[(at + 1) % RANGES.length] ?? 7
}

/** What a stretch of days came to, as a whole and model by model. */
export const totalsOf = (days: readonly ActivityDay[]): Totals => {
  const perModel = new Map<string, UsageModel>()
  let peak: ActivityDay | null = null

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
    days: [...days],
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

/** Totals over the last `count` days of the history (all of it when it is shorter). */
export const usageOver = (usage: Usage, count: number): Totals => totalsOf(usage.history.slice(-Math.max(1, count)))

/**
 * The `count` full days up to yesterday against the `count` days before them. Today is left out, since it is not over
 * and would always look like a drop. Null when the history is too short to hold both, or the earlier days spent nothing.
 */
export const usageTrend = (usage: Usage, count: number): Trend | null => {
  const done = usage.history.slice(0, -1)

  if (done.length < count * 2) {
    return null
  }
  const current = sum(done.slice(-count), day => day.spend)
  const previous = sum(done.slice(-count * 2, -count), day => day.spend)
  const moved = change(current, previous)

  return moved === null ? null : { current, previous, change: moved }
}

/** How one model moved between two stretches of days. */
export type Mover = {
  model: string
  current: number
  previous: number
  /** How far it moved; null when it spent nothing before (it is new) or nothing now (it is gone). */
  change: Change | null
  isNew: boolean
  isGone: boolean
}

export type Comparison = {
  count: number
  current: Totals
  previous: Totals
  /** Every model that spent in either stretch, the one that moved most (in money) first. */
  movers: Mover[]
}

/**
 * The `count` full days up to yesterday set against the `count` before them, as a whole and model by model: what changed,
 * and who changed it. Null when the history is too short for both stretches or the earlier one spent nothing.
 */
export const usageCompare = (usage: Usage, count: number): Comparison | null => {
  const done = usage.history.slice(0, -1)

  if (done.length < count * 2) {
    return null
  }
  const current = totalsOf(done.slice(-count))
  const previous = totalsOf(done.slice(-count * 2, -count))

  if (!(previous.spend > 0)) {
    return null
  }
  const then = new Map(previous.models.map(item => [item.model, item.spend]))
  const now = new Map(current.models.map(item => [item.model, item.spend]))
  const movers = [...new Set([...then.keys(), ...now.keys()])]
    .map(model => {
      const after = now.get(model) ?? 0
      const before = then.get(model) ?? 0

      return {
        model,
        current: after,
        previous: before,
        change: change(after, before),
        isNew: before <= 0 && after > 0,
        isGone: after <= 0 && before > 0,
      }
    })
    .filter(item => item.current > 0 || item.previous > 0)
    .sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous) || byName(a.model, b.model))

  return { count, current, previous, movers }
}
