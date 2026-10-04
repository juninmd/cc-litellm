import type { Snapshot } from '../types'
import { money, until } from './format'

/** Spent up means the proxy rejects requests; 99.6% rounds to 100% on screen, but it is not spent up. */
export const isSpentUp = (spend: number, limit: number | null): limit is number => limit !== null && spend >= limit

/** A budget that is spent up: what it is, how much of what, and when it resets. */
export type Exceeded = { label: string; spend: number; limit: number; resets: string | null }

const over = (label: string, spend: number, limit: number | null, resetAt: number | null, now: number): Exceeded | null =>
  isSpentUp(spend, limit) ? { label, spend, limit, resets: resetAt === null ? null : until(resetAt, now) } : null

/** Every budget that is spent up (the proxy rejects requests while one is); empty when all is normal. */
export const exceededItems = (snapshot: Snapshot, now: number): Exceeded[] => {
  const { key, team, user } = snapshot

  return [
    over(`key ${key.alias ?? snapshot.keyHint}`, key.budget.spend, key.budget.limit, key.budget.resetAt, now),
    team && over(`team ${team.label}`, team.budget.spend, team.budget.limit, team.budget.resetAt, now),
    user && over(`user ${user.label}`, user.budget.spend, user.budget.limit, user.budget.resetAt, now),
    ...key.windows.map(window => over(`window ${window.duration}`, window.spend ?? 0, window.limit, window.resetAt, now)),
    ...key.modelBudgets.map(item => over(`model ${item.model}`, item.spend, item.limit, null, now)),
  ].filter((item): item is Exceeded => item !== null && item !== undefined)
}

export const exceededLine = (item: Exceeded): string =>
  `${item.label}: ${money(item.spend)} of ${money(item.limit)}${item.resets ? ` · resets ${item.resets}` : ''}`

/** The same budgets, one line each. */
export const exceededBudgets = (snapshot: Snapshot, now: number): string[] => exceededItems(snapshot, now).map(exceededLine)
