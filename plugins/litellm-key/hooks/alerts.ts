import type { Snapshot } from '../types'
import { isSpentUp } from './exceeded'
import { money, percent, until } from './format'

const DAY_MS = 86_400_000

export type Alert = { id: string; message: string }

/** What deserves a toast now. The id changes with the budget, its reset and its tier, so each tier is told once. */
export const alertsOf = (snapshot: Snapshot, now: number, warnPercent: number): Alert[] => {
  const { key } = snapshot
  const who = key.keyName ?? snapshot.keyHint
  const pct = percent(key.budget.spend, key.budget.limit)
  const alerts: Alert[] = []

  if (pct !== null) {
    const level = isSpentUp(key.budget.spend, key.budget.limit) ? 100 : pct >= 95 ? 95 : pct >= warnPercent ? warnPercent : 0
    const amounts = `${money(key.budget.spend)} of ${money(key.budget.limit)}`

    if (level > 0) {
      alerts.push({
        id: `budget:${who}:${key.budget.resetAt === null ? 'none' : Math.round(key.budget.resetAt / 60_000)}:${key.budget.limit}:${level}`,
        message: level >= 100 ? `The key is over budget (${amounts})` : `${pct}% of the key budget is used (${amounts})`,
      })
    }
  }
  if (key.status !== 'active') {
    alerts.push({ id: `status:${who}:${key.status}`, message: `The key is ${key.status}` })
  } else if (key.expiresAt !== null && key.expiresAt - now < 3 * DAY_MS) {
    const tier = key.expiresAt - now < DAY_MS ? '1d' : '3d'

    alerts.push({ id: `expiry:${who}:${key.expiresAt}:${tier}`, message: `The key expires ${until(key.expiresAt, now)}` })
  }

  return alerts
}
