import type { Snapshot } from '../types'
import { money, until } from './format'

/** Spent up means the proxy rejects requests; 99.6% rounds to 100% on screen, but it is not spent up. */
export const isSpentUp = (spend: number, limit: number | null): limit is number => limit !== null && spend >= limit

const over = (label: string, spend: number, limit: number | null, resetAt: number | null, now: number): string | null => {
  if (!isSpentUp(spend, limit)) {
    return null
  }
  const resets = resetAt === null ? null : until(resetAt, now)

  return `${label}: ${money(spend)} of ${money(limit)}${resets ? ` · resets ${resets}` : ''}`
}

/** Every budget that is spent up (the proxy rejects requests while one is), one line each; empty when all is normal. */
export const exceededBudgets = (snapshot: Snapshot, now: number): string[] => {
  const { key, team, user } = snapshot

  return [
    over(`key ${key.alias ?? snapshot.keyHint}`, key.budget.spend, key.budget.limit, key.budget.resetAt, now),
    team && over(`team ${team.label}`, team.budget.spend, team.budget.limit, team.budget.resetAt, now),
    user && over(`user ${user.label}`, user.budget.spend, user.budget.limit, user.budget.resetAt, now),
    ...key.windows.map(window => over(`window ${window.duration}`, window.spend ?? 0, window.limit, window.resetAt, now)),
    ...key.modelBudgets.map(item => over(`model ${item.model}`, item.spend, item.limit, null, now)),
  ].filter((line): line is string => typeof line === 'string')
}
