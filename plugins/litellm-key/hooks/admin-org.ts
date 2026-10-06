import { request } from './admin'
import type { Json } from './admin'
import type { Deps, Result } from './admin-flow'
import { done } from './admin-flow'
import { unknownFlags } from './admin-plan'
import { orgInfo } from './admin-targets'
import type { Parsed } from './args'
import { money, plural, truncate } from './format'
import { isObject, num, str, strings } from './json'
import { budgetText } from './summary'

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

/** An organization's budget is not in the key's own answer, and a virtual key may not read it: this is the admin's view. */
export const orgText = (info: Json, now: number): string => {
  const table = isObject(info.litellm_budget_table) ? info.litellm_budget_table : null
  const budget = {
    spend: num(info.spend) ?? 0,
    limit: num(table?.max_budget),
    softLimit: num(table?.soft_budget),
    duration: str(table?.budget_duration),
    resetAt: null,
  }
  const models = strings(info.models)
  const id = str(info.organization_id) ?? '?'

  return [
    `Organization "${str(info.organization_alias) ?? id}" · ${id}`,
    `  budget   ${budgetText(budget, now)}`,
    `  models   ${models.length === 0 ? 'all models' : models.join(', ')}`,
    `  members  ${plural(countOf(info.members), 'member')} · ${plural(countOf(info.teams), 'team')}`,
  ].join('\n')
}

const listText = (orgs: readonly unknown[]): string => {
  if (orgs.length === 0) {
    return 'No organizations on this proxy.'
  }
  const rows = orgs.flatMap(org => {
    if (!isObject(org)) {
      return []
    }
    const table = isObject(org.litellm_budget_table) ? org.litellm_budget_table : null
    const limit = num(table?.max_budget)

    return [[truncate(str(org.organization_alias) ?? '(no alias)', 30), limit === null ? `${money(num(org.spend) ?? 0)} / no cap` : `${money(num(org.spend) ?? 0)} / ${money(limit)}`, str(org.organization_id) ?? '?']]
  })
  const width = Math.max(...rows.map(row => (row[0] ?? '').length))

  return [plural(rows.length, 'organization'), ...rows.map(row => `  ${(row[0] ?? '').padEnd(width)}  ${(row[1] ?? '').padEnd(22)}  ${row[2] ?? ''}`.trimEnd())].join('\n')
}

/** `/litellm org [id|alias]`: the organization's budget, from an admin key. No name: the key's own organization, else the list. */
export const orgCommand = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const bad = unknownFlags(parsed, [])
  const [ref, ...extra] = parsed.positional

  if (bad || extra.length > 0) {
    return done(bad ?? 'Which organization? /litellm org [id|alias]')
  }
  const wanted = ref ?? deps.ownOrgId

  if (!wanted) {
    const all = await request(deps.admin, 'GET', '/organization/list')

    return done(all.ok ? listText(Array.isArray(all.value) ? all.value : []) : all.message)
  }
  const found = await orgInfo(deps.admin, wanted)

  return done(found.ok ? orgText(found.value.info, deps.now) : found.message)
}
