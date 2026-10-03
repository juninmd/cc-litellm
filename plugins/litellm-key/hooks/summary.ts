import type { Budget, Failure, Snapshot } from '../types'
import { clock, compact, money, percent, plural, sparkline, truncate, until } from './format'

export type Tone = 'ok' | 'warn' | 'error'
export type Meter = { label: string; used: number; limit: number | null; text: string; tone: Tone }
export type Row = { label: string; text: string; tone: Tone }

const SOON_MS = 3 * 86_400_000

const toneOf = (pct: number | null, warnPercent: number): Tone =>
  pct === null ? 'ok' : pct >= 100 ? 'error' : pct >= warnPercent ? 'warn' : 'ok'

const resetText = (budget: Budget, now: number): string | null => {
  if (budget.resetAt === null) {
    return budget.duration ? `resets every ${budget.duration}` : null
  }
  if (budget.resetAt <= now) {
    return 'reset pending'
  }

  return `resets ${until(budget.resetAt, now)}${budget.duration ? ` (${budget.duration})` : ''}`
}

export const budgetText = (budget: Budget, now: number): string => {
  const reset = resetText(budget, now)

  if (budget.limit === null) {
    return [`${money(budget.spend)} spent`, 'no budget cap', reset].filter(Boolean).join(' · ')
  }
  const left = budget.limit - budget.spend
  const pct = percent(budget.spend, budget.limit)

  return [
    `${money(budget.spend)} / ${money(budget.limit)} (${pct}%)`,
    left >= 0 ? `${money(left)} left` : `${money(-left)} over`,
    reset,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const meters = (snapshot: Snapshot, now: number, warnPercent: number): Meter[] => {
  const { key, team, user } = snapshot
  const list: Meter[] = [
    {
      label: 'Budget',
      used: key.budget.spend,
      limit: key.budget.limit,
      text: budgetText(key.budget, now),
      tone: toneOf(percent(key.budget.spend, key.budget.limit), warnPercent),
    },
  ]

  for (const window of key.windows) {
    const spend = window.spend ?? 0
    const reset = window.resetAt === null ? null : until(window.resetAt, now)

    list.push({
      label: `Window ${window.duration}`,
      used: spend,
      limit: window.limit,
      text: [
        `${window.spend === null ? '?' : money(spend)} / ${money(window.limit)}`,
        reset ? `resets ${reset}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: toneOf(percent(spend, window.limit), warnPercent),
    })
  }
  for (const item of key.modelBudgets) {
    if (item.limit !== null) {
      list.push({
        label: `Model ${item.model}`,
        used: item.spend,
        limit: item.limit,
        text: `${money(item.spend)} / ${money(item.limit)}${item.period ? ` per ${item.period}` : ''}`,
        tone: toneOf(percent(item.spend, item.limit), warnPercent),
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
        tone: toneOf(percent(related.budget.spend, related.budget.limit), warnPercent),
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

const usageText = (snapshot: Snapshot): string | null => {
  const { usage } = snapshot

  if (!usage) {
    return null
  }

  return [
    sparkline(usage.days.map(day => day.spend)),
    money(usage.spend),
    plural(usage.requests, 'request'),
    `${compact(usage.tokens)} tokens`,
  ].join(' · ')
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
    `LiteLLM key · ${identity(snapshot)} · ${snapshot.host}`,
    ...rows.map(row => `${truncate(row.label, width).padEnd(width)}  ${row.text}`),
  ].join('\n')
}

export const failureText = (failure: Failure): string =>
  `LiteLLM: ${failure.message}${failure.hint ? `\n${failure.hint}` : ''}`

const shortFailure = (failure: Failure): string => {
  switch (failure.kind) {
    case 'auth':
      return 'key rejected (401)'
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
  const pct = percent(key.budget.spend, key.budget.limit)
  const expiresSoon = key.expiresAt !== null && key.expiresAt > now && key.expiresAt - now < SOON_MS
  const parts: (string | null)[] = []

  if (key.status !== 'active') {
    parts.push(`key ${key.status}`)
  } else if (pct === null) {
    parts.push(`${money(key.budget.spend)} spent`, 'no cap')
  } else {
    parts.push(
      `${pct}%`,
      `${money(key.budget.spend)} of ${money(key.budget.limit)}`,
      pct >= 100 ? 'over budget' : resetText(key.budget, now),
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
  `LiteLLM key: ${statusText(snapshot, null, now) ?? 'no data'}`
