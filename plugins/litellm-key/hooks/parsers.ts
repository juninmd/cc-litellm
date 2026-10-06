import type { Budget, BudgetWindow, KeyInfo, KeyStatus, Limits, ModelBudget, ModelPrice, ProxyInfo, Related } from '../types'
import type { Json } from './json'
import { date, isObject, num, str, strings } from './json'

const STATUSES: readonly KeyStatus[] = ['active', 'expired', 'revoked', 'deleted']
const SHA256 = /^[0-9a-f]{64}$/i

const budgetOf = (row: Json, table: Json | null): Budget => ({
  spend: num(row.spend) ?? 0,
  limit: num(row.max_budget) ?? num(table?.max_budget),
  softLimit: num(table?.soft_budget) ?? num(row.soft_budget),
  duration: str(row.budget_duration) ?? str(table?.budget_duration),
  resetAt: date(row.budget_reset_at) ?? date(table?.budget_reset_at),
})

const limitsOf = (row: Json, table: Json | null): Limits => ({
  rpm: num(row.rpm_limit) ?? num(table?.rpm_limit),
  tpm: num(row.tpm_limit) ?? num(table?.tpm_limit),
  tpd: num(row.tpd_limit) ?? num(table?.tpd_limit),
  parallel: num(row.max_parallel_requests) ?? num(table?.max_parallel_requests),
})

const windowsOf = (row: Json): BudgetWindow[] => {
  const usage = isObject(row.budget_limits_usage) ? row.budget_limits_usage : {}
  const windows: BudgetWindow[] = []

  if (Array.isArray(row.budget_limits)) {
    for (const entry of row.budget_limits) {
      const duration = isObject(entry) ? str(entry.budget_duration) : null
      const limit = isObject(entry) ? num(entry.max_budget) : null

      if (isObject(entry) && duration !== null && limit !== null) {
        const used = usage[duration]

        windows.push({
          duration,
          limit,
          spend: isObject(used) ? num(used.current_spend) : null,
          resetAt: date(entry.reset_at),
        })
      }
    }
  }

  return windows
}

const modelBudgetsOf = (row: Json, table: Json | null): ModelBudget[] => {
  const configured = isObject(row.model_max_budget) && Object.keys(row.model_max_budget).length > 0
    ? row.model_max_budget
    : isObject(table?.model_max_budget)
      ? table.model_max_budget
      : {}
  const usage = isObject(row.model_max_budget_usage) ? row.model_max_budget_usage : {}
  const spent = isObject(row.model_spend) ? row.model_spend : {}
  const names = new Set([...Object.keys(configured), ...Object.keys(usage)])

  return [...names].sort().map(model => {
    const config = configured[model]
    const used = usage[model]

    return {
      model,
      spend: (isObject(used) ? num(used.current_spend) : null) ?? num(spent[model]) ?? 0,
      limit:
        num(config) ??
        (isObject(config) ? (num(config.budget_limit) ?? num(config.max_budget)) : null) ??
        (isObject(used) ? num(used.budget_limit) : null),
      period:
        (isObject(config) ? (str(config.time_period) ?? str(config.budget_duration)) : null) ??
        (isObject(used) ? str(used.time_period) : null),
    }
  })
}

export const parseKey = (body: Json, info: Json, now: number): KeyInfo => {
  const table = isObject(info.litellm_budget_table) ? info.litellm_budget_table : null
  const expiresAt = date(info.expires)
  const reported = STATUSES.find(status => status === info.status)
  const derived: KeyStatus =
    info.blocked === true ? 'revoked' : expiresAt !== null && expiresAt < now ? 'expired' : 'active'
  const hash = typeof body.key === 'string' && SHA256.test(body.key) ? body.key : null

  return {
    alias: str(info.key_alias),
    keyName: str(info.key_name),
    keyHash: hash,
    status: reported ?? derived,
    budget: budgetOf(info, table),
    lifetimeSpend: num(info.total_spend),
    windows: windowsOf(info),
    modelBudgets: modelBudgetsOf(info, table),
    limits: limitsOf(info, table),
    models: strings(info.models),
    expiresAt,
    createdAt: date(info.created_at),
    lastActiveAt: date(info.last_active),
    userId: str(info.user_id),
    teamId: str(info.team_id),
    organizationId: str(info.organization_id),
    keyType: str(info.key_type),
  }
}

export const parseUser = (body: unknown): Related | null => {
  const info = isObject(body) && isObject(body.user_info) ? body.user_info : null
  const id = (isObject(body) ? str(body.user_id) : null) ?? str(info?.user_id)

  if (!info || !id) {
    return null
  }
  const budget = budgetOf(info, null)

  return budget.limit === null
    ? null
    : { id, label: str(info.user_alias) ?? str(info.user_email) ?? id, budget }
}

export const parseUserRole = (body: unknown): string | null =>
  isObject(body) && isObject(body.user_info) ? str(body.user_info.user_role) : null

export const parseTeam = (body: unknown): Related | null => {
  const info = isObject(body) && isObject(body.team_info) ? body.team_info : null
  const id = (isObject(body) ? str(body.team_id) : null) ?? str(info?.team_id)

  if (!info || !id) {
    return null
  }
  const budget = budgetOf(info, null)

  return budget.limit === null ? null : { id, label: str(info.team_alias) ?? id, budget }
}

/**
 * The per-member cap of the team (team_member_budget) for the key's user. A virtual key can read the cap but not the
 * member's total, so the key's own spend stands in as a floor. It is never above the real figure for a cap that does not
 * reset; a cap that resets zeroes the member's spend each period (reset_budget_job.py, v1.99.1) but not the key's.
 */
export const parseMember = (body: unknown, key: KeyInfo): Related | null => {
  const info = isObject(body) && isObject(body.team_info) ? body.team_info : null

  if (!info || key.userId === null) {
    return null
  }
  const memberships = isObject(body) && Array.isArray(body.team_memberships) ? body.team_memberships : []
  const own = memberships.find(item => isObject(item) && item.user_id === key.userId)
  const ownTable = isObject(own) && isObject(own.litellm_budget_table) ? own.litellm_budget_table : null
  const shared = isObject(info.team_member_budget_table) ? info.team_member_budget_table : null
  const table = num(ownTable?.max_budget) === null ? shared : ownTable
  const limit = num(table?.max_budget)

  if (limit === null) {
    return null
  }
  const reported = isObject(own) ? (num(own.spend) ?? 0) : 0

  return {
    id: key.userId,
    label: key.userId,
    budget: {
      spend: Math.max(reported, key.budget.spend),
      limit,
      softLimit: num(table?.soft_budget),
      duration: str(table?.budget_duration),
      resetAt: date(table?.budget_reset_at),
    },
    isFloor: true,
  }
}

const perMillion = (perToken: unknown): number | null => {
  const value = num(perToken)

  return value === null ? null : Math.round(value * 1e10) / 1e4
}

/** /model_group/info answers for every model of the proxy, whatever the key may call: `allowed` narrows it. */
export const parseModelPrices = (body: unknown, allowed: readonly string[] | null): Record<string, ModelPrice> | null => {
  if (!isObject(body) || !Array.isArray(body.data)) {
    return null
  }
  const prices: Record<string, ModelPrice> = {}

  for (const item of body.data) {
    const name = isObject(item) ? str(item.model_group) : null

    if (isObject(item) && name !== null && (allowed === null || allowed.includes(name))) {
      prices[name] = {
        input: perMillion(item.input_cost_per_token),
        output: perMillion(item.output_cost_per_token),
        context: num(item.max_input_tokens),
      }
    }
  }

  return prices
}

/** What `/health/readiness` says of the proxy: its version and how it stands with its database. */
export const parseHealth = (body: unknown): ProxyInfo | null => {
  if (!isObject(body)) {
    return null
  }
  const version = str(body.litellm_version) ?? str(body.version)
  const db = str(body.db)

  return version === null && db === null ? null : { version, db }
}

export const parseModels = (body: unknown): string[] | null => {
  if (!isObject(body) || !Array.isArray(body.data)) {
    return null
  }
  const ids = body.data.flatMap(item => (isObject(item) ? (str(item.id) ?? []) : []))

  return [...new Set(ids)].sort()
}

export { hasMoreRows, parseUsage } from './activity'
