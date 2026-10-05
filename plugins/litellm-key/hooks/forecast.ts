import type { Budget, Session } from '../types'
import { percent } from './format'

const DAY_MS = 86_400_000
const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: DAY_MS,
  w: 7 * DAY_MS,
  mo: 30 * DAY_MS,
}

// A pace needs some history: too early in a window, one burst of spend would be read as the rate for the whole period.
const MIN_ELAPSED_MS = 15 * 60_000
const MIN_ELAPSED_SHARE = 0.1

export type Forecast = {
  /** Where the rate comes from: this budget window so far, or what the key spent per day lately. */
  basis: 'window' | 'recent'
  perDay: number
  /** What the budget will hold at its reset if the pace holds. Only the window basis knows the reset. */
  projected: number | null
  projectedPct: number | null
  /** When the cap is reached at this pace: now, once it is. */
  emptyAt: number
  /** The cap is reached before the budget resets. */
  beforeReset: boolean
}

/** LiteLLM writes a budget period as "30s", "45m", "24h", "30d", "1w" or "1mo" (a month is 30 days). */
export const parseDuration = (text: string | null | undefined): number | null => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(mo|s|m|h|d|w)\s*$/i.exec(text ?? '')
  const unit = UNITS[(match?.[2] ?? '').toLowerCase()]
  const count = Number(match?.[1])

  return unit === undefined || !(count > 0) ? null : count * unit
}

/**
 * Where the spend is heading. In the middle of a budget window the rate is what the window has spent so far; when the
 * window is unknown or only just began, `recentPerDay` (what the key spent per day lately) stands in. Null when there
 * is no cap, nothing spent yet, or no rate to go by.
 */
export const forecast = (budget: Budget, now: number, recentPerDay: number | null = null): Forecast | null => {
  const { limit, spend, resetAt } = budget

  if (limit === null || !Number.isFinite(limit) || !(limit > 0) || !Number.isFinite(spend) || !(spend > 0)) {
    return null
  }
  const left = limit - spend
  const length = parseDuration(budget.duration)

  if (length !== null && resetAt !== null && resetAt > now) {
    const elapsed = now - (resetAt - length)

    if (elapsed >= Math.max(MIN_ELAPSED_MS, length * MIN_ELAPSED_SHARE)) {
      const perMs = spend / elapsed
      const emptyAt = left <= 0 ? now : now + left / perMs
      const projected = perMs * length

      return {
        basis: 'window',
        perDay: perMs * DAY_MS,
        projected,
        projectedPct: percent(projected, limit),
        emptyAt,
        beforeReset: emptyAt < resetAt,
      }
    }
  }
  if (recentPerDay !== null && recentPerDay > 0) {
    const emptyAt = left <= 0 ? now : now + (left / recentPerDay) * DAY_MS

    return {
      basis: 'recent',
      perDay: recentPerDay,
      projected: null,
      projectedPct: null,
      emptyAt,
      beforeReset: resetAt !== null && resetAt > now && emptyAt < resetAt,
    }
  }

  return null
}

export const beginSession = (at: number, spend: number): Session => ({ since: at, spend: 0, last: spend })

/** Adds what a new reading shows. A reading below the last one means the budget reset: all of it is new. */
export const advanceSession = (session: Session, spend: number): Session => ({
  since: session.since,
  spend: session.spend + (spend >= session.last ? spend - session.last : spend),
  last: spend,
})
