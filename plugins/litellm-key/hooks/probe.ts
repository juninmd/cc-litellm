import type { Snapshot } from '../types'
import { historyDays, usageQuery } from './activity'
import type { Credentials } from './credentials'
import { resolveCredentials } from './credentials'
import { describeError, messageOf } from './failures'
import { redact, truncate, withoutCredentials } from './format'
import { isObject, parse, str } from './json'
import type { Http } from './litellm'
import { parseHealth, parseModelPrices, parseModels, parseTeam, parseUsage, parseUser } from './parsers'
import type { Ports } from './ports'
import type { Session } from './session'
import { sourcesOf } from './settings'
import { failureText } from './summary'

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

const HINTS: Record<string, string> = {
  '/user/daily/activity': 'the usage history is a beta endpoint, missing from some LiteLLM versions',
  '/user/info': 'the user budget is optional: turn show_related off to stop asking',
  '/team/info': 'the team budget is optional: turn show_related off to stop asking',
  '/health/readiness': 'optional: only the version and database state of the proxy',
  '/v1/models': 'the model list is optional: the key still works without it',
  '/model_group/info': 'the prices are optional: /litellm models just lists the names without them',
}

type Target = { path: string; query?: string; sum: (json: unknown) => string }

const targetsOf = ({ snapshot, now }: ProbeRequest): Target[] => {
  const userId = snapshot?.key.userId ?? null
  const teamId = snapshot?.key.teamId ?? null

  return [
    { path: '/key/info', sum: json => (isObject(json) && isObject(json.info) ? (str(json.info.status) ?? 'ok') : 'ok') },
    ...(userId === null
      ? []
      : [{ path: '/user/info', query: `user_id=${encodeURIComponent(userId)}`, sum: (json: unknown) => (parseUser(json) ? 'has a budget' : 'no budget cap') }]),
    ...(teamId === null
      ? []
      : [{ path: '/team/info', query: `team_id=${encodeURIComponent(teamId)}&key_limit=1`, sum: (json: unknown) => (parseTeam(json) ? 'has a budget' : 'no budget cap') }]),
    { path: '/v1/models', sum: json => `${parseModels(json)?.length ?? 0} models` },
    { path: '/model_group/info', sum: json => `${Object.keys(parseModelPrices(json, null) ?? {}).length} priced` },
    ...(snapshot === null || userId === null
      ? []
      : [
          {
            path: '/user/daily/activity',
            query: usageQuery(snapshot.key, historyDays(now)),
            sum: (json: unknown) => {
              const used = parseUsage(json, historyDays(now))?.history.filter(day => day.requests > 0 || day.spend > 0)

              return used === undefined ? 'unreadable' : `${used.length} active days`
            },
          },
        ]),
    {
      path: '/health/readiness',
      sum: json => {
        const info = parseHealth(json)

        return info === null ? 'no version' : [info.version ? `v${info.version}` : null, info.db ? `database ${info.db.toLowerCase()}` : null].filter(Boolean).join(' · ')
      },
    },
  ]
}

/**
 * Asks each endpoint the plugin reads, once and in parallel, for a status, a time and a word on what came back. Never
 * throws: a failure is a row. Only what the last reading already knows (the user, the team) can be asked about.
 */
export const probeEndpoints = async (request: ProbeRequest): Promise<Probe[]> => {
  const { credentials, root, http } = request
  const { key, headers } = credentials

  return Promise.all(
    targetsOf(request).map(async (target): Promise<Probe> => {
      const url = `${root}${target.path}${target.query ? `?${target.query}` : ''}`

      try {
        const reply = await http(url, headers)
        const json = parse(reply.text)
        const ms = reply.ms !== undefined && reply.ms > 0 ? Math.round(reply.ms) : null

        if (reply.status === 200) {
          return { path: target.path, status: 200, ms, ok: true, detail: target.sum(json) }
        }
        const why = truncate(redact(messageOf(json, reply.text).replace(/\s+/g, ' '), [key]), 60)
        const hint = HINTS[target.path]

        return { path: target.path, status: reply.status, ms, ok: false, detail: hint !== undefined && reply.status < 500 ? `${why} · ${hint}` : why }
      } catch (error) {
        return { path: target.path, status: null, ms: null, ok: false, detail: describeError(error, key) }
      }
    }),
  )
}

/** The probes as a table: whether each endpoint answered, with what, and how long it took. */
export const pingReport = (host: string, root: string, probes: readonly Probe[]): string => {
  const width = Math.max(0, ...probes.map(probe => probe.path.length))

  return [
    `${host} · ${root}`,
    ...probes.map(probe =>
      [probe.ok ? '✓' : '✗', probe.path.padEnd(width), (probe.status === null ? '—' : String(probe.status)).padStart(3), (probe.ms === null ? '—' : `${probe.ms} ms`).padStart(7), probe.detail]
        .join(' ')
        .trimEnd(),
    ),
  ].join('\n')
}

/** `/litellm ping`: every endpoint the plugin reads, asked once, with its status and its time. */
export const ping = async (session: Session, ports: Ports): Promise<{ text: string; exitCode?: number }> => {
  // A reading first, to know the user and the team to ask about; if it fails, the rest is asked all the same.
  await session.ensureFresh(ports)
  const now = await ports.now()
  const resolved = resolveCredentials(await sourcesOf(session.state.config, ports), now)

  if (!resolved.ok) {
    return { text: failureText(resolved.failure), exitCode: 3 }
  }
  const { credentials } = resolved
  const { pinnedRoot, latest } = session.state
  const root = pinnedRoot !== null && credentials.roots.includes(pinnedRoot) ? pinnedRoot : (credentials.roots[0] ?? '')
  const probes = await probeEndpoints({
    credentials,
    root,
    http: (url, headers) => ports.fetch(url, { headers }),
    snapshot: latest.snapshot,
    now,
  })
  const text = pingReport(credentials.host, withoutCredentials(root), probes)

  // The key info is what the plugin cannot do without; the rest is optional, and does not fail a script.
  return probes[0]?.ok === false ? { text, exitCode: 3 } : { text }
}
