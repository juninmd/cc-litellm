import type { Snapshot } from '../types'
import { shortDate } from './calendar'
import { change, compact, count, money, plural, times, truncate } from './format'
import { eachText, recentDaily } from './guidance'
import type { Totals } from './history'
import { totalsOf, usageCompare } from './history'
import { NO_HISTORY, dayDetail, modelLine, tokensText } from './report-usage'
import type { Row } from './summary'

/** Rows as lines, the labels lined up in one column. */
export const table = (rows: readonly Row[], indent = ''): string[] => {
  const width = Math.max(0, ...rows.map(row => row.label.length))

  return rows.map(row => `${indent}${row.label.padEnd(width)}  ${row.text}`)
}

/** What a single day did: its totals, the tokens, the models, and how it compares with the usual day. */
export const dayReport = (snapshot: Snapshot, date: string): string => {
  const detail = dayDetail(snapshot, date)
  const day = snapshot.usage?.history.find(item => item.date === date)

  if (detail === null || day === undefined) {
    return snapshot.usage === null ? NO_HISTORY : `${date} is not in the history, which holds the last ${snapshot.usage.history.length} days.`
  }
  const lines = [`${detail.title} · UTC · ${snapshot.host}`, detail.summary]

  if (day.spend <= 0 && day.requests <= 0) {
    return lines.join('\n')
  }
  const usual = recentDaily(snapshot.usage)
  const rows: Row[] = []

  if (day.tokens > 0) {
    rows.push({ label: 'Tokens', text: tokensText(totalsOf([day])), tone: 'ok' })
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
    lines.push('', 'By model', ...models.map(item => modelLine(item.model, item.spend, day.spend, item.requests)))
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
      .map((cell, at) => (at === 0 || at === cells.length - 1 ? cell.padEnd(widths[at] ?? 0) : cell.padStart(widths[at] ?? 0)))
      .join('  ')
      .trimEnd()

  return [line(head), ...rows.map(line)]
}

const perRequest = (totals: Totals): number => (totals.requests > 0 ? totals.spend / totals.requests : 0)

/** The last `days` full days against the `days` before them, whole and model by model: what changed, and who did it. */
export const compareReport = (snapshot: Snapshot, days: number): string => {
  const { usage } = snapshot

  if (usage === null) {
    return NO_HISTORY
  }
  const diff = usageCompare(usage, days)

  if (diff === null) {
    return `Not enough history to compare ${days} days with the ${days} before them: that takes ${days * 2} full days before today, with some spend in the older ones (the plugin reads ${usage.history.length} days).`
  }
  const { current, previous } = diff
  const each = (totals: Totals): string => (totals.requests > 0 ? eachText(totals.spend, totals.requests) : '—')
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
