import type { Outcome } from './args'
import { redact, truncate } from './format'
import { describeError, messageOf } from './failures'
import { date, isObject, num, parse, str } from './json'
import type { Reply } from './litellm'

export type Send = (
  url: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; headers: Record<string, string>; body?: string },
) => Promise<Reply>

export type Admin = {
  root: string
  /** authorization, accept and content-type; the admin key when one is set, else the virtual key itself. */
  headers: Record<string, string>
  send: Send
  /** Every secret the headers carry, so no message can echo one. */
  secrets: string[]
  isOwnKey: boolean
}

export type Json = Record<string, unknown>

export type KeyRow = {
  alias: string | null
  hash: string
  name: string | null
  spend: number
  limit: number | null
  duration: string | null
  isBlocked: boolean
  expiresAt: number | null
  userId: string | null
  teamId: string | null
}

export type Budgeted = {
  kind: 'key' | 'user' | 'team' | 'org'
  /** What the update endpoint takes: a key hash, a user id or a team id. */
  id: string
  label: string
  spend: number
  limit: number | null
  duration: string | null
  /** False for a user the proxy has no record of: /user/update would create it. */
  exists: boolean
  /** A user's proxy role (proxy_admin, internal_user…). */
  role?: string | null
}

export type Chain = { from: string; to: string[] }
export type Fallbacks = {
  general: Chain[]
  contextWindow: Chain[]
  strategy: string | null
  allowedFails: number | null
  cooldownSeconds: number | null
  retries: number | null
}

export const HASH = /^[0-9a-f]{64}$/i

export const fail = (message: string): Outcome<never> => ({ ok: false, message })
export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })
export const query = (params: Record<string, string | number | null | undefined>): string =>
  Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join('&')

const explain = (status: number, message: string, admin: Admin): string => {
  const text = truncate(redact(message.replace(/\s+/g, ' '), admin.secrets), 200)

  if (status === 403 && /enterprise/i.test(text)) {
    return `This needs a LiteLLM enterprise license on the proxy (HTTP 403): ${text}`
  }
  if ((status === 401 || status === 403) && /only proxy admin|not authorized|not allowed|admin/i.test(text)) {
    return admin.isOwnKey
      ? `This needs a proxy admin key (HTTP ${status}): ${text}\nSet litellm_admin_key with: claude plugin configure litellm-key`
      : `The admin key was refused (HTTP ${status}): ${text}`
  }
  if (status === 401) {
    return `The proxy rejected the key (401): ${text}`
  }

  return status === 404 ? `Not found (404): ${text}` : `The proxy answered ${status}: ${text}`
}

export const request = async (
  admin: Admin,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Json,
): Promise<Outcome<unknown> & { status?: number }> => {
  let reply: Reply

  try {
    reply = await admin.send(`${admin.root}${path}`, {
      method,
      headers: admin.headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    const message = redact(describeError(error, admin.secrets[0] ?? ''), admin.secrets)
    const mayHaveLanded = method !== 'GET' && /no answer within/.test(message)

    return fail(`Could not reach the proxy: ${message}${mayHaveLanded ? ' The change may still have gone through: check before trying again.' : ''}`)
  }
  if (reply.status >= 200 && reply.status < 300) {
    return ok(parse(reply.text))
  }

  return { ...fail(explain(reply.status, messageOf(parse(reply.text), reply.text), admin)), status: reply.status }
}

export const rowOf = (item: unknown, hashHint?: unknown): KeyRow | null => {
  if (!isObject(item)) {
    return null
  }
  const hash = [item.token, item.token_id, hashHint].find(
    (value): value is string => typeof value === 'string' && HASH.test(value),
  )

  if (!hash) {
    return null
  }
  const table = isObject(item.litellm_budget_table) ? item.litellm_budget_table : null

  return {
    alias: str(item.key_alias),
    hash,
    name: str(item.key_name),
    spend: num(item.spend) ?? 0,
    limit: num(item.max_budget) ?? num(table?.max_budget),
    duration: str(item.budget_duration) ?? str(table?.budget_duration),
    isBlocked: item.blocked === true,
    expiresAt: date(item.expires),
    userId: str(item.user_id),
    teamId: str(item.team_id),
  }
}

export const listKeys = async (
  admin: Admin,
  filter: { userId?: string | null; teamId?: string | null; alias?: string | null; size?: number },
): Promise<Outcome<{ rows: KeyRow[]; total: number }>> => {
  const path = `/key/list?${query({
    return_full_object: 'true',
    size: filter.size ?? 50,
    user_id: filter.userId,
    team_id: filter.teamId,
    key_alias: filter.alias,
  })}`
  const answer = await request(admin, 'GET', path)

  if (!answer.ok) {
    return fail(answer.message)
  }
  const body = isObject(answer.value) ? answer.value : {}
  const rows = (Array.isArray(body.keys) ? body.keys : []).flatMap(item => rowOf(item) ?? [])

  return ok({ rows, total: num(body.total_count) ?? rows.length })
}

const keyByHash = async (admin: Admin, hash: string): Promise<Outcome<KeyRow>> => {
  const answer = await request(admin, 'GET', `/key/info?${query({ key: hash })}`)

  if (!answer.ok) {
    return fail(answer.status === 404 ? 'No key with that hash.' : answer.message)
  }
  const body = isObject(answer.value) ? answer.value : {}
  const row = rowOf(body.info, body.key)

  return row ? ok(row) : fail('The proxy answered, but not with key data.')
}

/** A key by alias or 64-hex hash; "" or "self" is the key Claude Code uses. A raw sk- key is refused: it would be logged. */
export const resolveKey = async (admin: Admin, ref: string | null, ownHash: string | null): Promise<Outcome<KeyRow>> => {
  const wanted = ref?.trim() ?? ''

  if (wanted === '' || wanted === 'self') {
    return ownHash ? keyByHash(admin, ownHash) : fail('Cannot tell which key is yours yet. Name it by alias or hash instead.')
  }
  if (HASH.test(wanted)) {
    return keyByHash(admin, wanted.toLowerCase())
  }
  if (/^sk-/i.test(wanted)) {
    return fail('Do not paste a key here, it would be saved in the transcript. Use its alias or its hash (see /litellm keys).')
  }
  const found = await listKeys(admin, { alias: wanted, size: 25 })

  if (!found.ok) {
    return found
  }
  const exact = found.value.rows.filter(row => row.alias === wanted)

  if (exact.length === 0) {
    return fail(`No key with the alias "${truncate(wanted, 60)}". /litellm keys lists them.`)
  }

  return exact.length === 1 && exact[0] ? ok(exact[0]) : fail(`Several keys share the alias "${truncate(wanted, 60)}"; use the hash.`)
}

const chains = (value: unknown): Chain[] =>
  (Array.isArray(value) ? value : []).flatMap(entry =>
    isObject(entry)
      ? Object.entries(entry).flatMap(([from, to]) =>
          Array.isArray(to) ? [{ from, to: to.filter((item): item is string => typeof item === 'string') }] : [],
        )
      : [],
  )

export const readFallbacks = async (admin: Admin): Promise<Outcome<Fallbacks>> => {
  const answer = await request(admin, 'GET', '/router/settings')

  if (!answer.ok) {
    return fail(answer.message)
  }
  const body = isObject(answer.value) ? answer.value : {}
  const current = isObject(body.current_values) ? body.current_values : body

  return ok({
    general: chains(current.fallbacks),
    contextWindow: chains(current.context_window_fallbacks),
    strategy: str(current.routing_strategy),
    allowedFails: num(current.allowed_fails),
    cooldownSeconds: num(current.cooldown_time),
    retries: num(current.num_retries),
  })
}
