import type { Admin, Budgeted, Json } from './admin'
import { fail, ok, query, request, resolveKey } from './admin'
import type { Outcome } from './args'
import { truncate } from './format'
import { isObject, num, str } from './litellm'

const spendOf = (info: Json): Pick<Budgeted, 'spend' | 'limit' | 'duration'> => ({
  spend: num(info.spend) ?? 0,
  limit: num(info.max_budget),
  duration: str(info.budget_duration),
})

const userTarget = async (admin: Admin, id: string): Promise<Outcome<Budgeted>> => {
  const answer = await request(admin, 'GET', `/user/info?${query({ user_id: id })}`)

  if (!answer.ok && answer.status !== 404) {
    return fail(answer.message)
  }
  const body = answer.ok && isObject(answer.value) ? answer.value : {}
  const info = isObject(body.user_info) ? body.user_info : null

  return ok({
    kind: 'user',
    id,
    label: (info && (str(info.user_alias) ?? str(info.user_email))) || id,
    exists: info !== null,
    role: info ? str(info.user_role) : null,
    ...(info ? spendOf(info) : { spend: 0, limit: null, duration: null }),
  })
}

const teamTarget = async (admin: Admin, ref: string): Promise<Outcome<Budgeted>> => {
  let id = ref
  let answer = await request(admin, 'GET', `/team/info?${query({ team_id: id, key_limit: 1 })}`)

  if (!answer.ok && answer.status === 404) {
    const byAlias = await request(admin, 'GET', `/v2/team/list?${query({ team_alias: ref, page_size: 5 })}`)
    const teams = byAlias.ok && isObject(byAlias.value) && Array.isArray(byAlias.value.teams) ? byAlias.value.teams : []
    const matches = teams.filter(team => isObject(team) && team.team_alias === ref)
    const [match] = matches

    if (matches.length > 1) {
      return fail(`Several teams share the alias "${truncate(ref, 60)}"; use the team id.`)
    }
    if (!isObject(match) || typeof match.team_id !== 'string') {
      return fail(`No team "${truncate(ref, 60)}" (looked by id and by alias).`)
    }
    id = match.team_id
    answer = await request(admin, 'GET', `/team/info?${query({ team_id: id, key_limit: 1 })}`)
  }
  if (!answer.ok) {
    return fail(answer.message)
  }
  const body = isObject(answer.value) ? answer.value : {}
  const info = isObject(body.team_info) ? body.team_info : null

  return info ? ok({ kind: 'team', id, label: str(info.team_alias) ?? id, exists: true, ...spendOf(info) }) : fail('The proxy answered, but not with team data.')
}

/** The budget a grant would change: a key, a user or a team, read the way the update endpoints name it. */
export const readTarget = async (
  admin: Admin,
  kind: Budgeted['kind'],
  ref: string | null,
  ownHash: string | null,
): Promise<Outcome<Budgeted>> => {
  if (kind === 'user') {
    return ref ? userTarget(admin, ref) : fail('--user needs a user id.')
  }
  if (kind === 'team') {
    return ref ? teamTarget(admin, ref) : fail('--team needs a team id or alias.')
  }
  const row = await resolveKey(admin, ref, ownHash)

  return row.ok
    ? ok({
        kind: 'key',
        id: row.value.hash,
        label: row.value.alias ?? row.value.name ?? `${row.value.hash.slice(0, 8)}…`,
        exists: true,
        spend: row.value.spend,
        limit: row.value.limit,
        duration: row.value.duration,
      })
    : row
}
