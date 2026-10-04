import type { Admin, Budgeted, Json } from './admin'
import { fail, HASH, ok, request } from './admin'
import { readTarget } from './admin-targets'
import type { Outcome } from './args'
import { isObject, str } from './json'

const UPDATE: Record<Budgeted['kind'], { path: string; field: string }> = {
  key: { path: '/key/update', field: 'key' },
  user: { path: '/user/update', field: 'user_id' },
  team: { path: '/team/update', field: 'team_id' },
}

export type Applied = { budget: Budgeted; unread: string | null }

/**
 * Sets max_budget, then reads the target back: the answer to /key/update carries the raw key, so it is never used.
 * A failed read-back is not a failed write: `unread` carries why, and the caller must not suggest a retry.
 */
export const applyBudget = async (admin: Admin, target: Budgeted, limit: number): Promise<Outcome<Applied>> => {
  const { path, field } = UPDATE[target.kind]
  const done = await request(admin, 'POST', path, { [field]: target.id, max_budget: limit })

  if (!done.ok) {
    return fail(done.message)
  }
  const back = await readTarget(admin, target.kind, target.id, null)

  return ok(back.ok ? { budget: back.value, unread: null } : { budget: { ...target, limit }, unread: back.message })
}

export const generateKey = async (
  admin: Admin,
  body: Json,
): Promise<Outcome<{ secret: string; hash: string | null; name: string | null }>> => {
  const done = await request(admin, 'POST', '/key/generate', body)

  if (!done.ok) {
    return fail(done.message)
  }
  const json = isObject(done.value) ? done.value : {}
  const secret = str(json.key)
  const hash = [json.token, json.token_id].find((value): value is string => typeof value === 'string' && HASH.test(value))

  return secret ? ok({ secret, hash: hash ?? null, name: str(json.key_name) }) : fail('The proxy answered, but without a key.')
}

export const deleteKey = async (admin: Admin, hash: string): Promise<Outcome<true>> => {
  const done = await request(admin, 'POST', '/key/delete', { keys: [hash] })

  return done.ok ? ok(true) : fail(done.message)
}

export const setBlocked = async (admin: Admin, hash: string, isBlocked: boolean): Promise<Outcome<true>> => {
  const done = await request(admin, 'POST', isBlocked ? '/key/block' : '/key/unblock', { key: hash })

  return done.ok ? ok(true) : fail(done.message)
}
