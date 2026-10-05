import type {
  Budget,
  BudgetWindow,
  Failure,
  FailureKind,
  KeyInfo,
  KeyStatus,
  Limits,
  ModelBudget,
  ProxyInfo,
  Related,
  Snapshot,
  Usage,
  UsageDay,
} from '../types'
import { clean, maskKey, redact, truncate, utcDay } from './format'
import { USAGE_DAYS } from './usage'

/** What the proxy answered, and how long it took when the caller timed it. */
export type Reply = { status: number; text: string; ms?: number }
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

const num = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? clean(value) : ''

  return text.trim() !== '' ? text : null
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(item => str(item) ?? []) : []

export const date = (value: unknown): number | null => {
  if (typeof value === 'number') {
    // A Date holds up to 8.64e15 ms either side of the epoch; a moment out there cannot be told as a day.
    return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()) ? value : null
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

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The same data with every text clean, whatever the proxy put in it. */
const scrub = <T>(value: T): T => {
  if (typeof value === 'string') {
    return clean(value) as T
  }
  if (Array.isArray(value)) {
    return value.map(scrub) as T
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [clean(name), scrub(item)])) as T
  }

  return value
}

/**
 * The url with any `user:password@` taken out: the root is shown and linked, so it must never carry credentials. The
 * userinfo runs to the last `@` before the path, as a password may hold one.
 */
export const withoutCredentials = (url: string): string => url.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/\s]*@/i, '$1')

const hostOf = (url: string): string => /^https?:\/\/(?:[^/]*@)?([^/]+)/i.exec(url)?.[1] ?? url
const originOf = (url: string): string | null => /^(https?:\/\/[^/]+)/i.exec(url)?.[1] ?? null

const failure = (
  kind: FailureKind,
  message: string,
  now: number,
  extra: { hint?: string; status?: number } = {},
): Failure => ({
  kind,
  message: clean(message),
  hint: extra.hint === undefined ? null : clean(extra.hint),
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
      failure: failure(
        'not-configured',
        `"${truncate(redact(withoutCredentials(rawUrl)), 60)}" is not an http(s) URL.`,
        now,
        { hint: 'Use a full URL such as https://litellm.example.com' },
      ),
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

const messageOf = (json: unknown, text: string): string => {
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
      model: clean(model),
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

export const parseTeam = (body: unknown): Related | null => {
  const info = isObject(body) && isObject(body.team_info) ? body.team_info : null
  const id = (isObject(body) ? str(body.team_id) : null) ?? str(info?.team_id)

  if (!info || !id) {
    return null
  }
  const budget = budgetOf(info, null)

  return budget.limit === null ? null : { id, label: str(info.team_alias) ?? id, budget }
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

const quietDay = (date: string): UsageDay => ({
  date,
  spend: 0,
  requests: 0,
  failed: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  models: [],
})

export const parseUsage = (body: unknown, days: readonly string[]): Usage | null => {
  if (!isObject(body) || !Array.isArray(body.results)) {
    return null
  }
  const perDay = new Map<string, UsageDay>(days.map(day => [day, quietDay(day)]))

  for (const result of body.results) {
    const day = isObject(result) ? perDay.get(String(result.date ?? '').slice(0, 10)) : undefined

    if (!isObject(result) || !day) {
      continue
    }
    const metrics = isObject(result.metrics) ? result.metrics : {}

    day.spend += num(metrics.spend) ?? 0
    day.requests += num(metrics.api_requests) ?? 0
    day.failed += num(metrics.failed_requests) ?? 0
    day.tokens += num(metrics.total_tokens) ?? 0
    day.inputTokens += num(metrics.prompt_tokens) ?? 0
    day.outputTokens += num(metrics.completion_tokens) ?? 0
    day.cacheReadTokens += num(metrics.cache_read_input_tokens) ?? 0

    const models = isObject(result.breakdown) && isObject(result.breakdown.models) ? result.breakdown.models : {}

    for (const [name, entry] of Object.entries(models)) {
      const model = clean(name)
      const own = isObject(entry) && isObject(entry.metrics) ? entry.metrics : {}
      const spend = num(own.spend) ?? 0
      const requests = num(own.api_requests) ?? 0

      if (spend <= 0 && requests <= 0) {
        continue
      }
      const held = day.models.find(item => item.model === model)

      if (held) {
        held.spend += spend
        held.requests += requests
        held.tokens += num(own.total_tokens) ?? 0
      } else {
        day.models.push({ model, spend, requests, tokens: num(own.total_tokens) ?? 0 })
      }
    }
  }

  return { days: days.map(day => perDay.get(day) ?? quietDay(day)) }
}

const NETWORK_ERRORS: readonly [RegExp, string][] = [
  [/ECONNREFUSED/i, 'connection refused'],
  [/ENOTFOUND|EAI_AGAIN/i, 'host not found'],
  [/ECONNRESET|socket hang up/i, 'connection reset'],
  [/CERT|SSL|TLS/i, 'TLS certificate problem'],
]

const describeError = (error: unknown, key: string): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const bare = raw
    .replace(/^[\w-]+: \$\.http\.fetch\([^)]*\) (?:failed|aborted): /, '')
    .replace(/^(\w+): \1\b/, '$1')
  const known = NETWORK_ERRORS.find(([pattern]) => pattern.test(bare))

  return known ? known[1] : truncate(redact(bare, [key]), 160)
}

/** The days of history to ask for, oldest first and today last, as the proxy counts them (UTC). */
const usageDays = (now: number): string[] =>
  Array.from({ length: USAGE_DAYS }, (_, at) => utcDay(now, USAGE_DAYS - 1 - at))

/** The query for the daily activity of the key (by its hash), or of its user when the proxy did not give the hash. */
const usageQueryOf = (key: Pick<KeyInfo, 'userId' | 'keyHash'>, days: readonly string[]): string =>
  [
    `start_date=${days[0] ?? ''}`,
    `end_date=${days[days.length - 1] ?? ''}`,
    `user_id=${encodeURIComponent(key.userId ?? '')}`,
    key.keyHash ? `api_key=${key.keyHash}` : '',
    'page_size=1000',
  ]
    .filter(Boolean)
    .join('&')

export const fetchSnapshot = async (request: FetchRequest): Promise<Fetched> => {
  const { credentials, http, now, pinnedRoot } = request
  const { key, headers } = credentials
  const notes: string[] = []
  const roots =
    pinnedRoot !== null && credentials.roots.includes(pinnedRoot)
      ? [pinnedRoot, ...credentials.roots.filter(root => root !== pinnedRoot)]
      : credentials.roots
  const mismatches: Failure[] = []
  let found: { root: string; body: Json; info: Json; ms: number | null } | null = null
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
      // A reading that took no time at all is a clock that did not move, not a proxy that answered at once.
      found = { root, body: json, info: json.info, ms: reply.ms !== undefined && reply.ms > 0 ? reply.ms : null }
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
  const { root, body, info, ms } = found
  const keyInfo = parseKey(body, info, now)
  const get = async (path: string): Promise<unknown> => {
    const reply = await http(`${root}${path}`, headers)

    if (reply.status !== 200) {
      throw new Error(`${path.split('?')[0]} answered ${reply.status}`)
    }

    return parse(reply.text)
  }
  // A read that fails is undefined, to tell it from one that found nothing: the last good answer stands in for it.
  const attempt = async <T>(label: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run()
    } catch (error) {
      notes.push(`${label} unavailable: ${describeError(error, key)}`)

      return undefined
    }
  }
  // What the proxy says of itself is a courtesy: when it will not say, nothing is worth a note.
  const quiet = async <T>(run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run()
    } catch {
      return undefined
    }
  }
  const days = usageDays(now)
  const usageQuery = usageQueryOf(keyInfo, days)
  const { previous, refreshSlow, wantRelated } = request
  const wantUsage = request.wantUsage && keyInfo.userId !== null
  const [user, team, models, usage, proxy] = await Promise.all([
    wantRelated && keyInfo.userId
      ? attempt('user budget', async () => parseUser(await get(`/user/info?user_id=${encodeURIComponent(keyInfo.userId ?? '')}`)))
      : Promise.resolve(null),
    wantRelated && keyInfo.teamId
      ? attempt('team budget', async () => parseTeam(await get(`/team/info?team_id=${encodeURIComponent(keyInfo.teamId ?? '')}&key_limit=1`)))
      : Promise.resolve(null),
    refreshSlow
      ? attempt('model list', async () => parseModels(await get('/v1/models')))
      : Promise.resolve(previous?.models ?? null),
    !wantUsage
      ? Promise.resolve(null)
      : refreshSlow
        ? attempt('usage history', async () => parseUsage(await get(`/user/daily/activity?${usageQuery}`), days))
        : Promise.resolve(previous?.usage ?? null),
    refreshSlow
      ? quiet(async () => parseHealth(await get('/health/readiness')))
      : Promise.resolve(previous?.proxy ?? null),
  ])

  const kept = <T>(read: T | undefined, before: T | null | undefined): T | null =>
    read === undefined ? (before ?? null) : read

  return {
    ok: true,
    root,
    // What the proxy sent is drawn as it came, so it goes out clean: a control character in it would close the pane.
    snapshot: scrub({
      fetchedAt: now,
      host: credentials.host,
      root: withoutCredentials(root),
      keySource: credentials.keySource,
      keyHint: maskKey(key),
      key: keyInfo,
      user: kept(user, previous?.user?.id === keyInfo.userId ? previous?.user : null),
      team: kept(team, previous?.team?.id === keyInfo.teamId ? previous?.team : null),
      models: kept(models, previous?.models),
      usage: kept(usage, previous?.usage),
      proxy: kept(proxy, previous?.proxy),
      latencyMs: ms,
      notes,
    }),
  }
}

/** One endpoint asked on purpose, to say which of the plugin's reads work and how fast. */
export type Probe = {
  path: string
  /** Null when no answer came: the connection failed or timed out. */
  status: number | null
  ms: number | null
  ok: boolean
  /** What came back, in a few words: a count, a version, or why it did not. */
  detail: string
}

export type ProbeRequest = {
  credentials: Credentials
  /** The proxy root that answers. */
  root: string
  /** Times each answer (`ms`) and gives up on one that never comes. */
  http: Http
  /** What was read last: it names the user and the team to ask about. */
  snapshot: Snapshot | null
  now: number
}

const PROBE_HINTS: Record<string, string> = {
  '/user/daily/activity': 'the usage history is a beta endpoint, missing from some LiteLLM versions',
  '/user/info': 'the user budget is optional: turn show_related off to stop asking',
  '/team/info': 'the team budget is optional: turn show_related off to stop asking',
  '/health/readiness': 'optional: only the version and database state of the proxy',
  '/v1/models': 'the model list is optional: the key still works without it',
}

type Target = { path: string; query?: string; sum: (json: unknown) => string }

/**
 * Asks each endpoint the plugin reads, once and in parallel, for a status, a time and a word on what came back. Never
 * throws: a failure is a row. Only what the last reading already knows (the user, the team) can be asked about.
 */
export const probeEndpoints = async (request: ProbeRequest): Promise<Probe[]> => {
  const { credentials, root, http, snapshot, now } = request
  const { key, headers } = credentials
  const userId = snapshot?.key.userId ?? null
  const teamId = snapshot?.key.teamId ?? null
  const targets: Target[] = [
    { path: '/key/info', sum: json => (isObject(json) && isObject(json.info) ? (str(json.info.status) ?? 'ok') : 'ok') },
    ...(userId === null
      ? []
      : [
          {
            path: '/user/info',
            query: `user_id=${encodeURIComponent(userId)}`,
            sum: (json: unknown) => (parseUser(json) ? 'has a budget' : 'no budget cap'),
          },
        ]),
    ...(teamId === null
      ? []
      : [
          {
            path: '/team/info',
            query: `team_id=${encodeURIComponent(teamId)}&key_limit=1`,
            sum: (json: unknown) => (parseTeam(json) ? 'has a budget' : 'no budget cap'),
          },
        ]),
    { path: '/v1/models', sum: json => `${parseModels(json)?.length ?? 0} models` },
    ...(snapshot === null || userId === null
      ? []
      : [
          {
            path: '/user/daily/activity',
            query: usageQueryOf(snapshot.key, usageDays(now)),
            sum: (json: unknown) => {
              const used = parseUsage(json, usageDays(now))?.days.filter(day => day.requests > 0 || day.spend > 0)

              return used === undefined ? 'unreadable' : `${used.length} active days`
            },
          },
        ]),
    {
      path: '/health/readiness',
      sum: json => {
        const info = parseHealth(json)

        return info === null
          ? 'no version'
          : [info.version ? `v${info.version}` : null, info.db ? `database ${info.db.toLowerCase()}` : null].filter(Boolean).join(' · ')
      },
    },
  ]

  return Promise.all(
    targets.map(async (target): Promise<Probe> => {
      const url = `${root}${target.path}${target.query ? `?${target.query}` : ''}`

      try {
        const reply = await http(url, headers)
        const json = parse(reply.text)
        const ms = reply.ms !== undefined && reply.ms > 0 ? Math.round(reply.ms) : null

        if (reply.status === 200) {
          return { path: target.path, status: 200, ms, ok: true, detail: target.sum(json) }
        }
        const why = truncate(redact(messageOf(json, reply.text).replace(/\s+/g, ' '), [key]), 60)
        const hint = PROBE_HINTS[target.path]

        return {
          path: target.path,
          status: reply.status,
          ms,
          ok: false,
          detail: hint !== undefined && reply.status < 500 ? `${why} · ${hint}` : why,
        }
      } catch (error) {
        return { path: target.path, status: null, ms: null, ok: false, detail: describeError(error, key) }
      }
    }),
  )
}
