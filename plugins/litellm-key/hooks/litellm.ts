import type { Failure, Snapshot } from '../types'
import { HISTORY_DAYS } from './activity'
import type { Credentials } from './credentials'
import { hostOf } from './credentials'
import { classify, describeError, failure, looksLikeLiteLLM } from './failures'
import { maskKey, utcDay, withoutCredentials } from './format'
import type { Json } from './json'
import { isObject, parse, scrub } from './json'
import {
  hasMoreRows,
  parseHealth,
  parseKey,
  parseMember,
  parseModelPrices,
  parseModels,
  parseTeam,
  parseUsage,
  parseUser,
  parseUserRole,
} from './parsers'

/** What the proxy answered, and how long it took when the caller timed it. */
export type Reply = { status: number; text: string; ms?: number }
export type Http = (url: string, headers: Record<string, string>) => Promise<Reply>

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

const PARTIAL_USAGE = 'usage history is partial: the proxy has more rows than one page holds'

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
  const days = Array.from({ length: HISTORY_DAYS }, (_, at) => utcDay(now, HISTORY_DAYS - 1 - at))
  const [first = '', last = ''] = [days[0], days[days.length - 1]]
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
  const [userBody, teamBody, models, usage, priceBody, proxy] = await Promise.all([
    wantRelated && keyInfo.userId
      ? attempt('user budget', () => get(`/user/info?user_id=${encodeURIComponent(keyInfo.userId ?? '')}`, true))
      : Promise.resolve(null),
    wantRelated && keyInfo.teamId
      ? attempt('team budget', () => get(`/team/info?team_id=${encodeURIComponent(keyInfo.teamId ?? '')}&key_limit=1`, true))
      : Promise.resolve(null),
    refreshSlow
      ? attempt('model list', async () => parseModels(await get('/v1/models')))
      : Promise.resolve(previous?.models ?? null),
    !wantUsage
      ? Promise.resolve(null)
      : refreshSlow
        ? attempt('usage history', async () => {
            const body = await get(`/user/daily/activity?${usageQuery}`)

            if (hasMoreRows(body)) {
              notes.push(PARTIAL_USAGE)
            }

            return parseUsage(body, days)
          })
        : Promise.resolve(previous?.usage ?? null),
    refreshSlow ? attempt('model prices', () => get('/model_group/info', true)) : Promise.resolve(null),
    refreshSlow ? quiet(async () => parseHealth(await get('/health/readiness'))) : Promise.resolve(previous?.proxy ?? null),
  ])

  // the fast ticks reuse the last usage, partial or not, so they keep saying so
  if (wantUsage && !refreshSlow && previous?.notes.includes(PARTIAL_USAGE)) {
    notes.push(PARTIAL_USAGE)
  }
  // A read that failed leaves what the last good one held (for this key's user and team), and a note.
  const sameUser = previous !== null && previous.key.userId === keyInfo.userId
  const sameTeam = previous !== null && previous.key.teamId === keyInfo.teamId
  const kept = <T,>(read: T | undefined, before: T | null | undefined): T | null => (read === undefined ? (before ?? null) : read)

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
      user: userBody === undefined ? (sameUser ? (previous?.user ?? null) : null) : parseUser(userBody),
      userRole: userBody === undefined ? (sameUser ? (previous?.userRole ?? null) : null) : parseUserRole(userBody),
      team: teamBody === undefined ? (sameTeam ? (previous?.team ?? null) : null) : parseTeam(teamBody),
      member: teamBody === undefined ? (sameTeam ? (previous?.member ?? null) : null) : parseMember(teamBody, keyInfo),
      models: kept(models, previous?.models),
      prices: refreshSlow
        ? priceBody === undefined
          ? (previous?.prices ?? null)
          : parseModelPrices(priceBody, kept(models, previous?.models))
        : (previous?.prices ?? null),
      usage: kept(usage, previous?.usage),
      proxy: kept(proxy, previous?.proxy),
      latencyMs: ms,
      notes,
    }),
  }
}
