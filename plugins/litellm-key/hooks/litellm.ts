import type {
  Budget,
  BudgetWindow,
  Failure,
  FailureKind,
  KeyInfo,
  KeyStatus,
  Limits,
  ModelBudget,
  Related,
  Snapshot,
  Usage,
} from '../types'
import { maskKey, redact, truncate, utcDay } from './format'

export type Reply = { status: number; text: string }
export type Http = (url: string, headers: Record<string, string>) => Promise<Reply>

export type EnvName =
  | 'ANTHROPIC_BASE_URL'
  | 'ANTHROPIC_AUTH_TOKEN'
  | 'ANTHROPIC_API_KEY'
  | 'ANTHROPIC_CUSTOM_HEADERS'
  | 'LITELLM_PROXY_API_BASE'
  | 'LITELLM_PROXY_API_KEY'

export type Sources = {
  url: string | null
  key: string | null
  env: Partial<Record<EnvName, string>>
  settingsEnv: Partial<Record<EnvName, string>>
}

export type Credentials = {
  roots: string[]
  host: string
  key: string
  keySource: string
  headers: Record<string, string>
}

export type Resolved = { ok: true; credentials: Credentials } | { ok: false; failure: Failure }

export type Fetched =
  | { ok: true; snapshot: Snapshot; root: string }
  | { ok: false; failure: Failure }

export type FetchRequest = {
  credentials: Credentials
  http: Http
  now: number
  pinnedRoot: string | null
  wantRelated: boolean
  wantUsage: boolean
  refreshSlow: boolean
  previous: Snapshot | null
}

type Json = Record<string, unknown>

const PASS_THROUGH = /\/(?:anthropic|bedrock|vertex[_-]ai|gemini|openai|azure|cohere|v1)(?:\/.*)?$/i
const STATUSES: readonly KeyStatus[] = ['active', 'expired', 'revoked', 'deleted']
const SHA256 = /^[0-9a-f]{64}$/i

export const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const num = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export const date = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  let text = value.trim().replace(' ', 'T')

  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text)) {
    text += 'Z'
  }
  const parsed = Date.parse(text)

  return Number.isNaN(parsed) ? null : parsed
}

export const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const hostOf = (url: string): string => /^https?:\/\/(?:[^@/]*@)?([^/]+)/i.exec(url)?.[1] ?? url
const originOf = (url: string): string | null => /^(https?:\/\/[^/]+)/i.exec(url)?.[1] ?? null

const failure = (
  kind: FailureKind,
  message: string,
  now: number,
  extra: { hint?: string; status?: number } = {},
): Failure => ({
  kind,
  message,
  hint: extra.hint ?? null,
  status: extra.status ?? null,
  at: now,
})

const customHeader = (raw: string | undefined, name: string): string | null => {
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const colon = line.indexOf(':')

    if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === name) {
      return line.slice(colon + 1).trim() || null
    }
  }

  return null
}

const bearer = (value: string): string => value.replace(/^Bearer\s+/i, '').trim()

export const candidateRoots = (base: string, isExplicit: boolean): string[] => {
  const roots: string[] = []
  const add = (url: string | null): void => {
    const clean = url?.replace(/\/+$/, '')

    if (clean && !roots.includes(clean)) {
      roots.push(clean)
    }
  }
  const origin = originOf(base)
  const path = origin ? base.slice(origin.length) : ''

  if (!isExplicit && origin) {
    add(`${origin}${path.replace(PASS_THROUGH, '')}`)
  }
  add(base)
  if (!isExplicit) {
    add(origin)
  }

  return roots
}

const normalize = (url: string | undefined): string | null => {
  const base = url?.replace(/[?#].*$/, '').replace(/\/+$/, '')

  return base && /^https?:\/\/[^/\s]+/i.test(base) ? base : null
}

export const resolveCredentials = (sources: Sources, now: number): Resolved => {
  const pick = (name: EnvName): string | undefined => {
    const value = sources.env[name]?.trim() || sources.settingsEnv[name]?.trim()

    return value || undefined
  }
  const optionUrl = sources.url?.trim() || undefined
  const anthropicBase = pick('ANTHROPIC_BASE_URL')
  const proxyBase = pick('LITELLM_PROXY_API_BASE')
  const rawUrl = optionUrl ?? anthropicBase ?? proxyBase

  if (!rawUrl) {
    return {
      ok: false,
      failure: failure(
        'not-configured',
        'Claude Code is not routed through a LiteLLM proxy (ANTHROPIC_BASE_URL is not set).',
        now,
        {
          hint: 'Set ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN, or fill litellm_url and litellm_key with: claude plugin configure litellm-key',
        },
      ),
    }
  }
  const base = normalize(rawUrl)

  if (!base) {
    return {
      ok: false,
      failure: failure('not-configured', `"${truncate(redact(rawUrl), 60)}" is not an http(s) URL.`, now, {
        hint: 'Use a full URL such as https://litellm.example.com',
      }),
    }
  }
  if (/^https?:\/\/api\.anthropic\.com$/i.test(base)) {
    return {
      ok: false,
      failure: failure(
        'not-configured',
        optionUrl
          ? 'litellm_url points at api.anthropic.com, which is not a LiteLLM proxy.'
          : 'Claude Code talks to api.anthropic.com directly, not to a LiteLLM proxy.',
        now,
        { hint: 'Point ANTHROPIC_BASE_URL at your proxy, or fill litellm_url with: claude plugin configure litellm-key' },
      ),
    }
  }
  const isSameProxy = (other: string | undefined): boolean => {
    const origin = originOf(normalize(other) ?? '')

    return origin !== null && origin === originOf(base)
  }
  const route = optionUrl
    ? isSameProxy(anthropicBase)
      ? 'anthropic'
      : isSameProxy(proxyBase)
        ? 'litellm'
        : 'custom'
    : anthropicBase
      ? 'anthropic'
      : 'litellm'
  const headerKey = route === 'anthropic' ? customHeader(pick('ANTHROPIC_CUSTOM_HEADERS'), 'x-litellm-api-key') : null
  const candidates: { key: string | null | undefined; source: string; header?: 'x-litellm-api-key' }[] = [
    { key: sources.key?.trim(), source: 'plugin option litellm_key' },
    ...(route === 'anthropic'
      ? [
          { key: headerKey ? bearer(headerKey) : null, source: 'ANTHROPIC_CUSTOM_HEADERS (x-litellm-api-key)', header: 'x-litellm-api-key' as const },
          { key: pick('ANTHROPIC_AUTH_TOKEN'), source: 'ANTHROPIC_AUTH_TOKEN' },
          { key: pick('ANTHROPIC_API_KEY'), source: 'ANTHROPIC_API_KEY' },
        ]
      : []),
    ...(route === 'custom' ? [] : [{ key: pick('LITELLM_PROXY_API_KEY'), source: 'LITELLM_PROXY_API_KEY' }]),
  ]
  const chosen = candidates.find(candidate => candidate.key)

  if (!chosen?.key) {
    const hints = {
      anthropic: 'Set ANTHROPIC_AUTH_TOKEN to your virtual key, or fill litellm_key with: claude plugin configure litellm-key',
      litellm: 'Set LITELLM_PROXY_API_KEY, or fill litellm_key with: claude plugin configure litellm-key',
      custom: 'Fill litellm_key too, with: claude plugin configure litellm-key. The keys in the environment belong to other hosts and are not sent here.',
    }

    return {
      ok: false,
      failure: failure('not-configured', `No virtual key found for ${hostOf(base)}.`, now, { hint: hints[route] }),
    }
  }
  const key = bearer(chosen.key)

  return {
    ok: true,
    credentials: {
      roots: candidateRoots(base, optionUrl !== undefined),
      host: hostOf(base),
      key,
      keySource: chosen.source,
      headers: {
        accept: 'application/json',
        [chosen.header ?? 'authorization']: `Bearer ${key}`,
      },
    },
  }
}

const looksLikeLiteLLM = (status: number, json: unknown): boolean => {
  if (!isObject(json)) {
    return false
  }
  if (isObject(json.error) && json.type !== 'error') {
    return 'param' in json.error || 'code' in json.error
  }

  return 'detail' in json && !(status === 404 && json.detail === 'Not Found')
}

export const messageOf = (json: unknown, text: string): string => {
  if (isObject(json)) {
    const { error, detail, message } = json

    if (isObject(error) && typeof error.message === 'string') {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    if (typeof detail === 'string') {
      return detail
    }
    if (isObject(detail)) {
      for (const value of [detail.error, detail.message]) {
        if (typeof value === 'string') {
          return value
        }
      }
    }
    if (typeof message === 'string') {
      return message
    }
  }

  return text.trim() || 'empty response'
}

const classify = (status: number, json: unknown, text: string, key: string, now: number): Failure => {
  const message = truncate(redact(messageOf(json, text).replace(/\s+/g, ' '), [key]), 200)
  const extra = { status }

  if (status === 401 && /key is blocked/i.test(message)) {
    return failure('blocked', 'The proxy says this key is blocked.', now, {
      ...extra,
      hint: 'Ask a proxy admin to unblock it (/key/unblock), or use another key.',
    })
  }
  if (status === 401 && /expired key|key (?:has )?expired/i.test(message)) {
    return failure('expired', 'The proxy says this key has expired.', now, {
      ...extra,
      hint: 'Ask a proxy admin for a new key or a later expiry.',
    })
  }
  if (status === 401) {
    return failure('auth', `The proxy rejected the key (401): ${message}`, now, {
      ...extra,
      hint: 'The key may be invalid, expired or blocked. Check ANTHROPIC_AUTH_TOKEN.',
    })
  }
  if (status === 403) {
    return failure('forbidden', `This key may not read its own info (403): ${message}`, now, extra)
  }
  if (status === 404 && /key not found/i.test(message)) {
    return failure('not-found', 'The proxy has no database record for this key.', now, {
      ...extra,
      hint: 'The master key and keys defined only in config.yaml have no virtual-key data. Use a key made with /key/generate.',
    })
  }
  if (/database not connected|db not connected/i.test(message)) {
    return failure('db', 'The proxy has no database, so virtual keys are not tracked.', now, {
      ...extra,
      hint: 'Set DATABASE_URL on the LiteLLM proxy.',
    })
  }
  if (status === 429) {
    return failure('rate-limit', `The proxy is rate limiting this key (429): ${message}`, now, extra)
  }

  return failure('http', `The proxy answered ${status}: ${message}`, now, extra)
}

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

const NETWORK_ERRORS: readonly [RegExp, string][] = [
  [/ECONNREFUSED/i, 'connection refused'],
  [/ENOTFOUND|EAI_AGAIN/i, 'host not found'],
  [/ECONNRESET|socket hang up/i, 'connection reset'],
  [/CERT|SSL|TLS/i, 'TLS certificate problem'],
]

export const describeError = (error: unknown, key: string): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const bare = raw
    .replace(/^[\w-]+: \$\.http\.fetch\([^)]*\) (?:failed|aborted): /, '')
    .replace(/^(\w+): \1\b/, '$1')
  const known = NETWORK_ERRORS.find(([pattern]) => pattern.test(bare))

  return known ? known[1] : truncate(redact(bare, [key]), 160)
}

export const fetchSnapshot = async (request: FetchRequest): Promise<Fetched> => {
  const { credentials, http, now, pinnedRoot } = request
  const { key, headers } = credentials
  const notes: string[] = []
  const roots =
    pinnedRoot !== null && credentials.roots.includes(pinnedRoot)
      ? [pinnedRoot, ...credentials.roots.filter(root => root !== pinnedRoot)]
      : credentials.roots
  const mismatches: Failure[] = []
  let found: { root: string; body: Json; info: Json } | null = null
  let rejected: Failure | null = null

  for (const root of roots) {
    let reply: Reply

    try {
      reply = await http(`${root}/key/info`, headers)
    } catch (error) {
      mismatches.push(
        failure('network', `Could not reach ${hostOf(root)}: ${describeError(error, key)}`, now, {
          hint: 'Check that the proxy is running and that ANTHROPIC_BASE_URL points at it.',
        }),
      )
      break
    }
    const json = parse(reply.text)

    if (reply.status === 200 && isObject(json) && isObject(json.info)) {
      found = { root, body: json, info: json.info }
      break
    }
    if (looksLikeLiteLLM(reply.status, json)) {
      rejected = classify(reply.status, json, reply.text, key, now)
      break
    }
    const isGateway = reply.status >= 500 || reply.status === 408 || root === pinnedRoot

    mismatches.push(
      isGateway
        ? failure('http', `The proxy answered ${reply.status} to /key/info.`, now, { status: reply.status })
        : failure(
            'not-litellm',
            `${hostOf(root)} answered ${reply.status} to /key/info and does not look like a LiteLLM proxy.`,
            now,
            {
              status: reply.status,
              hint: 'If LiteLLM sits behind a path prefix, set litellm_url to the proxy root.',
            },
          ),
    )
  }

  if (!found) {
    return {
      ok: false,
      failure:
        rejected ??
        mismatches.find(item => item.kind !== 'network') ??
        mismatches[0] ??
        failure('network', 'No LiteLLM endpoint answered.', now),
    }
  }
  const { root, body, info } = found
  const keyInfo = parseKey(body, info, now)
  const get = async (path: string, isOptional = false): Promise<unknown> => {
    const reply = await http(`${root}${path}`, headers)

    if (isOptional && reply.status === 404) {
      return null
    }
    if (reply.status !== 200) {
      throw new Error(`${path.split('?')[0]} answered ${reply.status}`)
    }

    return parse(reply.text)
  }
  const attempt = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run()
    } catch (error) {
      notes.push(`${label} unavailable: ${describeError(error, key)}`)

      return null
    }
  }
  const days = [6, 5, 4, 3, 2, 1, 0].map(back => utcDay(now, back))
  const [first = '', last = ''] = [days[0], days[6]]
  const usageQuery = [
    `start_date=${first}`,
    `end_date=${last}`,
    `user_id=${encodeURIComponent(keyInfo.userId ?? '')}`,
    keyInfo.keyHash ? `api_key=${keyInfo.keyHash}` : '',
    'page_size=1000',
  ]
    .filter(Boolean)
    .join('&')
  const { previous, refreshSlow, wantRelated } = request
  const wantUsage = request.wantUsage && keyInfo.userId !== null
  const [userBody, team, models, usage] = await Promise.all([
    wantRelated && keyInfo.userId
      ? attempt('user budget', () => get(`/user/info?user_id=${encodeURIComponent(keyInfo.userId ?? '')}`, true))
      : Promise.resolve(null),
    wantRelated && keyInfo.teamId
      ? attempt('team budget', async () => parseTeam(await get(`/team/info?team_id=${encodeURIComponent(keyInfo.teamId ?? '')}&key_limit=1`, true)))
      : Promise.resolve(null),
    refreshSlow
      ? attempt('model list', async () => parseModels(await get('/v1/models')))
      : Promise.resolve(previous?.models ?? null),
    !wantUsage
      ? Promise.resolve(null)
      : refreshSlow
        ? attempt('usage history', async () => parseUsage(await get(`/user/daily/activity?${usageQuery}`), days))
        : Promise.resolve(previous?.usage ?? null),
  ])

  return {
    ok: true,
    root,
    snapshot: {
      fetchedAt: now,
      host: credentials.host,
      keySource: credentials.keySource,
      keyHint: maskKey(key),
      key: keyInfo,
      user: parseUser(userBody),
      userRole: parseUserRole(userBody),
      team,
      models,
      usage,
      notes,
    },
  }
}
