import type { Snapshot } from '../types'
import { compact, money, plural, sparkline, until } from './format'
import { allowanceRow, headroomText, sessionText, todayRow } from './guidance'
import { runway, runwayRow } from './runway'
import type { ModelShare } from './parts'
import type { Row, Tone } from './summary'

export const SOON_MS = 3 * 86_400_000

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

/** Each top model's part of the week's spend, in whole percent and never past 100. */
export const modelShares = (snapshot: Snapshot): ModelShare[] => {
  const { usage } = snapshot

  if (!usage || !(usage.spend > 0)) {
    return []
  }

  return usage.topModels.map(({ model, spend }) => ({
    model,
    spend,
    share: Math.min(100, Math.round((spend / usage.spend) * 100)),
  }))
}

const topModelsText = (snapshot: Snapshot): string | null =>
  modelShares(snapshot)
    .map(item => `${item.model} ${money(item.spend)} (${item.share}%)`)
    .join(' · ')

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
  const found = runway(snapshot, now)
  const pace = found && runwayRow(found, now)

  add('Status', key.status, key.status === 'active' ? 'ok' : 'error')
  add('Role', snapshot.userRole)
  add(
    'Organization',
    key.organizationId && `${key.organizationId} · budget: /litellm org`,
  )
  add('Soft limit', key.budget.softLimit === null ? null : `alerts at ${money(key.budget.softLimit)}`)
  add('Limits', limitsText(snapshot))
  add(
    key.expiresAt !== null && key.expiresAt < now ? 'Expired' : 'Expires',
    expires,
    key.expiresAt === null ? 'ok' : key.expiresAt < now ? 'error' : key.expiresAt - now < SOON_MS ? 'warn' : 'ok',
  )
  add('Runway', pace && pace.text, pace?.tone)
  const room = allowanceRow(snapshot, now)

  add('Allowance', room && room.text, room?.tone)
  add('Headroom', headroomText(snapshot))
  add('Models', `${modelsText(snapshot)}${snapshot.models ? ` (${snapshot.models.length})` : ''}`)
  if (key.lifetimeSpend !== null && key.lifetimeSpend > key.budget.spend + 0.005) {
    add('Lifetime', `${money(key.lifetimeSpend)} across budget resets`)
  }
  const today = todayRow(snapshot, now)

  add('Today', today && today.text, today?.tone)
  add('Last 7 days', usageText(snapshot))
  add('Top models', topModelsText(snapshot))
  add('Session', snapshot.session && sessionText(snapshot.session, now))

  return rows
}

export const identity = (snapshot: Snapshot): string => {
  const { key } = snapshot
  const name = key.alias ?? key.keyName ?? snapshot.keyHint

  return key.alias ? `${name} · ${key.keyName ?? snapshot.keyHint}` : name
}
