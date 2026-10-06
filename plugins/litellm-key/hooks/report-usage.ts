import type { Snapshot } from '../types'
import { shortDate, weekday } from './calendar'
import { compact, count, money, plural, truncate } from './format'
import { eachText } from './guidance'
import type { Totals } from './history'
import { usageOver, usageTrend } from './history'
import type { Row, Tone } from './summary'

export const NO_HISTORY = 'No usage history: the proxy did not answer /user/daily/activity, or the key has no user.'

/** The token split of a range in one line: what went in, what came out, how much of the input came from the cache. */
export const tokensText = (totals: Totals): string => {
  const cached =
    totals.inputTokens > 0 && totals.cacheReadTokens <= totals.inputTokens
      ? ` (${Math.round((totals.cacheReadTokens / totals.inputTokens) * 100)}% of input)`
      : ''

  return `in ${compact(totals.inputTokens)} · out ${compact(totals.outputTokens)} · cache read ${compact(totals.cacheReadTokens)}${cached}`
}

const trendText = (snapshot: Snapshot, range: number): string | null => {
  const trend = snapshot.usage ? usageTrend(snapshot.usage, range) : null

  if (trend === null) {
    return null
  }
  const { pct, direction } = trend.change

  return direction === 'flat'
    ? `unchanged vs the ${range} days before (full days)`
    : `${direction === 'up' ? '▲' : '▼'} ${pct}% vs the ${range} days before (full days)`
}

/** The totals of a range as labeled lines: what the Usage tab shows beside its chart, and the report prints. */
export const usageFacts = (snapshot: Snapshot, range: number): Row[] => {
  const { usage } = snapshot

  if (!usage) {
    return []
  }
  const totals = usageOver(usage, range)
  const rows: Row[] = []
  const add = (label: string, text: string | null, tone: Tone = 'ok'): void => {
    if (text) {
      rows.push({ label, text, tone })
    }
  }
  const trend = trendText(snapshot, range)
  const share = totals.failed / Math.max(1, totals.requests)

  add('Spend', `${money(totals.spend)} · ${money(totals.average)}/day`)
  add('Requests', `${count(totals.requests)}${totals.requests > 0 ? ` · ${eachText(totals.spend, totals.requests)} each` : ''}`)
  add('Failed', totals.failed > 0 ? `${plural(totals.failed, 'request')} (${(share * 100).toFixed(1)}%)` : null, 'warn')
  add('Tokens', totals.tokens > 0 ? `${compact(totals.tokens)} · ${tokensText(totals)}` : null)
  add('Peak day', totals.peak ? `${money(totals.peak.spend)} on ${weekday(totals.peak.date)} ${shortDate(totals.peak.date)}` : null)
  add('Active days', `${totals.activeDays} of ${totals.days.length}`)
  add('Trend', trend, trend?.startsWith('▲') ? 'warn' : 'ok')

  return rows
}

export type DayDetail = {
  /** "Sat Oct 3", with "(today)" for the day that is still going. */
  title: string
  /** What the day came to, in one line; "no activity" for a day that did nothing. */
  summary: string
  /** The models of the day, the one that spent most first, with their share of it. */
  models: { model: string; spend: number; share: number }[]
}

/** What a single day of the history did, for the line under the chart. Null for a day the history does not have. */
export const dayDetail = (snapshot: Snapshot, date: string): DayDetail | null => {
  const days = snapshot.usage?.history ?? []
  const day = days.find(item => item.date === date)

  if (!day) {
    return null
  }
  const isToday = days[days.length - 1]?.date === date

  return {
    title: `${weekday(date)} ${shortDate(date)}${isToday ? ' (today)' : ''}`,
    summary:
      day.spend > 0 || day.requests > 0
        ? `${money(day.spend)} · ${plural(day.requests, 'request')} · ${compact(day.tokens)} tokens`
        : 'no activity',
    models: [...day.models]
      .sort((a, b) => b.spend - a.spend)
      .map(item => ({ model: item.model, spend: item.spend, share: day.spend > 0 ? item.spend / day.spend : 0 })),
  }
}

/** A model's line in a report: its name, what it spent, its share of the whole and its requests. */
export const modelLine = (model: string, spend: number, whole: number, requests: number): string =>
  `${truncate(model, 30).padEnd(31)}${money(spend).padStart(10)}${`${whole > 0 ? Math.round((spend / whole) * 100) : 0}%`.padStart(6)}  ${plural(requests, 'request')}`

/** The usage report as text: one line per day and the totals, aligned in columns. */
export const usageReport = (snapshot: Snapshot, range: number): string => {
  const { usage } = snapshot

  if (!usage) {
    return NO_HISTORY
  }
  const totals = usageOver(usage, range)
  const lines = [
    `Usage · last ${range} days · ${snapshot.host}`,
    `${'Date'.padEnd(8)}${'Day'.padEnd(5)}${'Spend'.padStart(10)}${'Requests'.padStart(10)}${'Tokens'.padStart(9)}`,
    ...totals.days.map(
      day =>
        `${shortDate(day.date).padEnd(8)}${weekday(day.date).padEnd(5)}${money(day.spend).padStart(10)}${String(day.requests).padStart(10)}${compact(day.tokens).padStart(9)}`,
    ),
    `${'Total'.padEnd(13)}${money(totals.spend).padStart(10)}${String(totals.requests).padStart(10)}${compact(totals.tokens).padStart(9)}`,
    '',
    ...usageFacts(snapshot, range)
      .filter(row => row.label !== 'Spend' && row.label !== 'Requests')
      .map(row => `${row.label.padEnd(12)}${row.text}`),
  ]

  if (totals.models.length > 0) {
    lines.push('', 'By model', ...totals.models.map(item => modelLine(item.model, item.spend, totals.spend, item.requests)))
  }

  return lines.join('\n')
}

/** The days of a range as CSV, for a spreadsheet. */
export const usageCsv = (snapshot: Snapshot, range: number): string => {
  const days = snapshot.usage ? usageOver(snapshot.usage, range).days : []

  return [
    'date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens',
    ...days.map(day =>
      [day.date, day.spend.toFixed(6), day.requests, day.failed, day.tokens, day.inputTokens, day.outputTokens, day.cacheReadTokens].join(','),
    ),
  ].join('\n')
}
