import type { Snapshot } from '../types'
import { isoDay, shortDate } from './calendar'
import { SOON_MS, identity } from './facts'
import { ago, clock, compact, money, plural, until } from './format'
import type { Row, Tone } from './summary'

export type Detail = { title: string; rows: Row[] }

const dayAndAge = (at: number | null, now: number): string | null =>
  at === null ? null : `${shortDate(isoDay(at))} · ${until(at, now)}`

/** Everything the proxy told about the key and how it was read, in groups: what the Details tab lists. */
export const details = (snapshot: Snapshot, now: number, refreshSeconds: number): Detail[] => {
  const { key } = snapshot
  const groups: Detail[] = []
  const group = (title: string, build: (add: (label: string, text: string | null, tone?: Tone) => void) => void): void => {
    const rows: Row[] = []

    build((label, text, tone = 'ok') => {
      if (text) {
        rows.push({ label, text, tone })
      }
    })
    if (rows.length > 0) {
      groups.push({ title, rows })
    }
  }
  const cap = key.budget.limit
  const allowed = snapshot.models ?? key.models
  const { proxy } = snapshot

  group('Key', add => {
    add('Alias', key.alias)
    add('Name', key.keyName ?? snapshot.keyHint)
    add('Hash', key.keyHash === null ? null : `${key.keyHash.slice(0, 8)}… (sha256)`)
    add('Status', key.status, key.status === 'active' ? 'ok' : 'error')
    add('Type', key.keyType)
    add('User', key.userId)
    add('Role', snapshot.userRole)
    add('Team', key.teamId)
    add('Organization', key.organizationId)
    add('Created', dayAndAge(key.createdAt, now))
    add('Last active', key.lastActiveAt === null ? null : ago(key.lastActiveAt, now))
    add('Expires', key.expiresAt === null ? 'never' : dayAndAge(key.expiresAt, now), key.expiresAt !== null && key.expiresAt - now < SOON_MS ? 'warn' : 'ok')
  })
  group('Budget', add => {
    add('Spent', money(key.budget.spend))
    add('Cap', cap === null ? 'no cap' : money(cap))
    add('Soft limit', key.budget.softLimit === null ? null : money(key.budget.softLimit))
    add('Period', key.budget.duration)
    add('Resets', key.budget.resetAt === null ? null : dayAndAge(key.budget.resetAt, now))
    add('Lifetime', key.lifetimeSpend === null ? null : money(key.lifetimeSpend))
  })
  group('Limits', add => {
    add('Requests/min', key.limits.rpm === null ? null : compact(key.limits.rpm))
    add('Tokens/min', key.limits.tpm === null ? null : compact(key.limits.tpm))
    add('Tokens/day', key.limits.tpd === null ? null : compact(key.limits.tpd))
    add('Parallel', key.limits.parallel === null ? null : String(key.limits.parallel))
  })
  group('Connection', add => {
    add('Proxy', snapshot.root)
    add(
      'LiteLLM',
      [proxy?.version ? `v${proxy.version}` : null, proxy?.db ? `database ${proxy.db.toLowerCase()}` : null].filter(Boolean).join(' · ') || null,
      proxy?.db && /\bnot\b|\bdown\b|error/i.test(proxy.db) ? 'warn' : 'ok',
    )
    add('Latency', snapshot.latencyMs === null ? null : `${Math.round(snapshot.latencyMs)} ms to read /key/info`)
    add('Auth', `via ${snapshot.keySource} (${snapshot.keyHint})`)
    add('Read', `${clock(snapshot.fetchedAt)} (${ago(snapshot.fetchedAt, now)}) · every ${refreshSeconds}s`)
    add('Models', allowed.length === 0 ? 'all proxy models' : plural(allowed.length, 'model'))
    add('Related', [snapshot.user ? 'user budget' : null, snapshot.team ? 'team budget' : null].filter(Boolean).join(' · ') || null)
  })

  return groups
}

export const detailsText = (snapshot: Snapshot, now: number, refreshSeconds: number): string => {
  const groups = details(snapshot, now, refreshSeconds)
  const width = Math.max(0, ...groups.flatMap(item => item.rows.map(row => row.label.length)))

  return [
    `${identity(snapshot)} · ${snapshot.host}`,
    ...groups.flatMap(item => ['', item.title, ...item.rows.map(row => `  ${row.label.padEnd(width)}  ${row.text}`)]),
    ...(snapshot.notes.length > 0 ? ['', 'Notes', ...snapshot.notes.map(note => `  ${note}`)] : []),
  ].join('\n')
}
