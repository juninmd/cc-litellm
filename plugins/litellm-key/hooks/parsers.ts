import type { Budget, BudgetWindow, KeyInfo, KeyStatus, Limits, ModelBudget, Related, Usage } from '../types'
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

export const parseModels = (body: unknown): string[] | null => {
  if (!isObject(body) || !Array.isArray(body.data)) {
    return null
  }
  const ids = body.data.flatMap(item => (isObject(item) && typeof item.id === 'string' ? [item.id] : []))

  return [...new Set(ids)].sort()
}

export const parseUsage = (body: unknown, days: readonly string[]): Usage | null => {
  if (!isObject(body) || !Array.isArray(body.results)) {
    return null
  }
  const perDay = new Map<string, number>()
  const perModel = new Map<string, number>()
  const total = { spend: 0, requests: 0, tokens: 0, input: 0, output: 0, cacheRead: 0 }

  for (const result of body.results) {
    if (!isObject(result)) {
      continue
    }
    const day = String(result.date ?? '').slice(0, 10)

    if (!days.includes(day)) {
      continue
    }
    const metrics = isObject(result.metrics) ? result.metrics : {}
    const spend = num(metrics.spend) ?? 0

    perDay.set(day, (perDay.get(day) ?? 0) + spend)
    total.spend += spend
    total.requests += num(metrics.api_requests) ?? 0
    total.tokens += num(metrics.total_tokens) ?? 0
    total.input += num(metrics.prompt_tokens) ?? 0
    total.output += num(metrics.completion_tokens) ?? 0
    total.cacheRead += num(metrics.cache_read_input_tokens) ?? 0

    const models = isObject(result.breakdown) && isObject(result.breakdown.models) ? result.breakdown.models : {}

    for (const [model, entry] of Object.entries(models)) {
      const modelMetrics = isObject(entry) && isObject(entry.metrics) ? entry.metrics : {}

      perModel.set(model, (perModel.get(model) ?? 0) + (num(modelMetrics.spend) ?? 0))
    }
  }

  return {
    days: days.map(day => ({ date: day, spend: perDay.get(day) ?? 0 })),
    spend: total.spend,
    requests: total.requests,
    tokens: total.tokens,
    inputTokens: total.input,
    outputTokens: total.output,
    cacheReadTokens: total.cacheRead,
    topModels: [...perModel.entries()]
      .filter(([, spend]) => spend > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([model, spend]) => ({ model, spend })),
  }
}
