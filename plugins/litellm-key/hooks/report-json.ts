import type { Budget, Snapshot } from '../types'
import { todayOf, allowance } from './guidance'
import { percent } from './format'
import type { Totals } from './history'
import { usageOver } from './history'
import { checkAlerts, levelOf } from './report-key'
import { runway } from './runway'

export type JsonOptions = {
  warnPercent: number
  dailyAlert: number
  /** Why the reading is not fresh (the proxy failed since), when that is so: a script should know. */
  stale?: string | null
}

const iso = (ms: number | null): string | null => (ms === null || Number.isNaN(new Date(ms).getTime()) ? null : new Date(ms).toISOString())

const budgetJson = (budget: Budget) => ({
  spend: budget.spend,
  limit: budget.limit,
  percent: percent(budget.spend, budget.limit),
  left: budget.limit === null ? null : budget.limit - budget.spend,
  period: budget.duration,
  resetAt: iso(budget.resetAt),
  softLimit: budget.softLimit,
})

const totalsJson = (totals: Totals) => ({
  spend: totals.spend,
  requests: totals.requests,
  failed: totals.failed,
  tokens: totals.tokens,
  inputTokens: totals.inputTokens,
  outputTokens: totals.outputTokens,
  cacheReadTokens: totals.cacheReadTokens,
  perDay: totals.average,
})

/**
 * Everything the plugin knows of the key as JSON, for a script (`claude -p "/litellm json"`). The shape is versioned by
 * `schema`. It holds no credential: the key is only its masked name, and its hash is left out.
 */
export const jsonReport = (snapshot: Snapshot, now: number, options: JsonOptions): string => {
  const { key, usage } = snapshot
  const list = checkAlerts(snapshot, now, options.warnPercent, options.dailyAlert)
  const found = runway(snapshot, now)
  const room = allowance(key.budget, now)
  const today = todayOf(usage, now)
  const related = (item: Snapshot['user']) => (item === null ? null : { id: item.id, label: item.label, ...budgetJson(item.budget) })

  return JSON.stringify(
    {
      schema: 1,
      readAt: iso(snapshot.fetchedAt),
      stale: options.stale ?? null,
      proxy: snapshot.host,
      litellm: snapshot.proxy,
      level: levelOf(list),
      key: {
        alias: key.alias,
        name: key.keyName ?? snapshot.keyHint,
        status: key.status,
        type: key.keyType,
        user: key.userId,
        role: snapshot.userRole,
        team: key.teamId,
        createdAt: iso(key.createdAt),
        lastActiveAt: iso(key.lastActiveAt),
        expiresAt: iso(key.expiresAt),
      },
      budget: { ...budgetJson(key.budget), lifetimeSpend: key.lifetimeSpend },
      runway:
        found === null
          ? null
          : {
              kind: found.kind,
              perDay: found.perDay,
              runsOutAt: found.kind === 'lasts' ? null : iso(found.at),
              resetAt: found.kind === 'open' ? null : iso(found.resetAt),
            },
      allowance: room === null ? null : { perDay: room.perDay, perHour: room.perDay / 24 },
      windows: key.windows.map(item => ({
        duration: item.duration,
        spend: item.spend,
        limit: item.limit,
        percent: item.spend === null ? null : percent(item.spend, item.limit),
        resetAt: iso(item.resetAt),
      })),
      modelBudgets: key.modelBudgets.map(item => ({ model: item.model, spend: item.spend, limit: item.limit, period: item.period })),
      limits: key.limits,
      related: { user: related(snapshot.user), team: related(snapshot.team), member: related(snapshot.member) },
      models: snapshot.models ?? key.models,
      usage:
        usage === null
          ? null
          : {
              today: today === null ? null : { date: today.date, spend: today.spend, requests: today.requests, tokens: today.tokens },
              last7: totalsJson(usageOver(usage, 7)),
              last30: totalsJson(usageOver(usage, 30)),
            },
      session: snapshot.session ? { since: iso(snapshot.session.since), spend: snapshot.session.spend } : null,
      alerts: list,
    },
    null,
    2,
  )
}
