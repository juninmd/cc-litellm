import type { Budget, Failure, Session, Snapshot } from '../types'
import { allowance, forecast } from './forecast'
import { ago, change, compact, count, money, percent, plural, shortDate, times, truncate } from './format'
import type { Probe } from './litellm'
import type { Row } from './summary'
import {
  NO_HISTORY,
  alerts,
  budgetText,
  dayDetail,
  eachText,
  facts,
  keyPace,
  oneLine,
  paceRows,
  timeMeter,
  tokensText,
} from './summary'
import type { UsageTotals } from './usage'
import { recentDaily, todayOf, usageCompare, usageOver } from './usage'

export type ReportOptions = {
  session?: Session | null
  isForecast?: boolean
  dailyAlert?: number
  /** Why the reading is not fresh (the proxy failed since), when that is so: a script should know. */
  stale?: string | null
}

/** Rows as lines, the labels lined up in one column. */
const table = (rows: readonly Row[], indent = ''): string[] => {
  const width = Math.max(0, ...rows.map(row => row.label.length))

  return rows.map(row => `${indent}${row.label.padEnd(width)}  ${row.text}`)
}

/**
 * Where the budget stands and where it is heading, as text: the pace, when it runs out, what it can spend a day to last
 * until the reset and how many requests that is, with the same for the team and the user when they have a budget.
 */
export const paceReport = (snapshot: Snapshot, now: number, options: ReportOptions = {}): string => {
  const { key } = snapshot
  const clockRow = timeMeter(snapshot, now)
  const own = facts(snapshot, now, { session: options.session ?? null, isForecast: true }).filter(row =>
    ['Pace', 'Runs out', 'Allowance', 'Headroom', 'Today', 'Session'].includes(row.label),
  )
  const rows: Row[] = [{ label: 'Budget', text: budgetText(key.budget, now), tone: 'ok' }]

  if (clockRow !== null) {
    rows.push({ label: 'Time', text: clockRow.text, tone: 'ok' })
  }
  if (key.budget.limit !== null && key.budget.spend < key.budget.limit && !own.some(row => row.label === 'Pace')) {
    rows.push({ label: 'Pace', text: 'not enough history yet: it takes a tenth of the period, or a few days of usage', tone: 'ok' })
  }
  const lines = [`Pace · ${snapshot.key.alias ?? key.keyName ?? snapshot.keyHint} · ${snapshot.host}`, ...table([...rows, ...own])]

  for (const [kind, related] of [
    ['Team', snapshot.team],
    ['User', snapshot.user],
  ] as const) {
    if (related !== null) {
      const heading = `${kind} ${related.label}`
      const there = paceRows(related.budget, forecast(related.budget, now), now)

      lines.push('', heading, ...table([{ label: 'Budget', text: budgetText(related.budget, now), tone: 'ok' }, ...there], '  '))
    }
  }

  return lines.join('\n')
}

/** What a single day did: its totals, the tokens, the models, and how it compares with the usual day. */
export const dayReport = (snapshot: Snapshot, date: string): string => {
  const detail = dayDetail(snapshot, date)
  const day = snapshot.usage?.days.find(item => item.date === date)

  if (detail === null || day === undefined) {
    return snapshot.usage === null ? NO_HISTORY : `${date} is not in the history, which holds the last ${snapshot.usage.days.length} days.`
  }
  const lines = [`${detail.title} · UTC · ${snapshot.host}`, detail.summary]

  if (day.spend <= 0 && day.requests <= 0) {
    return lines.join('\n')
  }
  const usual = snapshot.usage ? recentDaily(snapshot.usage) : null
  const rows: Row[] = []

  if (day.tokens > 0) {
    rows.push({ label: 'Tokens', text: tokensText(usageOver({ days: [day] }, 1)), tone: 'ok' })
  }
  if (day.failed > 0) {
    rows.push({
      label: 'Failed',
      text: `${plural(day.failed, 'request')} (${((day.failed / Math.max(1, day.requests)) * 100).toFixed(1)}%)`,
      tone: 'warn',
    })
  }
  if (usual !== null && usual >= 0.01 && day.spend > 0) {
    rows.push({ label: 'Usual day', text: `${money(usual)} · this one was ${times(day.spend / usual)} that`, tone: 'ok' })
  }
  lines.push(...table(rows))
  const models = [...day.models].sort((a, b) => b.spend - a.spend)

  if (models.length > 0) {
    lines.push('', 'By model')
    for (const item of models) {
      lines.push(
        `${truncate(item.model, 30).padEnd(31)}${money(item.spend).padStart(10)}${`${day.spend > 0 ? Math.round((item.spend / day.spend) * 100) : 0}%`.padStart(6)}  ${plural(item.requests, 'request')}`,
      )
    }
  }

  return lines.join('\n')
}

/** How far `now` moved from `before`, as a person says it; "new" and "gone" for what has nothing to be measured against. */
const movedText = (now: number, before: number): string => {
  if (before <= 0) {
    return now > 0 ? 'new' : '—'
  }
  if (now <= 0) {
    return 'gone'
  }
  const moved = change(now, before)

  return moved === null ? '—' : moved.direction === 'flat' ? 'unchanged' : `${moved.direction === 'up' ? '▲' : '▼'} ${moved.pct}%`
}

const grid = (head: readonly string[], rows: readonly (readonly string[])[]): string[] => {
  const widths = head.map((title, at) => Math.max(title.length, ...rows.map(row => (row[at] ?? '').length)))
  // The label and the verdict on the left, the amounts between them on the right, in line with their digits.
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, at) =>
        at === 0 || at === cells.length - 1 ? cell.padEnd(widths[at] ?? 0) : cell.padStart(widths[at] ?? 0),
      )
      .join('  ')
      .trimEnd()

  return [line(head), ...rows.map(line)]
}

const perRequest = (totals: UsageTotals): number => (totals.requests > 0 ? totals.spend / totals.requests : 0)

/** The last `count` full days against the `count` before them, whole and model by model: what changed, and who did it. */
export const compareReport = (snapshot: Snapshot, days: number): string => {
  const { usage } = snapshot

  if (usage === null) {
    return NO_HISTORY
  }
  const diff = usageCompare(usage, days)

  if (diff === null) {
    return `Not enough history to compare ${days} days with the ${days} before them: that takes ${days * 2} full days before today, with some spend in the older ones (the plugin reads ${usage.days.length} days).`
  }
  const { current, previous } = diff
  const each = (totals: UsageTotals): string => (totals.requests > 0 ? eachText(totals.spend, totals.requests) : '—')
  const overall = grid(
    ['', 'Now', 'Before', 'Change'],
    [
      ['Spend', money(current.spend), money(previous.spend), movedText(current.spend, previous.spend)],
      ['Requests', count(current.requests), count(previous.requests), movedText(current.requests, previous.requests)],
      ['Tokens', compact(current.tokens), compact(previous.tokens), movedText(current.tokens, previous.tokens)],
      ['Per request', each(current), each(previous), movedText(perRequest(current), perRequest(previous))],
      ['Active days', String(current.activeDays), String(previous.activeDays), ''],
    ],
  )
  const first = previous.days[0]
  const last = current.days[current.days.length - 1]
  const lines = [
    `Compare · last ${days} full days vs the ${days} before · UTC, today left out · ${snapshot.host}`,
    first && last ? `${shortDate(first.date)} to ${shortDate(last.date)}` : '',
    ...overall,
  ].filter(line => line !== '')

  if (diff.movers.length > 0) {
    lines.push(
      '',
      ...grid(
        ['By model', 'Now', 'Before', 'Change'],
        diff.movers.map(item => [truncate(item.model, 30), money(item.current), money(item.previous), movedText(item.current, item.previous)]),
      ),
    )
  }

  return lines.join('\n')
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
export const levelOf = (list: ReturnType<typeof alerts>): Exclude<Level, 'unknown'> =>
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
  options: ReportOptions = {},
): Verdict => {
  if (snapshot === null || failure !== null) {
    const seen = snapshot === null ? '' : ` (last good reading ${ago(snapshot.fetchedAt, now)}: ${oneLine(snapshot, now)})`
    const hint = failure?.hint ? `\n${failure.hint}` : ''

    return { level: 'unknown', exitCode: 3, text: `UNKNOWN · ${failure?.message ?? 'nothing was read yet'}${seen}${hint}` }
  }
  const list = alerts(snapshot, now, warnPercent, options.isForecast !== false, { dailyAlert: options.dailyAlert ?? 0 })
  const level = levelOf(list)
  const { word, exitCode } = LEVELS[level]

  return {
    level,
    exitCode,
    text: [`${word} · ${oneLine(snapshot, now)}`, ...list.map(item => `  ${item.tone === 'error' ? '✗' : '▲'} ${item.text}`)].join('\n'),
  }
}

const iso = (ms: number | null): string | null =>
  ms === null || Number.isNaN(new Date(ms).getTime()) ? null : new Date(ms).toISOString()

const budgetJson = (budget: Budget) => ({
  spend: budget.spend,
  limit: budget.limit,
  percent: percent(budget.spend, budget.limit),
  left: budget.limit === null ? null : budget.limit - budget.spend,
  period: budget.duration,
  resetAt: iso(budget.resetAt),
  softLimit: budget.softLimit,
})

const totalsJson = (totals: UsageTotals) => ({
  spend: totals.spend,
  requests: totals.requests,
  failed: totals.failed,
  tokens: totals.tokens,
  inputTokens: totals.inputTokens,
  outputTokens: totals.outputTokens,
  cacheReadTokens: totals.cacheReadTokens,
  perDay: totals.average,
})

/**
 * Everything the plugin knows of the key as JSON, for a script (`claude -p "/litellm json"`). The shape is versioned by
 * `schema`. It holds no credential: the key is only its masked name, and its hash is left out.
 */
export const jsonReport = (snapshot: Snapshot, now: number, warnPercent: number, options: ReportOptions = {}): string => {
  const { key, usage } = snapshot
  const isForecast = options.isForecast !== false
  const pace = isForecast ? keyPace(snapshot, now) : null
  const room = isForecast ? allowance(key.budget, now) : null
  const list = alerts(snapshot, now, warnPercent, isForecast, { dailyAlert: options.dailyAlert ?? 0 })
  const today = todayOf(usage, now)
  const related = (item: Snapshot['user']) =>
    item === null ? null : { id: item.id, label: item.label, ...budgetJson(item.budget) }

  return JSON.stringify(
    {
      schema: 1,
      readAt: iso(snapshot.fetchedAt),
      stale: options.stale ?? null,
      proxy: snapshot.host,
      level: levelOf(list),
      key: {
        alias: key.alias,
        name: key.keyName ?? snapshot.keyHint,
        status: key.status,
        type: key.keyType,
        user: key.userId,
        team: key.teamId,
        createdAt: iso(key.createdAt),
        lastActiveAt: iso(key.lastActiveAt),
        expiresAt: iso(key.expiresAt),
      },
      budget: { ...budgetJson(key.budget), lifetimeSpend: key.lifetimeSpend },
      pace:
        pace === null
          ? null
          : {
              basis: pace.basis,
              perDay: pace.perDay,
              projected: pace.projected,
              projectedPercent: pace.projectedPct,
              emptyAt: iso(pace.emptyAt),
              beforeReset: pace.beforeReset,
            },
      allowance: room === null ? null : { perDay: room.perDay, perHour: room.perHour },
      windows: key.windows.map(item => ({
        duration: item.duration,
        spend: item.spend,
        limit: item.limit,
        percent: item.spend === null ? null : percent(item.spend, item.limit),
        resetAt: iso(item.resetAt),
      })),
      modelBudgets: key.modelBudgets.map(item => ({
        model: item.model,
        spend: item.spend,
        limit: item.limit,
        period: item.period,
      })),
      limits: key.limits,
      related: { user: related(snapshot.user), team: related(snapshot.team) },
      models: snapshot.models ?? key.models,
      usage:
        usage === null
          ? null
          : {
              today: today === null ? null : { date: today.date, spend: today.spend, requests: today.requests, tokens: today.tokens },
              last7: totalsJson(usageOver(usage, 7)),
              last30: totalsJson(usageOver(usage, 30)),
            },
      session: options.session ? { since: iso(options.session.since), spend: options.session.spend } : null,
      alerts: list,
    },
    null,
    2,
  )
}

/** The probes as a table: whether each endpoint answered, with what, and how long it took. */
export const pingReport = (host: string, root: string, probes: readonly Probe[]): string => {
  const width = Math.max(0, ...probes.map(probe => probe.path.length))

  return [
    `${host} · ${root}`,
    ...probes.map(probe =>
      [
        probe.ok ? '✓' : '✗',
        probe.path.padEnd(width),
        (probe.status === null ? '—' : String(probe.status)).padStart(3),
        (probe.ms === null ? '—' : `${probe.ms} ms`).padStart(7),
        probe.detail,
      ]
        .join(' ')
        .trimEnd(),
    ),
  ].join('\n')
}
