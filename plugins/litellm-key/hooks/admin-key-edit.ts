import type { Admin, Json } from './admin'
import { fail, ok, query, request, resolveKey } from './admin'
import type { Deps, Result } from './admin-flow'
import { confirmed, done } from './admin-flow'
import { unknownFlags } from './admin-plan'
import type { Outcome, Parsed } from './args'
import { compact, money, percent, until } from './format'
import { date, isObject, num, str, strings } from './json'

type Limit = number | 'none'

/** What `key set` changes; a field left out stays as it is. */
export type KeyEdit = {
  /** An empty list means every model. */
  models?: string[]
  rpm?: Limit
  tpm?: Limit
  parallel?: Limit
  expires?: string
  alias?: string
}

export type KeyDetails = {
  alias: string | null
  models: string[]
  rpm: number | null
  tpm: number | null
  parallel: number | null
  expiresAt: number | null
}

const ALIAS = /^[A-Za-z0-9][\w.@:/-]{0,79}$/
const MODEL = /^[\w.:/@+][\w.:/@+-]{0,99}$/
const DURATION = /^([1-9]\d{0,5}(mo|s|m|h|d|w)|never)$/
const EDIT_FLAGS = ['models', 'rpm', 'tpm', 'parallel', 'expires', 'alias', 'yes', 'dry-run'] as const
const LIMITS = [
  ['rpm', 'rpm_limit'],
  ['tpm', 'tpm_limit'],
  ['parallel', 'max_parallel_requests'],
] as const

const limitOf = (value: string | true | undefined, label: string): Outcome<Limit | undefined> => {
  if (value === undefined) {
    return ok(undefined)
  }
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (text === 'none') {
    return ok('none')
  }

  return /^[1-9]\d{0,8}$/.test(text) ? ok(Number(text)) : fail(`${label} must be a whole number above 0, or none to remove the limit.`)
}

export const parseKeyEdit = (parsed: Parsed): Outcome<{ ref: string; edit: KeyEdit }> => {
  const bad = unknownFlags(parsed, EDIT_FLAGS)
  const [, ref, ...extra] = parsed.positional

  if (bad) {
    return fail(bad)
  }
  if (!ref || extra.length > 0) {
    return fail('Which key, and what to change? /litellm key set <alias|hash> [--models a,b|all --rpm 60|none --tpm N|none --parallel N|none --expires 30d|never --alias NEW]')
  }
  const { flags } = parsed
  const [rpm, tpm, parallel] = LIMITS.map(([name]) => limitOf(flags[name], `--${name}`))
  const problem = [rpm, tpm, parallel].find(item => item && !item.ok)
  const edit: KeyEdit = {}

  if (problem && !problem.ok) {
    return fail(problem.message)
  }
  if (flags.models !== undefined) {
    const text = typeof flags.models === 'string' ? flags.models.trim() : ''
    const isAll = text.toLowerCase() === 'all'
    const names = isAll ? [] : text.split(',').map(name => name.trim()).filter(Boolean)

    if (!isAll && (names.length === 0 || names.some(name => !MODEL.test(name) || name.toLowerCase() === 'all'))) {
      return fail('--models takes model names separated by commas, or all, e.g. --models cloud/auto,cloud/auto-long')
    }
    edit.models = names
  }
  if (flags.expires !== undefined) {
    const text = typeof flags.expires === 'string' ? flags.expires.trim().toLowerCase() : ''

    if (!DURATION.test(text)) {
      return fail('--expires must be a count and a unit (s, m, h, d, w, mo) such as 30d, or never.')
    }
    edit.expires = text
  }
  if (flags.alias !== undefined) {
    if (typeof flags.alias !== 'string' || !ALIAS.test(flags.alias)) {
      return fail('--alias is not a valid key alias.')
    }
    edit.alias = flags.alias
  }
  for (const [name, outcome] of [['rpm', rpm], ['tpm', tpm], ['parallel', parallel]] as const) {
    if (outcome?.ok && outcome.value !== undefined) {
      edit[name] = outcome.value
    }
  }

  return Object.keys(edit).length === 0 ? fail('Nothing to change. Name at least one of --models --rpm --tpm --parallel --expires --alias.') : ok({ ref, edit })
}

// -1 is how /key/update spells "never expires"; a null limit removes it (checked against LiteLLM v1.99.1).
export const editBody = (hash: string, edit: KeyEdit): Json => ({
  key: hash,
  ...(edit.models === undefined ? {} : { models: edit.models }),
  ...Object.fromEntries(LIMITS.flatMap(([name, field]) => (edit[name] === undefined ? [] : [[field, edit[name] === 'none' ? null : edit[name]]]))),
  ...(edit.expires === undefined ? {} : { duration: edit.expires === 'never' ? '-1' : edit.expires }),
  ...(edit.alias === undefined ? {} : { key_alias: edit.alias }),
})

export const readDetails = async (admin: Admin, hash: string): Promise<Outcome<KeyDetails>> => {
  const answer = await request(admin, 'GET', `/key/info?${query({ key: hash })}`)

  if (!answer.ok) {
    return fail(answer.message)
  }
  const info = isObject(answer.value) && isObject(answer.value.info) ? answer.value.info : null
  const table = info && isObject(info.litellm_budget_table) ? info.litellm_budget_table : null

  return info
    ? ok({
        alias: str(info.key_alias),
        models: strings(info.models),
        rpm: num(info.rpm_limit) ?? num(table?.rpm_limit),
        tpm: num(info.tpm_limit) ?? num(table?.tpm_limit),
        parallel: num(info.max_parallel_requests) ?? num(table?.max_parallel_requests),
        expiresAt: date(info.expires),
      })
    : fail('The proxy answered, but not with key data.')
}

const modelsOf = (names: readonly string[]): string =>
  names.length === 0 || names.includes('all-proxy-models') ? 'all models' : names.join(', ')
const limitText = (value: number | null): string => (value === null ? 'none' : compact(value))

/** The lines of the fields `edit` touches: `before` → the wish, or the value the proxy now reports. */
const changeLines = (before: KeyDetails, edit: KeyEdit, now: number, after?: KeyDetails): string[] => {
  const lines: string[] = []
  const arrow = (label: string, from: string, to: string): void => {
    lines.push(`  ${label.padEnd(8)} ${after ? to : `${from} → ${to}`}`)
  }

  if (edit.models !== undefined) {
    arrow('models', modelsOf(before.models), modelsOf(after ? after.models : edit.models))
  }
  for (const [name] of LIMITS) {
    if (edit[name] !== undefined) {
      arrow(name, limitText(before[name]), limitText(after ? after[name] : edit[name] === 'none' ? null : (edit[name] as number)))
    }
  }
  if (edit.expires !== undefined) {
    const current = before.expiresAt === null ? 'never' : (until(before.expiresAt, now) ?? 'never')
    const next = after
      ? after.expiresAt === null ? 'never' : (until(after.expiresAt, now) ?? 'never')
      : edit.expires === 'never' ? 'never' : `in ${edit.expires}`

    arrow('expires', current, next)
  }
  if (edit.alias !== undefined) {
    arrow('alias', before.alias ?? '—', after ? (after.alias ?? '—') : edit.alias)
  }

  return lines
}

const isNoop = (before: KeyDetails, edit: KeyEdit): boolean =>
  (edit.expires === undefined || (edit.expires === 'never' && before.expiresAt === null)) &&
  (edit.models === undefined || modelsOf(edit.models) === modelsOf(before.models)) &&
  LIMITS.every(([name]) => edit[name] === undefined || (edit[name] === 'none' ? null : edit[name]) === before[name]) &&
  (edit.alias === undefined || edit.alias === before.alias)

/** A limit the proxy still reports after being cleared comes from somewhere else, typically a budget table the key is linked to. */
const stuckLimits = (edit: KeyEdit, after: KeyDetails): string[] =>
  LIMITS.filter(([name]) => edit[name] === 'none' && after[name] !== null).map(
    ([name]) => `  note     ${name} is still ${limitText(after[name])}: it is not set on the key itself (a linked budget table?), so this command cannot remove it`,
  )

export const keySet = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const plan = parseKeyEdit(parsed)

  if (!plan.ok) {
    return done(plan.message)
  }
  const { edit } = plan.value
  const row = await resolveKey(deps.admin, plan.value.ref, deps.ownHash)

  if (!row.ok) {
    return done(row.message)
  }
  const { hash } = row.value
  const before = await readDetails(deps.admin, hash)

  if (!before.ok) {
    return done(before.message)
  }
  const name = row.value.alias ?? `${hash.slice(0, 8)}…`

  if (isNoop(before.value, edit)) {
    return done(`Key "${name}" already has those settings: nothing to change.`)
  }
  const stop = await confirmed(
    deps,
    parsed,
    [
      `Change key "${name}"`,
      ...changeLines(before.value, edit, deps.now),
      ...(hash === deps.ownHash ? ['  warning  this is the key Claude Code is using right now'] : []),
    ],
    'Apply this change',
  )

  if (stop) {
    return done(stop)
  }
  // the answer to /key/update carries the raw key: it is never read
  const updated = await request(deps.admin, 'POST', '/key/update', editBody(hash, edit))

  if (!updated.ok) {
    return done(updated.message)
  }
  const after = await readDetails(deps.admin, hash)

  return done(
    after.ok
      ? [`Updated key "${after.value.alias ?? name}":`, ...changeLines(before.value, edit, deps.now, after.value), ...stuckLimits(edit, after.value)].join('\n')
      : `Updated key "${name}", but reading it back failed (${after.message}). Check with /litellm keys.`,
    true,
  )
}

export const keyResetSpend = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const bad = unknownFlags(parsed, ['yes', 'dry-run'])
  const [, ref, ...extra] = parsed.positional

  if (bad || !ref || extra.length > 0) {
    return done(bad ?? 'Which key? /litellm key reset-spend <alias|hash>')
  }
  const row = await resolveKey(deps.admin, ref, deps.ownHash)

  if (!row.ok) {
    return done(row.message)
  }
  const { alias, hash, limit, spend } = row.value
  const name = alias ?? `${hash.slice(0, 8)}…`

  if (spend === 0) {
    return done(`Key "${name}" has no spend to reset (${money(0)}).`)
  }
  const used = percent(spend, limit)
  const stop = await confirmed(
    deps,
    parsed,
    [
      `Reset the spend of key "${name}"`,
      `  spend    ${money(spend)} → ${money(0)}`,
      ...(limit === null ? [] : [`  budget   ${money(limit)}${used === null ? '' : ` (${used}% used)`} → ${money(limit)} would be left`]),
      '  note     it changes the counter the proxy checks the budget against',
    ],
    'Reset this spend',
  )

  if (stop) {
    return done(stop)
  }
  const reset = await request(deps.admin, 'POST', `/key/${hash}/reset_spend`, { reset_to: 0 })

  if (!reset.ok) {
    return done(reset.message)
  }
  const now = isObject(reset.value) ? num(reset.value.spend) : null
  const was = isObject(reset.value) ? num(reset.value.previous_spend) : null

  return done(
    now === null ? `The proxy accepted the reset of key "${name}".` : `Key "${name}": spend ${money(was ?? spend)} → ${money(now)}.`,
    true,
  )
}
