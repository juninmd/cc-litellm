import type { Budget, Failure, Snapshot } from '../types'
import { isSpentUp } from './exceeded'
import { clock, compact, gauge, money, percent, plural, sparkline, truncate, until, usedShare } from './format'

export type Tone = 'ok' | 'warn' | 'error'
export type Meter = {
  label: string
  used: number
  limit: number | null
  text: string
  /** `text` without the percentage: the pane shows that next to the bar. */
  detail: string
  /** The same reading cut to one short line: the amounts and the reset, no percentage, no "left" or "over", no period. */
  brief: string
  tone: Tone
}
export type Row = { label: string; text: string; tone: Tone }

const SOON_MS = 3 * 86_400_000
const STATUS_BAR = 8

// Error means spent up, the same test the banner uses: 99.6% rounds to 100% on screen but the proxy still answers.
const toneOf = (used: number, limit: number | null, warnPercent: number): Tone =>
  limit === null ? 'ok' : isSpentUp(used, limit) ? 'error' : (usedShare(used, limit) ?? 0) >= warnPercent ? 'warn' : 'ok'

const resetText = (budget: Budget, now: number, hasPeriod = true): string | null => {
  if (budget.resetAt === null) {
    return budget.duration ? `resets every ${budget.duration}` : null
  }
  if (budget.resetAt <= now) {
    return 'reset pending'
  }

  return `resets ${until(budget.resetAt, now)}${hasPeriod && budget.duration ? ` (${budget.duration})` : ''}`
}

export const budgetText = (budget: Budget, now: number, hasPercent = true): string => {
  const reset = resetText(budget, now)

  if (budget.limit === null) {
    return [`${money(budget.spend)} spent`, 'no budget cap', reset].filter(Boolean).join(' · ')
  }
  const left = budget.limit - budget.spend
  const pct = percent(budget.spend, budget.limit)

  return [
    `${money(budget.spend)} / ${money(budget.limit)}${hasPercent && pct !== null ? ` (${pct}%)` : ''}`,
    left >= 0 ? `${money(left)} left` : `${money(-left)} over`,
    reset,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const budgetBrief = (budget: Budget, now: number): string =>
  [
    budget.limit === null ? `${money(budget.spend)} spent` : `${money(budget.spend)} / ${money(budget.limit)}`,
    resetText(budget, now, false),
  ]
    .filter(Boolean)
    .join(' · ')

export const meters = (snapshot: Snapshot, now: number, warnPercent: number): Meter[] => {
  const { key, team, user } = snapshot
  const list: Meter[] = [
    {
      label: 'Budget',
      used: key.budget.spend,
      limit: key.budget.limit,
      text: budgetText(key.budget, now),
      detail: budgetText(key.budget, now, false),
      brief: budgetBrief(key.budget, now),
      tone: toneOf(key.budget.spend, key.budget.limit, warnPercent),
    },
  ]

  for (const window of key.windows) {
    const spend = window.spend ?? 0
    const reset = window.resetAt === null ? null : until(window.resetAt, now)
    const text = [`${window.spend === null ? '?' : money(spend)} / ${money(window.limit)}`, reset ? `resets ${reset}` : null]
      .filter(Boolean)
      .join(' · ')

    list.push({
      label: `Window ${window.duration}`,
      used: spend,
      limit: window.limit,
      text,
      detail: text,
      brief: text,
      tone: toneOf(spend, window.limit, warnPercent),
    })
  }
  for (const item of key.modelBudgets) {
    if (item.limit !== null) {
      const text = `${money(item.spend)} / ${money(item.limit)}${item.period ? ` per ${item.period}` : ''}`

      list.push({
        label: `Model ${item.model}`,
        used: item.spend,
        limit: item.limit,
        text,
        detail: text,
        brief: text,
        tone: toneOf(item.spend, item.limit, warnPercent),
      })
    }
  }
  for (const [label, related] of [['Team', team], ['User', user]] as const) {
    if (related) {
      list.push({
        label: `${label} ${related.label}`,
        used: related.budget.spend,
        limit: related.budget.limit,
        text: budgetText(related.budget, now),
        detail: budgetText(related.budget, now, false),
        brief: budgetBrief(related.budget, now),
        tone: toneOf(related.budget.spend, related.budget.limit, warnPercent),
      })
    }
  }

  return list
}

const limitsText = (snapshot: Snapshot): string | null => {
  const { limits } = snapshot.key
  const parts = [
    limits.rpm === null ? null : `${compact(limits.rpm)} rpm`,
    limits.tpm === null ? null : `${compact(limits.tpm)} tpm`,
    limits.tpd === null ? null : `${compact(limits.tpd)} tokens/day`,
    limits.parallel === null ? null : `${limits.parallel} parallel`,
  ].filter(Boolean)

  return parts.length === 0 ? null : parts.join(' · ')
}

export const modelsText = (snapshot: Snapshot, max = 4): string => {
  const names = snapshot.models ?? snapshot.key.models
  const isAll = snapshot.key.models.length === 0 || snapshot.key.models.includes('all-proxy-models')

  if (names.length === 0) {
    return isAll ? 'all proxy models' : 'none'
  }
  const shown = names.slice(0, max).join(', ')
  const more = names.length > max ? `, +${names.length - max}` : ''

  return `${shown}${more}`
}

const initialOf = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()

  return Number.isNaN(day) ? '·' : 'SMTWTFS'.charAt(day)
}

/** The last days as a sparkline, the weekday under each, and the totals. */
export const usageParts = (snapshot: Snapshot): { spark: string; days: string; rest: string } | null => {
  const { usage } = snapshot

  if (!usage) {
    return null
  }

  return {
    spark: sparkline(usage.days.map(day => day.spend)),
    days: usage.days.map(day => initialOf(day.date)).join(''),
    rest: [money(usage.spend), plural(usage.requests, 'request'), `${compact(usage.tokens)} tokens`].join(' · '),
  }
}

const usageText = (snapshot: Snapshot): string | null => {
  const parts = usageParts(snapshot)

  return parts && `${parts.spark} · ${parts.rest}`
}

export const facts = (snapshot: Snapshot, now: number): Row[] => {
  const { key } = snapshot
  const rows: Row[] = []
  const add = (label: string, text: string | null, tone: Tone = 'ok'): void => {
    if (text) {
      rows.push({ label, text, tone })
    }
  }
  const expires = key.expiresAt === null ? null : until(key.expiresAt, now)

  add('Status', key.status, key.status === 'active' ? 'ok' : 'error')
  add('Role', snapshot.userRole)
  add('Soft limit', key.budget.softLimit === null ? null : `alerts at ${money(key.budget.softLimit)}`)
  add('Limits', limitsText(snapshot))
  add(
    key.expiresAt !== null && key.expiresAt < now ? 'Expired' : 'Expires',
    expires,
    key.expiresAt === null ? 'ok' : key.expiresAt < now ? 'error' : key.expiresAt - now < SOON_MS ? 'warn' : 'ok',
  )
  add('Models', `${modelsText(snapshot)}${snapshot.models ? ` (${snapshot.models.length})` : ''}`)
  if (key.lifetimeSpend !== null && key.lifetimeSpend > key.budget.spend + 0.005) {
    add('Lifetime', `${money(key.lifetimeSpend)} across budget resets`)
  }
  add('Last 7 days', usageText(snapshot))

  return rows
}

export const identity = (snapshot: Snapshot): string => {
  const { key } = snapshot
  const name = key.alias ?? key.keyName ?? snapshot.keyHint

  return key.alias ? `${name} · ${key.keyName ?? snapshot.keyHint}` : name
}

export const summaryText = (snapshot: Snapshot, now: number, warnPercent: number): string => {
  const rows = [
    ...meters(snapshot, now, warnPercent),
    ...facts(snapshot, now),
    { label: 'Updated', text: `${clock(snapshot.fetchedAt)} · via ${snapshot.keySource}` },
    ...snapshot.notes.map(note => ({ label: 'Note', text: note })),
  ]
  const width = Math.min(24, Math.max(...rows.map(row => row.label.length)))

  return [
    `${identity(snapshot)} · ${snapshot.host}`,
    ...rows.map(row => `${truncate(row.label, width).padEnd(width)}  ${row.text}`),
  ].join('\n')
}

export const failureText = (failure: Failure): string =>
  `${failure.message}${failure.hint ? `\n${failure.hint}` : ''}`

const shortFailure = (failure: Failure): string => {
  switch (failure.kind) {
    case 'auth':
      return 'key rejected (401)'
    case 'blocked':
      return 'key blocked'
    case 'expired':
      return 'key expired'
    case 'forbidden':
      return 'no access to key info (403)'
    case 'not-found':
      return 'key not in proxy database'
    case 'not-litellm':
      return 'not a LiteLLM proxy'
    case 'db':
      return 'proxy has no database'
    case 'rate-limit':
      return 'rate limited (429)'
    case 'network':
      return 'proxy unreachable'
    default:
      return failure.status === null ? 'request failed' : `HTTP ${failure.status}`
  }
}

export const statusText = (snapshot: Snapshot | null, failure: Failure | null, now: number): string | undefined => {
  if (failure?.kind === 'not-configured') {
    return undefined
  }
  if (!snapshot) {
    return failure ? shortFailure(failure) : undefined
  }
  const { key } = snapshot
  const pct = usedShare(key.budget.spend, key.budget.limit)
  const expiresSoon = key.expiresAt !== null && key.expiresAt > now && key.expiresAt - now < SOON_MS
  const parts: (string | null)[] = []

  if (key.status !== 'active') {
    parts.push(`key ${key.status}`)
  } else if (pct === null) {
    parts.push(`${money(key.budget.spend)} spent`, 'no cap')
  } else {
    const { full, track } = gauge(pct / 100, STATUS_BAR)

    parts.push(
      `${full}${track} ${pct}% of budget`,
      `${money(key.budget.spend)} of ${money(key.budget.limit)}`,
      isSpentUp(key.budget.spend, key.budget.limit) ? 'over budget' : resetText(key.budget, now),
    )
  }
  if (expiresSoon && key.expiresAt !== null) {
    parts.push(`expires ${until(key.expiresAt, now)}`)
  }
  if (failure) {
    parts.push(`stale: ${shortFailure(failure)}`)
  }

  return parts.filter(Boolean).join(' · ')
}

export const oneLine = (snapshot: Snapshot, now: number): string =>
  statusText(snapshot, null, now) ?? 'no data'
