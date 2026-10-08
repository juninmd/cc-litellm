import type { AdminView } from '../types'
import type { Admin } from './admin'
import { fail, listKeys, ok, request } from './admin'
import type { Outcome } from './args'
import { isObject, num, str } from './json'

const TOP = 6

const listOf = (value: unknown, field: string): unknown[] =>
  Array.isArray(value) ? value : isObject(value) && Array.isArray(value[field]) ? value[field] : []

/** The teams, biggest spender first. Accepts a bare list or `{ teams: [...] }`. */
export const parseTeams = (value: unknown): AdminView['teams'] =>
  listOf(value, 'teams')
    .flatMap(item => {
      if (!isObject(item)) {
        return []
      }
      const id = str(item.team_id)
      const table = isObject(item.litellm_budget_table) ? item.litellm_budget_table : null

      return id === null ? [] : [{ id, alias: str(item.team_alias), spend: num(item.spend) ?? 0, limit: num(item.max_budget) ?? num(table?.max_budget) }]
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, TOP)

/** What each model spent across the proxy: `/global/spend/models` answers a list of `{ model, total_spend }`. */
export const parseModelSpend = (value: unknown): AdminView['models'] =>
  listOf(value, 'models')
    .flatMap(item => {
      const model = isObject(item) ? str(item.model) : null

      return isObject(item) && model !== null ? [{ model, spend: num(item.total_spend) ?? num(item.spend) ?? 0 }] : []
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, TOP)

/**
 * What an admin sees at a glance: the keys that spent most, the teams, the models and how many are configured. The key
 * list is what proves the token is an admin's; the rest is optional, and a miss becomes a note, not a failure.
 */
export const readAdminView = async (admin: Admin, now: number): Promise<Outcome<AdminView>> => {
  const [keys, teams, models, info] = await Promise.all([
    listKeys(admin, { size: 100 }),
    request(admin, 'GET', '/team/list'),
    request(admin, 'GET', '/global/spend/models?limit=10'),
    request(admin, 'GET', '/model/info'),
  ])

  if (!keys.ok) {
    return fail(keys.message)
  }
  const notes = [
    ...(teams.ok ? [] : ['teams: ' + teams.message.split('\n')[0]]),
    ...(models.ok ? [] : ['model spend: ' + models.message.split('\n')[0]]),
  ]

  return ok({
    at: now,
    keys: [...keys.value.rows]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, TOP)
      .map(row => ({ alias: row.alias, hash: row.hash, spend: row.spend, limit: row.limit, isBlocked: row.isBlocked, userId: row.userId, teamId: row.teamId })),
    keyTotal: keys.value.total,
    teams: teams.ok ? parseTeams(teams.value) : [],
    models: models.ok ? parseModelSpend(models.value) : [],
    modelCount: info.ok ? listOf(info.value, 'data').length : null,
    notes,
  })
}
