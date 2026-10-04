import type { Failure, Snapshot } from '../types'
import type { Credentials } from './credentials'
import { hostOf } from './credentials'
import { classify, describeError, failure, looksLikeLiteLLM } from './failures'
import { maskKey, utcDay } from './format'
import type { Json } from './json'
import { isObject, parse } from './json'
import { hasMoreRows, parseKey, parseMember, parseModelPrices, parseModels, parseTeam, parseUsage, parseUser, parseUserRole } from './parsers'

export type Reply = { status: number; text: string }
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
  const [userBody, teamBody, models, usage, priceBody] = await Promise.all([
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
  ])

  // the fast ticks reuse the last usage, partial or not, so they keep saying so
  if (wantUsage && !refreshSlow && previous?.notes.includes(PARTIAL_USAGE)) {
    notes.push(PARTIAL_USAGE)
  }

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
      team: parseTeam(teamBody),
      member: parseMember(teamBody, keyInfo),
      models,
      prices: refreshSlow ? parseModelPrices(priceBody, models) : (previous?.prices ?? null),
      usage,
      notes,
    },
  }
}
