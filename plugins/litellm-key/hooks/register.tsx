import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Failure, Session, Snapshot, ViewName } from '../types'
import { advanceSession, beginSession } from './forecast'
import { clock, maskKey, money, percent, redact, span, truncate, until } from './format'
import type { EnvName, Reply, Sources } from './litellm'
import { fetchSnapshot, isObject, resolveCredentials, withoutCredentials } from './litellm'
import {
  detailsText,
  failureText,
  keyPace,
  modelsReport,
  modelsText,
  oneLine,
  statusText,
  summaryText,
  usageReport,
} from './summary'
import { RANGES } from './usage'
import { dashboard } from './view'

const PANE = 'litellm-key'
const REQUEST_MS = 4_000
const PANE_WAIT_MS = 2_500
const MIN_TICK_GAP_MS = 10_000
const MIN_TURN_GAP_MS = 20_000
const FRESH_MS = 15_000
const SLOW_MS = 10 * 60_000
const DAY_MS = 86_400_000
const REMEMBERED = 60
const TRANSIENT = ['network', 'http', 'rate-limit']

// The shape tag makes a reload of this code that changed the snapshot read the old one as absent, not as garbage.
const snapshotState = atom({ plugin: 'litellm-key', key: 'snapshot' } as const, null, { shape: 'snapshot-v2' })
const failureState = atom({ plugin: 'litellm-key', key: 'failure' } as const, null)
const loadingState = atom({ plugin: 'litellm-key', key: 'isLoading' } as const, false)
const viewState = atom({ plugin: 'litellm-key', key: 'view' } as const, 'overview')
const rangeState = atom({ plugin: 'litellm-key', key: 'range' } as const, 7)
const sortState = atom({ plugin: 'litellm-key', key: 'sort' } as const, 'spend')
const filterState = atom({ plugin: 'litellm-key', key: 'filter' } as const, '')
const dayState = atom({ plugin: 'litellm-key', key: 'day' } as const, null)
const sessionState = atom({ plugin: 'litellm-key', key: 'session' } as const, null)

type Mode = 'tick' | 'turn' | 'force'

type Diagnostics = { host: string; roots: string[]; keySource: string; keyHint: string }

const HELP = [
  '/litellm                  open the live pane (on the tab you left it)',
  '/litellm tab <name>       open the pane on overview, usage, models or details',
  '/litellm refresh          read the key again now',
  '/litellm info             print the full summary here',
  '/litellm usage [7|14|30]  print the spend per day, as a table',
  '/litellm models           list the models this key can call',
  '/litellm debug            show where the URL and the key come from',
  '/litellm close            close the pane',
].join('\n')

const VIEWS: readonly ViewName[] = ['overview', 'usage', 'models', 'details']

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const configOf = (options: PluginOptions) => ({
  url: text(options.litellm_url),
  key: text(options.litellm_key),
  refreshSeconds: Math.round(bounded(options.refresh_seconds, 60, 15, 3600)),
  warnPercent: Math.round(bounded(options.warn_percent, 80, 1, 99)),
  isStatusShown: options.show_status_line !== false,
  isRelatedShown: options.show_related !== false,
  isUsageShown: options.show_usage !== false,
  isCompact: options.compact_pane === true,
  isStatusBar: options.status_bar !== false,
  isForecastShown: options.show_forecast !== false,
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
// Ticks once a second while the pane is open, so what it says about time ("12s ago") keeps up.
let paneClock: Timer | undefined
let inFlight: Promise<void> | undefined
let lastRunAt = 0
let lastSlowAt = 0
let pinnedRoot: string | null = null
let diagnostics: Diagnostics | null = null
let toasted: string | null = null
// The warnings toasted since this code loaded: what keeps a store that fails from repeating them on every reading.
let told: string[] = []
// What the key spent since the first reading, and whose reading that was, so another key starts again from nothing.
let tracked: { id: string; session: Session } | null = null
let latest: { snapshot: Snapshot | null; failure: Failure | null } = { snapshot: null, failure: null }

const fetchWithin = async ($: EngineInterface, url: string, headers: Record<string, string>): Promise<Reply> => {
  let timer: Timer | undefined
  const late = new Promise<never>((_, reject) => {
    timer = $.clock.after(REQUEST_MS, () => reject(new Error(`no answer within ${REQUEST_MS / 1000}s`)))
  })

  try {
    return await Promise.race([$.http.fetch(url, { headers }), late])
  } finally {
    timer?.cancel()
  }
}

const notify = async ($: EngineInterface, snapshot: Snapshot, now: number): Promise<void> => {
  const { key } = snapshot
  const who = key.keyName ?? snapshot.keyHint
  const pct = percent(key.budget.spend, key.budget.limit)
  const events: { id: string; message: string }[] = []
  // The reset moment to the minute: the proxy may jitter it by a few seconds from one read to the next.
  const window = key.budget.resetAt === null ? 'none' : Math.round(key.budget.resetAt / 60_000)

  if (pct !== null) {
    const level = pct >= 100 ? 100 : pct >= 95 ? 95 : pct >= config.warnPercent ? config.warnPercent : 0
    const amounts = `${money(key.budget.spend)} of ${money(key.budget.limit)}`

    if (level > 0) {
      events.push({
        id: `budget:${who}:${window}:${level}`,
        message:
          level >= 100 ? `The key is over budget (${amounts})` : `${pct}% of the key budget is used (${amounts})`,
      })
    }
    const pace = config.isForecastShown ? keyPace(snapshot, now) : null

    if (pace !== null && pace.basis === 'window' && pace.beforeReset && pct < 100) {
      events.push({
        id: `pace:${who}:${window}`,
        message: `At this pace the key budget runs out in ${span(pace.emptyAt - now)}, before it resets`,
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
  // A store that fails costs the memory between sessions, not the warning.
  const stored: unknown = await $.store.get('notified').catch(() => undefined)
  const before = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
  const seen = [...before, ...told]
  const fresh = events.filter(event => !seen.includes(event.id))

  for (const event of fresh) {
    $.ui.toast(event.message, { timeoutMs: 8000 })
  }
  if (fresh.length > 0) {
    told = [...told, ...fresh.map(event => event.id)].slice(-REMEMBERED)
    await $.store.set('notified', [...seen, ...fresh.map(event => event.id)].slice(-REMEMBERED)).catch(() => undefined)
  }
}

/** Counts what a fresh reading adds to the spend since the first one; a different key starts again from nothing. */
const track = async ($: EngineInterface, snapshot: Snapshot): Promise<void> => {
  const id = `${snapshot.host}|${snapshot.keyHint}`
  const spend = snapshot.key.budget.spend
  const session =
    tracked !== null && tracked.id === id
      ? advanceSession(tracked.session, spend)
      : beginSession(snapshot.fetchedAt, spend)

  tracked = { id, session }
  await update($, sessionState, () => session)
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
  $.ui.status(
    config.isStatusShown
      ? statusText(shown, failure, now, { bar: config.isStatusBar, forecast: config.isForecastShown })
      : undefined,
  )

  if (failure === null && shown) {
    await track($, shown)
    await notify($, shown, now).catch(() => undefined)
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
    const held = latest.snapshot
    const previous = held && held.host === credentials.host && held.keyHint === maskKey(credentials.key) ? held : null
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
      http: (url, headers) => fetchWithin($, url, headers),
      now,
      pinnedRoot,
      wantRelated: config.isRelatedShown,
      wantUsage: config.isUsageShown,
      refreshSlow: isSlow,
      previous,
    })

    if (fetched.ok) {
      pinnedRoot = fetched.root
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
  inFlight ??= run($, mode).finally(() => {
    inFlight = undefined
  })

  return inFlight
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

/** The summary of a reading, with the session and the pace as the options say. */
const summaryOf = (snapshot: Snapshot, now: number): string =>
  summaryText(snapshot, now, config.warnPercent, {
    session: tracked?.session ?? null,
    isForecast: config.isForecastShown,
  })

/** What a tab says as text: what `/litellm` prints where nothing can draw a pane. */
const textOf = (tab: ViewName, range: number): ((snapshot: Snapshot, now: number) => string) => {
  switch (tab) {
    case 'usage':
      return snapshot => usageReport(snapshot, range)
    case 'models':
      return snapshot => modelsReport(snapshot, range)
    case 'details':
      return (snapshot, now) => detailsText(snapshot, now, config.refreshSeconds)
    default:
      return summaryOf
  }
}

const loadPrefs = async ($: EngineInterface): Promise<void> => {
  const stored: unknown = await $.store.get('prefs').catch(() => undefined)

  if (!isObject(stored)) {
    return
  }
  const { range, sort } = stored

  if (typeof range === 'number' && RANGES.includes(range)) {
    await update($, rangeState, () => range)
  }
  if (sort === 'spend' || sort === 'name') {
    await update($, sortState, () => sort)
  }
}

/** What the person chose is kept for next time; a store that fails only loses that. */
const savePrefs = async ($: EngineInterface): Promise<void> => {
  await $.store
    .set('prefs', { range: await read($, rangeState), sort: await read($, sortState) })
    .catch(() => undefined)
}

const stopPaneClock = (): void => {
  paneClock?.cancel()
  paneClock = undefined
}

// The engine drops a pane it cannot draw without telling the hooks of `ui.close`, so the clock looks for the pane too.
const startPaneClock = ($: EngineInterface): void => {
  paneClock ??= $.clock.every(1000, () => {
    $.ui
      .panes()
      .then(panes => {
        if (panes.some(pane => pane.id === PANE)) {
          $.ui.invalidate('ui.render')
        } else {
          stopPaneClock()
        }
      })
      .catch(() => {
        // Nothing draws the pane here (a headless run): there is nothing to keep up.
      })
  })
}

/**
 * Esc closes the pane at an empty prompt, as the person's close does, and so it would when pressed to leave the filter
 * field: the models tab, the only one with a field, leaves Esc to the field alone and is closed by q or the button.
 */
const paneArgs = (tab: ViewName) =>
  ({
    id: PANE,
    title: 'LiteLLM key',
    ...(tab === 'models' ? {} : { closeOnEscape: true as const }),
    rows: 22,
    columns: 76,
  }) as const

/** Opens the pane, on `tab` when one is given, and answers with what to print: a line, or the tab as text if nothing draws. */
const showPane = async ($: EngineInterface, tab: ViewName | null): Promise<string> => {
  if (tab !== null) {
    await update($, viewState, () => tab)
  }
  const reading = ensureFresh($)

  if ((await $.session.surfaces()).length === 0) {
    await reading

    return report($, textOf(tab ?? (await read($, viewState)), await read($, rangeState)))
  }
  const opened = await $.ui.open(paneArgs(tab ?? (await read($, viewState))))

  await Promise.race([reading, $.clock.sleep(PANE_WAIT_MS)])
  const line = await report($, (snapshot, now) => oneLine(snapshot, now))

  return opened.isPlaced ? line : `${line}\nThe pane could not be shown (${opened.reason}). Use /litellm info instead.`
}

const debugText = async ($: EngineInterface): Promise<string> => {
  const { snapshot, failure } = latest
  const surfaces = await $.session.surfaces()
  const on = (flag: boolean): string => (flag ? 'on' : 'off')
  const tries = (diagnostics?.roots ?? []).map(withoutCredentials)
  const using = pinnedRoot ? `; using ${withoutCredentials(pinnedRoot)}` : ''
  const lines = [
    `Refresh every ${config.refreshSeconds}s · status line ${on(config.isStatusShown)} (bar ${on(config.isStatusBar)}) · related ${on(config.isRelatedShown)} · usage ${on(config.isUsageShown)} · forecast ${on(config.isForecastShown)} · compact pane ${on(config.isCompact)}`,
    `Pane     ${await read($, viewState)} tab · ${await read($, rangeState)} days · sorted by ${await read($, sortState)}`,
    diagnostics
      ? `Proxy    ${diagnostics.host} (tries ${tries.join(', ')}${using})`
      : 'Proxy    not resolved',
    diagnostics ? `Key      ${diagnostics.keyHint} from ${diagnostics.keySource}` : 'Key      not resolved',
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

const viewNamed = (word: string): ViewName | null =>
  VIEWS.find((view, at) => view === word.toLowerCase() || String(at + 1) === word) ?? null

export const register: Register = (on, options) => {
  config = configOf(options)
  ticker = undefined
  paneClock = undefined
  told = []

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'litellm',
      description: 'Show your LiteLLM virtual key: budget, limits, models and usage',
      argumentHint: '[tab|refresh|info|usage|models|debug|close|help]',
    })
    ticker?.cancel()
    ticker = $.clock.every(config.refreshSeconds * 1000, () => {
      reload($, 'tick')
    })
    $.clock.after(250, () => {
      reload($, 'force')
    })
    await loadPrefs($)
    // A pane that stayed up while this code reloaded does not open again: its clock starts here.
    if ((await $.ui.panes().catch(() => [])).some(pane => pane.id === PANE)) {
      startPaneClock($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    $.clock.after(1500, () => {
      reload($, 'turn')
    })

    return next(e)
  })

  on('ui.open', { id: PANE }, async ($, e, next) => {
    const opened = await next(e)

    startPaneClock($)

    return opened
  })

  on('ui.close', { id: PANE }, (_$, e, next) => {
    stopPaneClock()

    return next(e)
  })

  on('command.run', { command: 'litellm' }, async ($, e) => {
    const [word = '', argument = ''] = e.args.trim().split(/\s+/)

    try {
      switch (word.toLowerCase()) {
        case '':
        case 'pane':
        case 'open':
          return { text: await showPane($, null) }
        case 'tab':
        case 'view': {
          const tab = viewNamed(argument)

          return {
            text:
              tab === null
                ? `Unknown tab "${truncate(argument, 30)}". The tabs are ${VIEWS.join(', ')}.`
                : await showPane($, tab),
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

          return { text: await report($, summaryOf) }
        case 'usage': {
          const days = Number(argument)

          await ensureFresh($)

          return { text: await report($, snapshot => usageReport(snapshot, RANGES.includes(days) ? days : 7)) }
        }
        case 'models':
          await ensureFresh($)

          return {
            text: await report($, snapshot => {
              const names = snapshot.models ?? snapshot.key.models

              return names.length === 0
                ? `Models: ${modelsText(snapshot)}`
                : `Models (${names.length}): ${names.join(', ')}`
            }),
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
      return {
        text: `Unexpected error: ${truncate(redact(error instanceof Error ? error.message : String(error)), 160)}`,
      }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const snapshot = await read($, snapshotState)
    const failure = await read($, failureState)
    const isLoading = await read($, loadingState)
    const tab = await read($, viewState)
    const range = await read($, rangeState)
    const sort = await read($, sortState)
    const filter = await read($, filterState)
    const day = await read($, dayState)
    const session = await read($, sessionState)
    const now = await $.clock.now()

    return dashboard(ui, {
      snapshot,
      failure,
      isLoading,
      now,
      columns: e.props.bodyColumns,
      placement: e.props.placement,
      isFocused: e.props.isFocused,
      hasField: e.surface !== 'mobile',
      isTerminal: e.surface === 'terminal',
      isCompact: config.isCompact,
      isForecast: config.isForecastShown,
      isUsageShown: config.isUsageShown,
      warnPercent: config.warnPercent,
      refreshSeconds: config.refreshSeconds,
      tab,
      range,
      sort,
      filter,
      day,
      session,
      onRefresh: () => {
        reload($, 'force')
      },
      onClose: () => {
        void $.ui.close({ id: PANE })
      },
      onCopy: (text, what, press) => {
        $.ui
          .copy({ text, surface: press.surface })
          .then(result => {
            $.ui.toast(result.isCopied ? `Copied ${what}` : `Could not copy ${what} (${result.reason})`, {
              timeoutMs: 2500,
            })
          })
          .catch(() => undefined)
      },
      onTab: next => {
        void update($, viewState, () => next).then(() => {
          // Open again to change what Esc does, only when going to or from the one tab that has a field.
          if ((next === 'models') !== (tab === 'models')) {
            $.ui.open(paneArgs(next)).catch(() => undefined)
          }
        })
      },
      onRange: next => {
        void update($, rangeState, () => next).then(() => savePrefs($))
      },
      onSort: next => {
        void update($, sortState, () => next).then(() => savePrefs($))
      },
      onFilter: text => {
        void update($, filterState, () => text)
      },
      onDay: date => {
        void update($, dayState, () => date)
      },
      onFocusFilter: () => {
        $.ui.focus({ requestId: PANE, key: 'filter' }).catch(() => undefined)
      },
    })
  })
}
