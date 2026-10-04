import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import type { Deps } from './admin-commands'
import { GRANT_HELP, KEY_HELP, runAdmin } from './admin-commands'
import { overBudgetBand } from './band'
import { exceededBudgets, isSpentUp } from './exceeded'
import { clock, maskKey, money, percent, redact, truncate, until } from './format'
import type { Credentials, EnvName, Reply, Sources } from './litellm'
import { fetchSnapshot, isObject, resolveCredentials } from './litellm'
import { failureText, modelsText, oneLine, statusText, summaryText } from './summary'
import { dashboard } from './view'

const PANE = 'litellm-key'
const REQUEST_MS = 4_000
const ADMIN_REQUEST_MS = 15_000
const PANE_WAIT_MS = 2_500
const MIN_TICK_GAP_MS = 10_000
const MIN_TURN_GAP_MS = 20_000
const FRESH_MS = 15_000
const SLOW_MS = 10 * 60_000
const DAY_MS = 86_400_000
const REMEMBERED = 60
const TRANSIENT = ['network', 'http', 'rate-limit']

const snapshotState = atom({ plugin: 'litellm-key', key: 'snapshot' } as const, null)
const failureState = atom({ plugin: 'litellm-key', key: 'failure' } as const, null)
const loadingState = atom({ plugin: 'litellm-key', key: 'isLoading' } as const, false)

type Mode = 'tick' | 'turn' | 'force'

type Diagnostics = { host: string; roots: string[]; keySource: string; keyHint: string }

const HELP = [
  '/litellm            open the live pane',
  '/litellm refresh    read the key again now',
  '/litellm info       print the full summary here',
  '/litellm models     list the models this key can call',
  '/litellm debug      show where the URL and the key come from',
  '/litellm close      close the pane',
  '',
  'Admin commands (need litellm_admin_key, or a key that may manage keys):',
  '/litellm keys [--user ID | --team ID | --all]',
  KEY_HELP,
  GRANT_HELP,
  '/litellm fallbacks [model]',
  'Every change shows a preview first; --dry-run stops there, --yes skips the confirmation.',
  'A new key goes to the clipboard, never to the transcript.',
].join('\n')

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const configOf = (options: PluginOptions) => ({
  url: text(options.litellm_url),
  key: text(options.litellm_key),
  adminKey: text(options.litellm_admin_key),
  refreshSeconds: Math.round(bounded(options.refresh_seconds, 60, 15, 3600)),
  warnPercent: Math.round(bounded(options.warn_percent, 80, 1, 99)),
  isStatusShown: options.show_status_line !== false,
  isRelatedShown: options.show_related !== false,
  isUsageShown: options.show_usage !== false,
  isCompact: options.compact_pane === true,
})

type Config = ReturnType<typeof configOf>

const sourcesOf = async ($: EngineInterface, config: Config): Promise<Sources> => {
  let block: Record<string, unknown> = {}

  try {
    const settings = await $.settings.read()

    block = isObject(settings.env) ? settings.env : {}
  } catch {
    block = {}
  }
  const fromSettings = (name: EnvName): string | undefined => {
    const value = block[name]

    return typeof value === 'string' ? value : undefined
  }

  return {
    url: config.url,
    key: config.key,
    env: {
      ANTHROPIC_BASE_URL: await $.env.get('ANTHROPIC_BASE_URL'),
      ANTHROPIC_AUTH_TOKEN: await $.env.get('ANTHROPIC_AUTH_TOKEN'),
      ANTHROPIC_API_KEY: await $.env.get('ANTHROPIC_API_KEY'),
      ANTHROPIC_CUSTOM_HEADERS: await $.env.get('ANTHROPIC_CUSTOM_HEADERS'),
      LITELLM_PROXY_API_BASE: await $.env.get('LITELLM_PROXY_API_BASE'),
      LITELLM_PROXY_API_KEY: await $.env.get('LITELLM_PROXY_API_KEY'),
    },
    settingsEnv: {
      ANTHROPIC_BASE_URL: fromSettings('ANTHROPIC_BASE_URL'),
      ANTHROPIC_AUTH_TOKEN: fromSettings('ANTHROPIC_AUTH_TOKEN'),
      ANTHROPIC_API_KEY: fromSettings('ANTHROPIC_API_KEY'),
      ANTHROPIC_CUSTOM_HEADERS: fromSettings('ANTHROPIC_CUSTOM_HEADERS'),
      LITELLM_PROXY_API_BASE: fromSettings('LITELLM_PROXY_API_BASE'),
      LITELLM_PROXY_API_KEY: fromSettings('LITELLM_PROXY_API_KEY'),
    },
  }
}

let config: Config = configOf({})
let ticker: Timer | undefined
let inFlight: Promise<void> | undefined
let lastRunAt = 0
let lastSlowAt = 0
let pinnedRoot: string | null = null
let pinnedKeyHint: string | null = null
let queued: Promise<void> | undefined
let diagnostics: Diagnostics | null = null
let toasted: string | null = null
let latest: { snapshot: Snapshot | null; failure: Failure | null } = { snapshot: null, failure: null }

const fetchWithin = async (
  $: EngineInterface,
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
  ms = REQUEST_MS,
): Promise<Reply> => {
  let timer: Timer | undefined
  const late = new Promise<never>((_, reject) => {
    timer = $.clock.after(ms, () => reject(new Error(`no answer within ${ms / 1000}s`)))
  })

  try {
    return await Promise.race([$.http.fetch(url, init), late])
  } finally {
    timer?.cancel()
  }
}

const notify = async ($: EngineInterface, snapshot: Snapshot, now: number): Promise<void> => {
  const { key } = snapshot
  const who = key.keyName ?? snapshot.keyHint
  const pct = percent(key.budget.spend, key.budget.limit)
  const events: { id: string; message: string }[] = []

  if (pct !== null) {
    const level = isSpentUp(key.budget.spend, key.budget.limit) ? 100 : pct >= 95 ? 95 : pct >= config.warnPercent ? config.warnPercent : 0
    const amounts = `${money(key.budget.spend)} of ${money(key.budget.limit)}`

    if (level > 0) {
      events.push({
        id: `budget:${who}:${key.budget.resetAt === null ? 'none' : Math.round(key.budget.resetAt / 60_000)}:${key.budget.limit}:${level}`,
        message:
          level >= 100
            ? `The key is over budget (${amounts})`
            : `${pct}% of the key budget is used (${amounts})`,
      })
    }
  }
  if (key.status !== 'active') {
    events.push({ id: `status:${who}:${key.status}`, message: `The key is ${key.status}` })
  } else if (key.expiresAt !== null && key.expiresAt - now < 3 * DAY_MS) {
    const tier = key.expiresAt - now < DAY_MS ? '1d' : '3d'

    events.push({
      id: `expiry:${who}:${key.expiresAt}:${tier}`,
      message: `The key expires ${until(key.expiresAt, now)}`,
    })
  }
  if (events.length === 0) {
    return
  }
  const stored = await $.store.get('notified')
  const seen = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
  const fresh = events.filter(event => !seen.includes(event.id))

  for (const event of fresh) {
    $.ui.toast(event.message, { timeoutMs: 8000 })
  }
  if (fresh.length > 0) {
    await $.store.set('notified', [...seen, ...fresh.map(event => event.id)].slice(-REMEMBERED))
  }
}

const settle = async (
  $: EngineInterface,
  snapshot: Snapshot | null,
  failure: Failure | null,
  now: number,
): Promise<void> => {
  const shown = failure === null || TRANSIENT.includes(failure.kind) ? snapshot : null

  latest = { snapshot: shown, failure }
  await update($, snapshotState, () => shown)
  await update($, failureState, () => failure)
  $.ui.status(config.isStatusShown ? statusText(shown, failure, now) : undefined)

  if (failure === null && shown) {
    await notify($, shown, now)
    toasted = null
  } else if (failure && !TRANSIENT.includes(failure.kind) && toasted !== failure.kind) {
    toasted = failure.kind
    $.ui.toast(
      failure.kind === 'not-configured'
        ? 'Not configured. Run /litellm for setup help.'
        : truncate(failure.message, 90),
      { timeoutMs: 8000 },
    )
  }
}

const run = async ($: EngineInterface, mode: Mode): Promise<void> => {
  const now = await $.clock.now()
  const gap = mode === 'turn' ? MIN_TURN_GAP_MS : MIN_TICK_GAP_MS

  if (mode !== 'force' && now - lastRunAt < gap) {
    return
  }
  lastRunAt = now
  let secret = ''

  await update($, loadingState, () => true)
  try {
    const resolved = resolveCredentials(await sourcesOf($, config), now)

    if (!resolved.ok) {
      diagnostics = null
      await settle($, null, resolved.failure, now)

      return
    }
    const { credentials } = resolved

    if (pinnedRoot !== null && !isPinnedFor(credentials)) {
      pinnedRoot = null
    }
    const held = latest.snapshot
    const previous =
      held && held.host === credentials.host && held.keyHint === maskKey(credentials.key) ? held : null
    const isSlow = mode === 'force' || previous === null || now - lastSlowAt >= SLOW_MS

    secret = credentials.key
    diagnostics = {
      host: credentials.host,
      roots: credentials.roots,
      keySource: credentials.keySource,
      keyHint: maskKey(credentials.key),
    }
    const fetched = await fetchSnapshot({
      credentials,
      http: (url, headers) => fetchWithin($, url, { headers }),
      now,
      pinnedRoot,
      wantRelated: config.isRelatedShown,
      wantUsage: config.isUsageShown,
      refreshSlow: isSlow,
      previous,
    })

    if (fetched.ok) {
      pinnedRoot = fetched.root
      pinnedKeyHint = maskKey(credentials.key)
      lastSlowAt = isSlow ? now : lastSlowAt
      await settle($, fetched.snapshot, null, now)
    } else {
      await settle($, previous, fetched.failure, now)
    }
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), [secret])

    await settle(
      $,
      null,
      { kind: 'http', message: `Unexpected error: ${truncate(message, 140)}`, hint: null, status: null, at: now },
      now,
    )
  } finally {
    await update($, loadingState, () => false)
  }
}

const load = ($: EngineInterface, mode: Mode): Promise<void> => {
  if (inFlight === undefined) {
    const current: Promise<void> = run($, mode).finally(() => {
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

    return load($, 'force')
  }

  queued ??= inFlight.then(again, again)

  return queued
}

const reload = ($: EngineInterface, mode: Mode): void => {
  load($, mode).catch(() => undefined)
}

const report = async ($: EngineInterface, view: (snapshot: Snapshot, now: number) => string): Promise<string> => {
  const now = await $.clock.now()
  const { snapshot, failure } = latest

  if (!snapshot) {
    return failure ? failureText(failure) : 'Reading the key from the proxy… the answer shows up here and in the pane.'
  }

  return `${view(snapshot, now)}${failure ? `\n(stale) ${failure.message}` : ''}`
}

const ensureFresh = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  const held = latest.snapshot

  if (!held || now - held.fetchedAt > FRESH_MS) {
    await load($, 'force')
  }
}

const debugText = async ($: EngineInterface): Promise<string> => {
  const { snapshot, failure } = latest
  const surfaces = await $.session.surfaces()
  const lines = [
    `Refresh every ${config.refreshSeconds}s · status line ${config.isStatusShown ? 'on' : 'off'} · related ${config.isRelatedShown ? 'on' : 'off'} · usage ${config.isUsageShown ? 'on' : 'off'} · compact pane ${config.isCompact ? 'on' : 'off'}`,
    diagnostics
      ? `Proxy    ${diagnostics.host} (tries ${diagnostics.roots.join(', ')}${pinnedRoot ? `; using ${pinnedRoot}` : ''})`
      : 'Proxy    not resolved',
    diagnostics ? `Key      ${diagnostics.keyHint} from ${diagnostics.keySource}` : 'Key      not resolved',
    config.adminKey
      ? `Admin    ${maskKey(config.adminKey)} from plugin option litellm_admin_key`
      : 'Admin    not set (admin commands use the virtual key, which the proxy may refuse)',
    failure
      ? `Result   failed (${failure.kind}${failure.status === null ? '' : ` ${failure.status}`}): ${failure.message}`
      : snapshot
        ? `Result   ok at ${clock(snapshot.fetchedAt)}`
        : 'Result   nothing fetched yet',
    `Surfaces ${surfaces.length === 0 ? 'none (headless)' : surfaces.join(', ')}`,
    ...(failure?.hint ? [`Hint     ${failure.hint}`] : []),
    ...(snapshot ? snapshot.notes.map(note => `Note     ${note}`) : []),
  ]

  return lines.join('\n')
}

// True while the root that last accepted a session key is still one of this key's roots and the key is still that key.
const isPinnedFor = (credentials: Credentials): boolean =>
  pinnedRoot !== null && credentials.roots.includes(pinnedRoot) && pinnedKeyHint === maskKey(credentials.key)

// Admin calls use litellm_admin_key when set, else the virtual key itself, and only ever go to the root that answered /key/info.
const adminDeps = async ($: EngineInterface): Promise<{ deps: Deps } | { text: string }> => {
  await ensureFresh($)
  const now = await $.clock.now()
  const resolved = resolveCredentials(await sourcesOf($, config), now)

  if (!resolved.ok) {
    return { text: failureText(resolved.failure) }
  }
  if (pinnedRoot !== null && !isPinnedFor(resolved.credentials)) {
    // the URL or the key changed since a proxy answered: ask again before trusting any root
    await load($, 'force')
  }
  if (!isPinnedFor(resolved.credentials) || pinnedRoot === null) {
    // the admin key only goes to a proxy that already accepted this session's own key
    return {
      text: latest.failure
        ? `${failureText(latest.failure)}\nAdmin commands wait until the proxy accepts this session's key; use another session or the LiteLLM UI to fix it.`
        : 'The proxy has not answered yet. Try again in a moment.',
    }
  }
  const { credentials } = resolved
  // with an admin key nothing of the virtual key's headers goes along: x-litellm-api-key would win over authorization
  const headers: Record<string, string> = config.adminKey
    ? { accept: 'application/json', authorization: `Bearer ${config.adminKey}`, 'content-type': 'application/json' }
    : { ...credentials.headers, 'content-type': 'application/json' }

  return {
    deps: {
      admin: {
        root: pinnedRoot,
        headers,
        send: (url, init) => fetchWithin($, url, init, ADMIN_REQUEST_MS),
        secrets: config.adminKey ? [credentials.key, config.adminKey] : [credentials.key],
        isOwnKey: config.adminKey === null,
      },
      ownHash: latest.snapshot?.key.keyHash ?? null,
      ownUserId: latest.snapshot?.key.userId ?? null,
      surfaces: await $.session.surfaces(),
      now,
      ask: (question, options) => $.ui.ask(question, options),
      copy: async value => (await $.ui.copy({ text: value })).isCopied,
    },
  }
}

export const register: Register = (on, options) => {
  config = configOf(options)
  ticker = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'litellm',
      description: 'Show your LiteLLM virtual key: budget, limits, models and usage',
      argumentHint: '[refresh|info|models|keys|key|grant|fallbacks|debug|close|help]',
    })
    ticker?.cancel()
    ticker = $.clock.every(config.refreshSeconds * 1000, () => {
      reload($, 'tick')
    })
    $.clock.after(250, () => {
      reload($, 'force')
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    $.clock.after(1500, () => {
      reload($, 'turn')
    })

    return next(e)
  })

  on('command.run', { command: 'litellm' }, async ($, e) => {
    const [word = ''] = e.args.trim().split(/\s+/)

    try {
      switch (word.toLowerCase()) {
        case '':
        case 'pane':
        case 'open': {
          const reading = ensureFresh($)

          if ((await $.session.surfaces()).length === 0) {
            await reading

            return { text: await report($, (snapshot, now) => summaryText(snapshot, now, config.warnPercent)) }
          }
          const opened = await $.ui.open({ id: PANE, title: 'LiteLLM key', closeOnEscape: true, rows: 20, columns: 76 })

          await Promise.race([reading, $.clock.sleep(PANE_WAIT_MS)])
          const line = await report($, (snapshot, now) => oneLine(snapshot, now))

          return {
            text: opened.isPlaced
              ? line
              : `${line}\nThe pane could not be shown (${opened.reason}). Use /litellm info instead.`,
          }
        }
        case 'close':
        case 'hide':
          await $.ui.close({ id: PANE })

          return { text: 'Pane closed.' }
        case 'refresh':
        case 'reload':
        case 'r':
          await load($, 'force')

          return { text: await report($, (snapshot, now) => oneLine(snapshot, now)) }
        case 'info':
        case 'text':
        case 'summary':
          await ensureFresh($)

          return { text: await report($, (snapshot, now) => summaryText(snapshot, now, config.warnPercent)) }
        case 'models':
          await ensureFresh($)

          return {
            text: await report($, snapshot => {
              const names = snapshot.models ?? snapshot.key.models

              return names.length === 0 ? `Models: ${modelsText(snapshot)}` : `Models (${names.length}): ${names.join(', ')}`
            }),
          }
        case 'keys':
        case 'key':
        case 'grant':
        case 'fallbacks': {
          const ready = await adminDeps($)

          if (!('deps' in ready)) {
            return { text: ready.text }
          }
          const outcome = await runAdmin(ready.deps, word.toLowerCase() as 'keys' | 'key' | 'grant' | 'fallbacks', e.args.trim().slice(word.length))

          if (outcome.isChanged) {
            reload($, 'force')
          }

          return { text: outcome.text }
        }
        case 'debug':
        case 'diag':
        case 'doctor':
          await ensureFresh($)

          return { text: await debugText($) }
        case 'help':
        case '-h':
        case '--help':
          return { text: HELP }
        default:
          return { text: `Unknown option "${truncate(word, 30)}".\n${HELP}` }
      }
    } catch (error) {
      return { text: `Unexpected error: ${truncate(redact(error instanceof Error ? error.message : String(error)), 160)}` }
    }
  })

  // Unlike a toast, this stays for as long as a budget is spent up, and goes only when the next reading is normal.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snapshot = await read($, snapshotState)
    const lines = snapshot && !e.props.hasSurvey ? exceededBudgets(snapshot, await $.clock.now()) : []

    return lines.length === 0 ? next(e) : overBudgetBand($.ui.resolve(e), lines)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const snapshot = await read($, snapshotState)
    const failure = await read($, failureState)
    const isLoading = await read($, loadingState)
    const now = await $.clock.now()

    return dashboard(ui, {
      snapshot,
      failure,
      isLoading,
      now,
      columns: e.props.bodyColumns,
      placement: e.props.placement,
      isCompact: config.isCompact,
      warnPercent: config.warnPercent,
      refreshSeconds: config.refreshSeconds,
      onRefresh: () => {
        reload($, 'force')
      },
      onCopy: press => {
        if (snapshot) {
          void $.ui.copy({ text: summaryText(snapshot, now, config.warnPercent), surface: press.surface })
        }
      },
      onClose: () => {
        void $.ui.close({ id: PANE })
      },
    })
  })
}
