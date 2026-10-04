import type { Timer } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import { alertsOf } from './alerts'
import type { Credentials } from './credentials'
import { resolveCredentials } from './credentials'
import { maskKey, redact, truncate } from './format'
import { fetchSnapshot } from './litellm'
import type { Diagnostics, Mode, Ports } from './ports'
import type { Config } from './settings'
import { configOf, sourcesOf } from './settings'
import { statusText } from './summary'

const MIN_TICK_GAP_MS = 10_000
const MIN_TURN_GAP_MS = 20_000
const FRESH_MS = 15_000
const SLOW_MS = 10 * 60_000
const REMEMBERED = 60
const TRANSIENT = ['network', 'http', 'rate-limit']

export type State = {
  config: Config
  ticker: Timer | undefined
  latest: { snapshot: Snapshot | null; failure: Failure | null }
  /** The root that last accepted a session key, and which key it was: the only place an admin key may go. */
  pinnedRoot: string | null
  pinnedKeyHint: string | null
  diagnostics: Diagnostics | null
}

/** The reading cycle: one read at a time, a forced read never lost behind a running one. */
export const createSession = () => {
  const state: State = {
    config: configOf({}),
    ticker: undefined,
    latest: { snapshot: null, failure: null },
    pinnedRoot: null,
    pinnedKeyHint: null,
    diagnostics: null,
  }
  let inFlight: Promise<void> | undefined
  let queued: Promise<void> | undefined
  let lastRunAt = 0
  let lastSlowAt = 0
  let toasted: string | null = null

  // True while the root that last accepted a session key is still one of this key's roots and the key is still that key.
  const isPinnedFor = (credentials: Credentials): boolean =>
    state.pinnedRoot !== null &&
    credentials.roots.includes(state.pinnedRoot) &&
    state.pinnedKeyHint === maskKey(credentials.key)

  const notify = async (ports: Ports, snapshot: Snapshot, now: number): Promise<void> => {
    const alerts = alertsOf(snapshot, now, state.config.warnPercent)

    if (alerts.length === 0) {
      return
    }
    const stored = await ports.remembered()
    const seen = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
    const fresh = alerts.filter(alert => !seen.includes(alert.id))

    for (const alert of fresh) {
      ports.toast(alert.message)
    }
    if (fresh.length > 0) {
      await ports.remember([...seen, ...fresh.map(alert => alert.id)].slice(-REMEMBERED))
    }
  }

  const settle = async (ports: Ports, snapshot: Snapshot | null, failure: Failure | null, now: number): Promise<void> => {
    const shown = failure === null || TRANSIENT.includes(failure.kind) ? snapshot : null

    state.latest = { snapshot: shown, failure }
    await ports.publish(shown, failure)
    ports.status(state.config.isStatusShown ? statusText(shown, failure, now) : undefined)

    if (failure === null && shown) {
      await notify(ports, shown, now)
      toasted = null
    } else if (failure && !TRANSIENT.includes(failure.kind) && toasted !== failure.kind) {
      toasted = failure.kind
      ports.toast(failure.kind === 'not-configured' ? 'Not configured. Run /litellm for setup help.' : truncate(failure.message, 90))
    }
  }

  const run = async (ports: Ports, mode: Mode): Promise<void> => {
    const now = await ports.now()
    const gap = mode === 'turn' ? MIN_TURN_GAP_MS : MIN_TICK_GAP_MS

    if (mode !== 'force' && now - lastRunAt < gap) {
      return
    }
    lastRunAt = now
    let secret = ''

    await ports.loading(true)
    try {
      const resolved = resolveCredentials(await sourcesOf(state.config, ports), now)

      if (!resolved.ok) {
        state.diagnostics = null
        await settle(ports, null, resolved.failure, now)

        return
      }
      const { credentials } = resolved

      if (state.pinnedRoot !== null && !isPinnedFor(credentials)) {
        state.pinnedRoot = null
      }
      const held = state.latest.snapshot
      const previous =
        held && held.host === credentials.host && held.keyHint === maskKey(credentials.key) ? held : null
      const isSlow = mode === 'force' || previous === null || now - lastSlowAt >= SLOW_MS

      secret = credentials.key
      state.diagnostics = {
        host: credentials.host,
        roots: credentials.roots,
        keySource: credentials.keySource,
        keyHint: maskKey(credentials.key),
      }
      const fetched = await fetchSnapshot({
        credentials,
        http: (url, headers) => ports.fetch(url, { headers }),
        now,
        pinnedRoot: state.pinnedRoot,
        wantRelated: state.config.isRelatedShown,
        wantUsage: state.config.isUsageShown,
        refreshSlow: isSlow,
        previous,
      })

      if (fetched.ok) {
        state.pinnedRoot = fetched.root
        state.pinnedKeyHint = maskKey(credentials.key)
        lastSlowAt = isSlow ? now : lastSlowAt
        await settle(ports, fetched.snapshot, null, now)
      } else {
        await settle(ports, previous, fetched.failure, now)
      }
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : String(error), [secret])

      await settle(
        ports,
        null,
        { kind: 'http', message: `Unexpected error: ${truncate(message, 140)}`, hint: null, status: null, at: now },
        now,
      )
    } finally {
      await ports.loading(false)
    }
  }

  const load = (ports: Ports, mode: Mode): Promise<void> => {
    if (inFlight === undefined) {
      const current: Promise<void> = run(ports, mode).finally(() => {
        if (inFlight === current) {
          inFlight = undefined
        }
      })

      inFlight = current

      return current
    }
    if (mode !== 'force') {
      return inFlight
    }
    // a forced read often follows a write, and the read already in flight may have started before it
    const again = (): Promise<void> => {
      queued = undefined

      return load(ports, 'force')
    }

    queued ??= inFlight.then(again, again)

    return queued
  }

  const reload = (ports: Ports, mode: Mode): void => {
    load(ports, mode).catch(() => undefined)
  }

  const ensureFresh = async (ports: Ports): Promise<void> => {
    const now = await ports.now()
    const held = state.latest.snapshot

    if (!held || now - held.fetchedAt > FRESH_MS) {
      await load(ports, 'force')
    }
  }

  return { state, isPinnedFor, load, reload, ensureFresh }
}

export type Session = ReturnType<typeof createSession>
