import type { Failure, Snapshot } from '../types'
import { SOON_MS, facts } from './facts'
import { ago, money, percent, until } from './format'
import { allowance, allowanceText, dailyOver } from './guidance'
import { table } from './report-days'
import { runwayAlert } from './runway'
import type { Row } from './summary'
import { budgetText, meters, oneLine } from './summary'

const PACE_LABELS = ['Runway', 'Allowance', 'Headroom', 'Today', 'Session']

/**
 * Where the budget stands and where it is heading, as text: the runway, what it can spend a day to last until the reset
 * and how many requests that is, with the allowance of the team and the user when they have a budget.
 */
export const paceReport = (snapshot: Snapshot, now: number): string => {
  const { key } = snapshot
  const own = facts(snapshot, now).filter(row => PACE_LABELS.includes(row.label))
  const rows: Row[] = [{ label: 'Budget', text: budgetText(key.budget, now), tone: 'ok' }]

  if (key.budget.limit !== null && key.budget.spend < key.budget.limit && !own.some(row => row.label === 'Runway')) {
    rows.push({ label: 'Runway', text: 'no pace to show: it needs the usage history, and some spend in it', tone: 'ok' })
  }
  const lines = [`Pace · ${key.alias ?? key.keyName ?? snapshot.keyHint} · ${snapshot.host}`, ...table([...rows, ...own])]

  for (const [kind, related] of [
    ['Team', snapshot.team],
    ['User', snapshot.user],
  ] as const) {
    if (related !== null) {
      const room = allowance(related.budget, now)
      const there: Row[] = [{ label: 'Budget', text: budgetText(related.budget, now), tone: 'ok' }]

      if (room !== null) {
        there.push({ label: 'Allowance', ...allowanceText(room) })
      }
      lines.push('', `${kind} ${related.label}`, ...table(there, '  '))
    }
  }

  return lines.join('\n')
}

export type CheckAlert = { tone: 'error' | 'warn'; text: string }

/** What needs a look right now: a key that is not active, caps near or past, a pace that will not last. */
export const checkAlerts = (snapshot: Snapshot, now: number, warnPercent: number, dailyAlert: number): CheckAlert[] => {
  const { key } = snapshot
  const found: CheckAlert[] = []

  if (key.status !== 'active') {
    found.push({ tone: 'error', text: `The key is ${key.status}` })
  } else if (key.expiresAt !== null && key.expiresAt - now < SOON_MS) {
    const isExpired = key.expiresAt <= now

    found.push({ tone: isExpired ? 'error' : 'warn', text: `The key ${isExpired ? 'expired' : 'expires'} ${until(key.expiresAt, now)}` })
  }
  for (const meter of meters(snapshot, now, warnPercent)) {
    const pct = percent(meter.used, meter.limit)
    const name = meter.label === 'Budget' ? 'Key budget' : meter.label
    const amounts = `${money(meter.used)} of ${money(meter.limit)}`

    if (pct !== null && meter.tone === 'error') {
      found.push({ tone: 'error', text: `${name} is over its cap: ${amounts}` })
    } else if (pct !== null && meter.tone === 'warn') {
      found.push({ tone: 'warn', text: `${name} is at ${pct}%: ${amounts}` })
    }
  }
  const pace = runwayAlert(snapshot, now)

  if (pace !== null) {
    found.push({ tone: 'warn', text: `Key budget: ${pace}` })
  }
  const over = dailyOver(snapshot, now, dailyAlert)

  if (over !== null) {
    found.push({ tone: 'warn', text: `Today's spend is ${money(over)}, over your daily alert of ${money(dailyAlert)}` })
  }

  // the worst first
  return [...found.filter(item => item.tone === 'error'), ...found.filter(item => item.tone === 'warn')]
}

export type Level = 'ok' | 'warning' | 'critical' | 'unknown'

/** Words and exit codes of the Nagios convention, which every monitoring script already reads: 0, 1, 2, 3. */
export type Verdict = { level: Level; exitCode: 0 | 1 | 2 | 3; text: string }

const LEVELS: Record<Level, { word: string; exitCode: 0 | 1 | 2 | 3 }> = {
  ok: { word: 'OK', exitCode: 0 },
  warning: { word: 'WARNING', exitCode: 1 },
  critical: { word: 'CRITICAL', exitCode: 2 },
  unknown: { word: 'UNKNOWN', exitCode: 3 },
}

/** How the key stands, as one word, for a person or a script: no alert, a warning, a problem, or no way to tell. */
export const levelOf = (list: readonly CheckAlert[]): Exclude<Level, 'unknown'> =>
  list.some(item => item.tone === 'error') ? 'critical' : list.length > 0 ? 'warning' : 'ok'

/**
 * The verdict on the key. A reading that is not fresh (the proxy failed since) is no ground for a verdict: it is unknown,
 * with what was last seen beside it.
 */
export const checkVerdict = (
  snapshot: Snapshot | null,
  failure: Failure | null,
  now: number,
  warnPercent: number,
  dailyAlert: number,
): Verdict => {
  if (snapshot === null || failure !== null) {
    const seen = snapshot === null ? '' : ` (last good reading ${ago(snapshot.fetchedAt, now)}: ${oneLine(snapshot, now)})`
    const hint = failure?.hint ? `\n${failure.hint}` : ''

    return { level: 'unknown', exitCode: 3, text: `UNKNOWN · ${failure?.message ?? 'nothing was read yet'}${seen}${hint}` }
  }
  const list = checkAlerts(snapshot, now, warnPercent, dailyAlert)
  const level = levelOf(list)
  const { word, exitCode } = LEVELS[level]

  return {
    level,
    exitCode,
    text: [`${word} · ${oneLine(snapshot, now)}`, ...list.map(item => `  ${item.tone === 'error' ? '✗' : '▲'} ${item.text}`)].join('\n'),
  }
}
