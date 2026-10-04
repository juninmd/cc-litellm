import type { Snapshot } from '../types'
import { isSpentUp } from './exceeded'
import { money, until } from './format'
import type { Tone } from './summary'

const DAY_MS = 86_400_000
// Past a year at this pace the answer is "never", and the cap already says that.
const HORIZON_DAYS = 365
const SOON_DAYS = 3

/** When the key's budget runs out at the pace of the last days, set against its reset. */
export type Runway =
  | { kind: 'runs-out'; at: number; perDay: number; resetAt: number }
  | { kind: 'lasts'; perDay: number; resetAt: number }
  | { kind: 'open'; at: number; perDay: number }

export const runway = (snapshot: Snapshot, now: number): Runway | null => {
  const { key, usage } = snapshot
  const { limit, spend, resetAt } = key.budget

  // Without the key's hash the usage covers every key of the user, and a pace set against one key's cap would lie.
  if (key.status !== 'active' || key.keyHash === null || !usage || limit === null || isSpentUp(spend, limit)) {
    return null
  }
  // A reset that is due zeroes the spend: a pace against the old number says nothing.
  if (resetAt !== null && resetAt <= now) {
    return null
  }
  // The usage window opens at 00:00 UTC of its first day, so it is 6 to 7 days long; a younger key lived less of it.
  // No days gives NaN, and the guard below turns that into no forecast.
  const opened = Date.parse(`${usage.days[0]?.date}T00:00:00Z`)
  const observed = Math.max(1, (now - Math.max(opened, key.createdAt ?? opened)) / DAY_MS)
  const perDay = usage.spend / observed

  if (!(perDay > 0)) {
    return null
  }
  const daysLeft = (limit - spend) / perDay
  const at = now + daysLeft * DAY_MS

  if (resetAt !== null) {
    return at < resetAt ? { kind: 'runs-out', at, perDay, resetAt } : { kind: 'lasts', perDay, resetAt }
  }

  return daysLeft > HORIZON_DAYS ? null : { kind: 'open', at, perDay }
}

const isUrgent = (found: Runway, now: number): boolean =>
  found.kind === 'runs-out' || (found.kind === 'open' && found.at - now < SOON_DAYS * DAY_MS)

/** The row for the pane and `/litellm info`. */
export const runwayRow = (found: Runway, now: number): { text: string; tone: Tone } => {
  const pace = `${money(found.perDay)}/day`

  switch (found.kind) {
    case 'runs-out':
      return { text: `out ${until(found.at, now)} at ${pace} · resets ${until(found.resetAt, now)}`, tone: 'warn' }
    case 'lasts':
      return { text: `lasts until the reset at ${pace}`, tone: 'ok' }
    default:
      return { text: `out ${until(found.at, now)} at ${pace}`, tone: isUrgent(found, now) ? 'warn' : 'ok' }
  }
}

/** The short warning for the status line: when the budget runs out before its reset, or soon when it has none. */
export const runwayAlert = (snapshot: Snapshot, now: number): string | null => {
  const found = runway(snapshot, now)

  return found && found.kind !== 'lasts' && isUrgent(found, now) ? `out ${until(found.at, now)} at this pace` : null
}
