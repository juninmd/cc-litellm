import { AUTH_SOURCES, authSourceOf, resolveCredentials } from './credentials'
import type { AuthSource } from './credentials'
import { messageOf } from './failures'
import { maskKey, redact, truncate } from './format'
import { parse } from './json'
import type { Ports } from './ports'
import type { Session } from './session'
import { sourcesOf } from './settings'

export type Verdict = 'valid' | 'rejected' | 'unreachable' | 'absent'

export type AuthRow = {
  id: AuthSource
  source: string
  /** The key, masked: never the whole of it. */
  key: string | null
  verdict: Verdict
  detail: string
  isActive: boolean
}

const MARK: Record<Verdict, string> = { valid: '✓', rejected: '✗', unreachable: '?', absent: '–' }

/**
 * Asks the proxy about every key the plugin could use (`/key/info`, once each) and says which are valid. Never throws:
 * a source that fails is a row. A key found under two sources is asked once.
 */
export const authRows = async (session: Session, ports: Ports): Promise<AuthRow[]> => {
  const now = await ports.now()
  const sources = await sourcesOf(session.state.config, ports, true)
  const active = resolveCredentials(sources, now)
  const answered = new Map<string, Promise<{ verdict: Verdict; detail: string }>>()
  const ask = (key: string, root: string, headers: Record<string, string>) => {
    const known = answered.get(key)

    if (known) {
      return known
    }
    const reply = ports
      .fetch(`${root}/key/info`, { headers })
      .then(({ status, text }): { verdict: Verdict; detail: string } =>
        status === 200
          ? { verdict: 'valid', detail: 'the proxy accepts it' }
          : {
              verdict: status === 401 || status === 403 ? 'rejected' : 'unreachable',
              detail: `${status}: ${truncate(redact(messageOf(parse(text), text).replace(/\s+/g, ' '), [key]), 60)}`,
            },
      )
      .catch((error: unknown): { verdict: Verdict; detail: string } => ({
        verdict: 'unreachable',
        detail: truncate(redact(error instanceof Error ? error.message : String(error), [key]), 60),
      }))

    answered.set(key, reply)

    return reply
  }
  const rows = await Promise.all(
    AUTH_SOURCES.map(async (id): Promise<AuthRow> => {
      // Each source on its own: the same resolver the plugin reads with, told to take this one.
      const resolved = resolveCredentials({ ...sources, prefer: id }, now)

      if (!resolved.ok) {
        const reason = id === 'helper' && sources.helperError ? sources.helperError : 'no key'

        return { id, source: id, key: null, verdict: 'absent', detail: reason, isActive: false }
      }
      const { credentials } = resolved
      const root = session.state.pinnedRoot && credentials.roots.includes(session.state.pinnedRoot) ? session.state.pinnedRoot : (credentials.roots[0] ?? '')
      const { verdict, detail } = await ask(credentials.key, root, credentials.headers)

      return {
        id,
        source: credentials.keySource,
        key: maskKey(credentials.key),
        verdict,
        detail,
        isActive: active.ok && active.credentials.keySource === credentials.keySource,
      }
    }),
  )

  return rows
}

/** `/litellm auth`: every place a key can come from, which one is in use, and which of them the proxy accepts. */
export const authReport = async (session: Session, ports: Ports): Promise<{ text: string; exitCode?: number }> => {
  const rows = await authRows(session, ports)
  const authSource = await chosenSource(session, ports)
  const present = rows.filter(row => row.verdict !== 'absent')
  const valid = present.filter(row => row.verdict === 'valid')
  const width = Math.max(...rows.map(row => row.id.length))
  const lines = rows.map(row =>
    [row.isActive ? '►' : ' ', MARK[row.verdict], row.id.padEnd(width), (row.key ?? '').padEnd(10), row.verdict === 'absent' ? row.detail : `${row.source} · ${row.detail}`]
      .join(' ')
      .trimEnd(),
  )
  const using = rows.find(row => row.isActive)
  const advice =
    present.length === 0
      ? 'No source has a key. Set ANTHROPIC_AUTH_TOKEN, an apiKeyHelper, or litellm_key (claude plugin configure litellm-key).'
      : valid.length === 0
        ? 'The proxy rejects or cannot check every key it found.'
        : using && using.verdict !== 'valid'
          ? `The key in use (${using.id}) is not valid. Switch with /litellm auth use ${valid.map(row => row.id).join(' or ')}.`
          : valid.length > 1
            ? `More than one source works. The choice is ${authSource ?? 'auto (the first with a key)'}; pick one on purpose with /litellm auth use <name>.`
            : `The choice is ${authSource ?? 'auto'}.`

  return { text: [`Keys the plugin can use (► in use, ✓ valid, ✗ rejected, ? could not check, – none)`, ...lines, '', advice].join('\n'), ...(using?.verdict === 'valid' ? {} : { exitCode: 3 }) }
}

/** What is in force: the source picked with `/litellm auth use`, else the `auth_source` option; null is auto. */
const chosenSource = async (session: Session, ports: Ports): Promise<AuthSource | null> => {
  const stored = await ports.chosen().catch(() => undefined)

  return stored === 'auto' ? null : (authSourceOf(stored) ?? session.state.config.authSource)
}

const USE = `Usage: /litellm auth use <${[...AUTH_SOURCES, 'auto'].join('|')}> [--force]`

/** `/litellm auth use <name>`: keeps a source the proxy accepts (or `--force`) for the next readings. */
const useSource = async (session: Session, ports: Ports, words: string[]): Promise<{ text: string; exitCode?: number; isChanged?: boolean }> => {
  const name = words[0]?.toLowerCase() ?? ''
  const isForced = words.slice(1).some(word => word.toLowerCase() === '--force')

  if (name === 'auto') {
    await ports.choose('auto')

    return { text: 'Using the first source that has a key (auto).', isChanged: true }
  }
  const id = authSourceOf(name)

  if (id === null) {
    return { text: name === '' ? USE : `"${name}" is not a source. ${USE}`, exitCode: 2 }
  }
  const row = (await authRows(session, ports)).find(found => found.id === id)

  if (row === undefined || row.verdict === 'absent') {
    return { text: `${id} has no key (${row?.detail ?? 'no key'}), so it cannot be used. /litellm auth shows the sources that do.`, exitCode: 3 }
  }
  if (row.verdict !== 'valid' && !isForced) {
    return { text: `The proxy does not accept ${id} (${row.detail}). Pick another source, or add --force to use it anyway.`, exitCode: 3 }
  }
  await ports.choose(id)

  return { text: `Using ${id} (${row.source}, ${row.key}) from now on${row.verdict === 'valid' ? '' : ' (forced: the proxy does not accept it)'}. This wins over the auth_source option; /litellm auth use auto undoes it.`, isChanged: true }
}

export const authCommand = async (session: Session, ports: Ports, words: string[]) =>
  words[0]?.toLowerCase() === 'use' ? useSource(session, ports, words.slice(1)) : authReport(session, ports)
