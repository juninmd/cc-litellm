import type { Snapshot } from '../types'
import { isoDay } from './calendar'
import { isSpentUp } from './exceeded'
import { money, until, usedShare } from './format'
import { dailyOver } from './guidance'

const DAY_MS = 86_400_000

export type Alert = { id: string; message: string }

/** What deserves a toast now. The id changes with the budget, its reset and its tier, so each tier is told once. */
export const alertsOf = (snapshot: Snapshot, now: number, warnPercent: number, dailyAlert = 0): Alert[] => {
  const { key } = snapshot
  const who = key.keyName ?? snapshot.keyHint
  // A cap of $0 is used up from the first cent, as the banner and the status line read it.
  const pct = usedShare(key.budget.spend, key.budget.limit)
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
  const over = dailyOver(snapshot, now, dailyAlert)

  if (over !== null) {
    // Once a day, and again the day after; a new limit is a new warning.
    alerts.push({
      id: `daily:${who}:${isoDay(now)}:${dailyAlert}`,
      message: `Today's spend is ${money(over)}, over your daily alert of ${money(dailyAlert)}`,
    })
  }

  return alerts
}
