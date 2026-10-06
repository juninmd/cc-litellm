import type { Budgeted, Fallbacks, Json, KeyRow } from './admin'
import type { Outcome, Parsed } from './args'
import { parseCount, parseDuration, parseMoney } from './args'
import { compact, money, percent, plural, truncate, until } from './format'

export type NewKey = {
  alias: string
  budget: number | null
  every: string | null
  soft: number | null
  models: string[]
  rpm: number | null
  tpm: number | null
  parallel: number | null
  expires: string | null
  userId: string | null
  teamId: string | null
}

export type GrantPlan = { before: number | null; after: number; isNoop: boolean; lines: string[] }

const ALIAS = /^[A-Za-z0-9][\w.@:/-]{0,79}$/
const ID = /^[\w.@:+-]{1,128}$/
const MODEL = /^[\w.:/@+][\w.:/@+-]{0,99}$/

const fail = (message: string): Outcome<never> => ({ ok: false, message })

/** A typo such as --budjet must not quietly create a key without a cap. */
export const unknownFlags = (parsed: Parsed, allowed: readonly string[]): string | null => {
  const stray = Object.keys(parsed.flags).filter(name => !allowed.includes(name))

  return stray.length === 0 ? parsed.errors[0] ?? null : `Unknown option --${stray[0]}. Allowed: ${allowed.map(name => `--${name}`).join(' ')}`
}

export const NEW_KEY_FLAGS = ['budget', 'every', 'soft', 'models', 'rpm', 'tpm', 'parallel', 'expires', 'user', 'team', 'yes', 'dry-run', 'reveal'] as const

const optional = <T>(value: string | true | undefined, read: (text: string) => Outcome<T>): Outcome<T | null> => {
  if (value === undefined) {
    return { ok: true, value: null }
  }

  return typeof value === 'string' ? read(value) : fail('A value is missing.')
}

const idOf = (value: string | true | undefined, label: string): Outcome<string | null> =>
  optional(value, text => (ID.test(text) ? { ok: true, value: text } : fail(`${label} is not a valid id.`)))

export const parseNewKey = (parsed: Parsed): Outcome<NewKey> => {
  const bad = unknownFlags(parsed, NEW_KEY_FLAGS)
  const [alias, ...extra] = parsed.positional

  if (bad) {
    return fail(bad)
  }
  if (!alias || !ALIAS.test(alias)) {
    return fail('Give the key a name: /litellm key new <alias> [--budget 10 --every 30d --models a,b --rpm 60 --tpm 100000 --expires 30d --user ID --team ID]')
  }
  if (extra.length > 0) {
    return fail(`Unexpected "${truncate(extra[0] ?? '', 40)}". Put values after their option, e.g. --budget 10.`)
  }
  const { flags } = parsed
  const budget = optional(flags.budget, text => parseMoney(text, '--budget'))
  const soft = optional(flags.soft, text => parseMoney(text, '--soft'))
  const every = optional(flags.every, text => parseDuration(text, '--every'))
  const expires = optional(flags.expires, text => parseDuration(text, '--expires'))
  const rpm = optional(flags.rpm, text => parseCount(text, '--rpm'))
  const tpm = optional(flags.tpm, text => parseCount(text, '--tpm'))
  const parallel = optional(flags.parallel, text => parseCount(text, '--parallel'))
  const userId = idOf(flags.user, '--user')
  const teamId = idOf(flags.team, '--team')
  const models =
    typeof flags.models === 'string' ? flags.models.split(',').map(name => name.trim()).filter(Boolean) : []
  const problem = [budget, soft, every, expires, rpm, tpm, parallel, userId, teamId].find(item => !item.ok)

  if (problem && !problem.ok) {
    return fail(problem.message)
  }
  if (models.some(name => !MODEL.test(name))) {
    return fail('--models takes model names separated by commas, e.g. --models cloud/auto,cloud/auto-long')
  }
  const value = <T>(outcome: Outcome<T | null>): T | null => (outcome.ok ? outcome.value : null)

  if (value(every) !== null && value(budget) === null) {
    return fail('--every resets a budget, so it needs --budget too.')
  }
  if (value(soft) !== null && (value(budget) === null || (value(soft) ?? 0) >= (value(budget) ?? 0))) {
    return fail('--soft is an alert level below the budget, so it needs a --budget above it.')
  }

  return {
    ok: true,
    value: {
      alias,
      budget: value(budget),
      every: value(every),
      soft: value(soft),
      models,
      rpm: value(rpm),
      tpm: value(tpm),
      parallel: value(parallel),
      expires: value(expires),
      userId: value(userId),
      teamId: value(teamId),
    },
  }
}

export const keyBody = (key: NewKey): Json => ({
  key_alias: key.alias,
  ...(key.budget === null ? {} : { max_budget: key.budget }),
  ...(key.every === null ? {} : { budget_duration: key.every }),
  ...(key.soft === null ? {} : { soft_budget: key.soft }),
  ...(key.models.length === 0 ? {} : { models: key.models }),
  ...(key.rpm === null ? {} : { rpm_limit: key.rpm }),
  ...(key.tpm === null ? {} : { tpm_limit: key.tpm }),
  ...(key.parallel === null ? {} : { max_parallel_requests: key.parallel }),
  ...(key.expires === null ? {} : { duration: key.expires }),
  ...(key.userId === null ? {} : { user_id: key.userId }),
  ...(key.teamId === null ? {} : { team_id: key.teamId }),
})

export const keyPreview = (key: NewKey): string[] => {
  const limits = [
    key.rpm === null ? null : `${compact(key.rpm)} rpm`,
    key.tpm === null ? null : `${compact(key.tpm)} tpm`,
    key.parallel === null ? null : `${key.parallel} parallel`,
  ].filter(Boolean)
  const owner = [key.userId ? `user ${key.userId}` : null, key.teamId ? `team ${key.teamId}` : null].filter(Boolean)

  return [
    `Create key "${key.alias}"`,
    `  budget   ${
      key.budget === null
        ? 'no cap (unlimited spend)'
        : `${money(key.budget)}${key.every ? ` per ${key.every}` : ' in total'}${key.soft === null ? '' : ` · alert at ${money(key.soft)}`}`
    }`,
    `  models   ${key.models.length === 0 ? 'all models' : key.models.join(', ')}`,
    ...(limits.length === 0 ? [] : [`  limits   ${limits.join(' · ')}`]),
    `  expires  ${key.expires ? `in ${key.expires}` : 'never'}`,
    `  owner    ${owner.length === 0 ? 'nobody (the key is not tied to a user or team)' : owner.join(' · ')}`,
  ]
}

export const planGrant = (target: Budgeted, amount: number, isSet: boolean): Outcome<GrantPlan> => {
  if (!isSet && target.limit === null) {
    return fail(
      `${target.kind} ${target.label} has no budget cap, so there is nothing to add to. Use --set ${amount} to cap it at ${money(amount)}.`,
    )
  }
  const after = isSet ? amount : Math.round(((target.limit ?? 0) + amount) * 10_000) / 10_000
  const delta = target.limit === null ? null : Math.round((after - target.limit) * 10_000) / 10_000
  const left = after - target.spend

  return {
    ok: true,
    value: {
      before: target.limit,
      after,
      isNoop: target.limit === after,
      lines: [
        `${isSet ? 'Set the budget of' : 'Add budget to'} ${target.kind} "${target.label}"`,
        `  budget   ${target.limit === null ? 'no cap' : money(target.limit)} → ${money(after)}${
          delta === null ? '' : ` (${delta >= 0 ? '+' : '-'}${money(Math.abs(delta))})`
        }${target.duration ? ` per ${target.duration}` : ''}`,
        `  spent    ${money(target.spend)} so far · ${left >= 0 ? `${money(left)} would be left` : `${money(-left)} over, so requests stay blocked until it resets`}`,
        ...(target.role ? [`  role     ${target.role}`] : []),
        ...(target.exists ? [] : [`  note     the proxy has no record of user "${target.label}"; this creates one with that budget`]),
        ...(target.kind === 'key'
          ? []
          : [`  note     this ${target.kind === 'org' ? 'organization' : target.kind} budget applies to every key ${target.kind === 'org' ? 'and team in it' : 'it owns'}`]),
      ],
    },
  }
}

const OWNER = (row: KeyRow): string => [row.userId, row.teamId].filter(Boolean).join(' · ') || '—'

export const keysText = (rows: readonly KeyRow[], total: number, scope: string, now: number): string => {
  if (rows.length === 0) {
    return `No keys found (${scope}).`
  }
  const cells = rows.map(row => {
    const pct = percent(row.spend, row.limit)

    return [
      row.alias ?? row.name ?? '(no alias)',
      row.limit === null ? `${money(row.spend)} / no cap` : `${money(row.spend)} / ${money(row.limit)}${pct === null ? '' : ` (${pct}%)`}`,
      row.isBlocked ? 'blocked' : row.expiresAt !== null && row.expiresAt < now ? 'expired' : 'active',
      row.expiresAt === null ? 'never' : (until(row.expiresAt, now) ?? 'never'),
      OWNER(row),
      row.hash.slice(0, 8),
    ]
  })
  const head = ['alias', 'spend / budget', 'status', 'expires', 'owner', 'hash']
  const widths = head.map((title, index) => Math.min(30, Math.max(title.length, ...cells.map(row => (row[index] ?? '').length))))
  const line = (row: readonly string[]): string =>
    row.map((cell, index) => truncate(cell, widths[index] ?? 30).padEnd(widths[index] ?? 0)).join('  ').trimEnd()

  return [
    `${plural(rows.length, 'key')}${total > rows.length ? ` of ${total}` : ''} · ${scope}`,
    line(head),
    ...cells.map(line),
  ].join('\n')
}

/** `filter` keeps the chains whose model name contains it (case-insensitive), so `auto` finds cloud/auto and cloud/auto-long. */
export const fallbacksText = (all: Fallbacks, filter = ''): string => {
  const needle = filter.trim().toLowerCase()
  const keep = (list: Fallbacks['general']): Fallbacks['general'] => (needle === '' ? list : list.filter(chain => chain.from.toLowerCase().includes(needle)))
  const data = { ...all, general: keep(all.general), contextWindow: keep(all.contextWindow) }
  const width = Math.max(0, ...data.general.map(chain => chain.from.length), ...data.contextWindow.map(chain => chain.from.length))
  const rows = (title: string, list: Fallbacks['general']): string[] =>
    list.length === 0 ? [] : [title, ...list.map(chain => `  ${chain.from.padEnd(width)}  → ${chain.to.join(' → ')}`)]
  const policy = [
    data.strategy,
    data.allowedFails === null ? null : `${data.allowedFails} fails before cooldown`,
    data.cooldownSeconds === null ? null : `${data.cooldownSeconds}s cooldown`,
    data.retries === null ? null : `${data.retries} ${data.retries === 1 ? 'retry' : 'retries'}`,
  ].filter(Boolean)

  if (data.general.length === 0 && data.contextWindow.length === 0) {
    return `${needle === '' ? 'No fallbacks are configured on the router.' : `No fallback chain for a model matching "${truncate(filter.trim(), 40)}".`}${policy.length ? `\nRouter: ${policy.join(' · ')}` : ''}`
  }

  return [
    ...rows('Fallbacks (tried in order when a model fails)', data.general),
    ...rows('Context window fallbacks (when the prompt is too long)', data.contextWindow),
    ...(policy.length === 0 ? [] : [`Router: ${policy.join(' · ')}`]),
  ].join('\n')
}
