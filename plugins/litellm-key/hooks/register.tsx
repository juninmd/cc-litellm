import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Failure, MetricName, Session, Snapshot, ViewName } from '../types'
import { closest, parseDay, rangeIn, splitArgs, strayNumber } from './args'
import { advanceSession, beginSession } from './forecast'
import { clock, isoDay, maskKey, money, percent, plural, redact, span, truncate, until } from './format'
import type { EnvName, Reply, Sources } from './litellm'
import { fetchSnapshot, isObject, probeEndpoints, resolveCredentials, withoutCredentials } from './litellm'
import type { ReportOptions } from './reports'
import { checkVerdict, compareReport, dayReport, jsonReport, paceReport, pingReport } from './reports'
import {
  NO_HISTORY,
  dailyOver,
  detailsText,
  failureText,
  keyPace,
  modelsReport,
  modelsText,
  oneLine,
  statusText,
  summaryText,
  usageCsv,
  usageReport,
} from './summary'
import { COMPARABLE, METRICS, RANGES } from './usage'
import { dashboard } from './view'

const PANE = 'litellm-key'
const REQUEST_MS = 4_000
const PANE_WAIT_MS = 2_500
const MIN_TICK_GAP_MS = 10_000
const MIN_TURN_GAP_MS = 20_000
const FRESH_MS = 15_000
const SLOW_MS = 10 * 60_000
// With a daily alert set the history is what the alert watches, so it is read more often.
const WATCHED_SLOW_MS = 3 * 60_000
const DAY_MS = 86_400_000
const REMEMBERED = 60
const TRANSIENT = ['network', 'http', 'rate-limit']

// The shape tag makes a reload of this code that changed the snapshot read the old one as absent, not as garbage.
const snapshotState = atom({ plugin: 'litellm-key', key: 'snapshot' } as const, null, { shape: 'snapshot-v3' })
const failureState = atom({ plugin: 'litellm-key', key: 'failure' } as const, null)
const loadingState = atom({ plugin: 'litellm-key', key: 'isLoading' } as const, false)
const viewState = atom({ plugin: 'litellm-key', key: 'view' } as const, 'overview')
const rangeState = atom({ plugin: 'litellm-key', key: 'range' } as const, 7)
const sortState = atom({ plugin: 'litellm-key', key: 'sort' } as const, 'spend')
const metricState = atom({ plugin: 'litellm-key', key: 'metric' } as const, 'spend')
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
  '/litellm status           print the status line as text',
  '/litellm pace             where the budget is heading, and what it can spend a day',
  '/litellm usage [7|14|30]  print the spend per day, as a table',
  '/litellm compare [7|14]   what changed against the days before, model by model',
  '/litellm day [when]       one day by model: today, yesterday, 2026-10-03, 10-03, mon',
  '/litellm models [text]    list the models this key can call (only those with the text)',
  '/litellm check [warn%]    OK, WARNING, CRITICAL or UNKNOWN: the exit code of a -p run too',
  '/litellm json             everything as JSON, for scripts',
  '/litellm csv [7|14|30]    the days as CSV',
  '/litellm copy [what]      copy a report: overview, usage, models, details, pace, compare, csv, json',
  '/litellm share [what]     hand a report to Claude, to ask about it',
  '/litellm ping             try every endpoint the plugin reads, with times',
  '/litellm debug            show where the URL and the key come from',
  '/litellm close            close the pane',
].join('\n')

// What a typo of a subcommand is held against: the names, not their aliases.
const WORDS = [
  'tab',
  'refresh',
  'info',
  'status',
  'pace',
  'usage',
  'compare',
  'day',
  'models',
  'check',
  'json',
  'csv',
  'copy',
  'share',
  'ping',
  'debug',
  'close',
  'help',
]

const VIEWS: readonly ViewName[] = ['overview', 'usage', 'models', 'details']

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const configOf = (options: PluginOptions) => ({
  url: text(options.litellm_url),
  key: text(options.litellm_key),
  refreshSeconds: Math.round(bounded(options.refresh_seconds, 60, 15, 3600)),
  warnPercent: Math.round(bounded(options.warn_percent, 80, 1, 99)),
  // Whole cents, and zero for off.
  dailyAlert: Math.round(bounded(options.daily_alert, 0, 0, 1_000_000) * 100) / 100,
  isToastShown: options.show_toasts !== false,
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

/** One request, timed, and given up on after REQUEST_MS. */
const fetchWithin = async ($: EngineInterface, url: string, headers: Record<string, string>): Promise<Reply> => {
  const started = await $.clock.now()
  let timer: Timer | undefined
  const late = new Promise<never>((_, reject) => {
    timer = $.clock.after(REQUEST_MS, () => reject(new Error(`no answer within ${REQUEST_MS / 1000}s`)))
  })

  try {
    const { status, text } = await Promise.race([$.http.fetch(url, { headers }), late])

    return { status, text, ms: (await $.clock.now()) - started }
  } finally {
    timer?.cancel()
  }
}

/** What the status line says, as the options of the person have it. */
const statusOptions = () => ({
  bar: config.isStatusBar,
  forecast: config.isForecastShown,
  dailyAlert: config.dailyAlert,
})

/** What the reports say beyond the reading: the session, the pace and the daily alert, as the options have them. */
const reportOptions = (): ReportOptions => ({
  session: tracked?.session ?? null,
  isForecast: config.isForecastShown,
  dailyAlert: config.dailyAlert,
})

const notify = async ($: EngineInterface, snapshot: Snapshot, now: number): Promise<void> => {
  if (!config.isToastShown) {
    return
  }
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
  const daily = dailyOver(snapshot, now, config.dailyAlert)

  if (daily !== null) {
    // Once a day, and again the day after: the alert is part of the id, so a new limit is a new warning.
    events.push({
      id: `daily:${isoDay(now)}:${config.dailyAlert}`,
      message: `Today's spend is ${money(daily)}, over your daily alert of ${money(config.dailyAlert)}`,
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
  $.ui.status(config.isStatusShown ? statusText(shown, failure, now, statusOptions()) : undefined)

  if (failure === null && shown) {
    await track($, shown)
    await notify($, shown, now).catch(() => undefined)
    toasted = null
  } else if (failure && !TRANSIENT.includes(failure.kind) && toasted !== failure.kind) {
    toasted = failure.kind
    if (config.isToastShown) {
      $.ui.toast(
        failure.kind === 'not-configured'
          ? 'Not configured. Run /litellm for setup help.'
          : truncate(failure.message, 90),
        { timeoutMs: 8000 },
      )
    }
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
    const isSlow =
      mode === 'force' ||
      previous === null ||
      now - lastSlowAt >= (config.dailyAlert > 0 ? WATCHED_SLOW_MS : SLOW_MS)

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

const NOT_READ = 'Reading the key from the proxy… the answer shows up here and in the pane.'

type Current = { snapshot: Snapshot; failure: Failure | null; now: number }

/** What the plugin last read, with when it is now; or what to say instead when there is nothing to show. */
const current = async ($: EngineInterface): Promise<Current | string> => {
  const now = await $.clock.now()
  const { snapshot, failure } = latest

  return snapshot ? { snapshot, failure, now } : failure ? failureText(failure) : NOT_READ
}

const report = async ($: EngineInterface, view: (snapshot: Snapshot, now: number) => string): Promise<string> => {
  const got = await current($)

  return typeof got === 'string' ? got : `${view(got.snapshot, got.now)}${got.failure ? `\n(stale) ${got.failure.message}` : ''}`
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

const TAB_WHAT: Record<ViewName, string> = {
  overview: 'the summary',
  usage: 'the usage report',
  models: 'the model list',
  details: 'the key details',
}

const REPORTS = 'overview, usage, models, details, pace, compare, csv, json'

/**
 * A report the person can name, to copy it or hand it to Claude: how it is made, what to call it, and whether it is
 * nothing but a table of the usage history (with no history there is nothing to copy, not a sentence about it).
 */
type Named = { build: (snapshot: Snapshot, now: number) => string; what: string; needsUsage: boolean }

/** `name` as a report (none given: the tab that is showing); null for a name that is no report. */
const namedReport = (name: string, tab: ViewName, range: number): Named | null => {
  switch (name.toLowerCase()) {
    case '':
      return { build: textOf(tab, range), what: TAB_WHAT[tab], needsUsage: tab === 'usage' }
    case 'overview':
    case 'info':
    case 'summary':
      return { build: summaryOf, what: TAB_WHAT.overview, needsUsage: false }
    case 'usage':
      return { build: snapshot => usageReport(snapshot, range), what: TAB_WHAT.usage, needsUsage: true }
    case 'models':
      return { build: snapshot => modelsReport(snapshot, range), what: TAB_WHAT.models, needsUsage: false }
    case 'details':
      return {
        build: (snapshot, now) => detailsText(snapshot, now, config.refreshSeconds),
        what: TAB_WHAT.details,
        needsUsage: false,
      }
    case 'pace':
      return {
        build: (snapshot, now) => paceReport(snapshot, now, reportOptions()),
        what: 'the pace report',
        needsUsage: false,
      }
    case 'compare':
      return {
        build: snapshot => compareReport(snapshot, COMPARABLE.includes(range) ? range : 7),
        what: 'the comparison',
        needsUsage: true,
      }
    case 'csv':
      return { build: snapshot => usageCsv(snapshot, range), what: `${range} days as CSV`, needsUsage: true }
    case 'json':
      return {
        build: (snapshot, now) => jsonReport(snapshot, now, config.warnPercent, reportOptions()),
        what: 'the JSON',
        needsUsage: false,
      }
    default:
      return null
  }
}

/** The report a person named with `/litellm copy` or `/litellm share`, made from what was last read. */
const requested = async (
  $: EngineInterface,
  words: readonly string[],
  fallback: ViewName | null,
): Promise<{ named: Named; text: string; snapshot: Snapshot } | string> => {
  const name = words[0] ?? ''
  const range = rangeIn(words.slice(1), RANGES, await read($, rangeState))
  const named = namedReport(name, fallback ?? 'overview', range)

  if (named === null) {
    return `Unknown report "${truncate(name, 30)}". The reports are ${REPORTS}.`
  }
  await ensureFresh($)
  const got = await current($)

  if (typeof got === 'string') {
    return got
  }

  return named.needsUsage && got.snapshot.usage === null
    ? NO_HISTORY
    : { named, snapshot: got.snapshot, text: named.build(got.snapshot, got.now) }
}

/** The command that prints what `copy` could not put on the clipboard: the report's own, or the nearest to it. */
const printing = (name: string, tab: ViewName): string => {
  const word = name.toLowerCase() || tab

  switch (word) {
    case 'overview':
    case 'summary':
      return 'info'
    case 'details':
      return 'tab details'
    default:
      return word
  }
}

const copyCommand = async ($: EngineInterface, words: readonly string[]): Promise<{ text: string }> => {
  const tab = await read($, viewState)
  const found = await requested($, words, tab)

  if (typeof found === 'string') {
    return { text: found }
  }
  const result = await $.ui.copy({ text: found.text })
  const lines = plural(found.text.split('\n').length, 'line')

  return {
    text: result.isCopied
      ? `Copied ${found.named.what} (${lines}).`
      : `Could not copy ${found.named.what} (${result.reason}). Use /litellm ${printing(words[0] ?? '', tab)} to print it instead.`,
  }
}

/** Puts a report in front of Claude, out of the person's sight, so that what comes next can be asked about it. */
const shareCommand = async (
  $: EngineInterface,
  words: readonly string[],
): Promise<{ text: string; context?: readonly string[] }> => {
  const found = await requested($, words, null)

  if (typeof found === 'string') {
    return { text: found }
  }
  const { named, snapshot, text } = found

  return {
    text: `Shared ${named.what} with Claude. Ask it about your spend, budget or usage.`,
    context: [
      `The user ran /litellm share. Below is ${named.what} for their LiteLLM virtual key, read from ${snapshot.host} at ${clock(snapshot.fetchedAt)}. It never holds the key itself. Use it when they ask about their spend, budget or usage.\n\n${text}`,
    ],
  }
}

/** The days of the history that `/litellm day` can name, and what it answers to a name that is none. */
const dayCommand = async ($: EngineInterface, word: string): Promise<{ text: string }> => {
  await ensureFresh($)

  return {
    text: await report($, snapshot => {
      const days = snapshot.usage?.days.map(item => item.date) ?? []
      const date = parseDay(word, days)

      if (snapshot.usage === null) {
        return NO_HISTORY
      }

      return date === null
        ? `No day "${truncate(word, 20)}" in the history of ${days.length} days. Try today, yesterday, a date such as ${days[days.length - 1] ?? '2026-10-03'} or ${(days[days.length - 1] ?? '2026-10-03').slice(5)}, or a weekday such as mon.`
        : dayReport(snapshot, date)
    }),
  }
}

/** `/litellm check`: the verdict and the exit code a `claude -p` run ends with, so a script can act on it. */
const checkCommand = async (
  $: EngineInterface,
  word: string | undefined,
): Promise<{ text: string; exitCode: number }> => {
  const warn = word === undefined ? config.warnPercent : Number.parseInt(word, 10)

  if (!(warn >= 1 && warn <= 99)) {
    return { text: 'Usage: /litellm check [warn%], with the percentage from 1 to 99.', exitCode: 3 }
  }
  await ensureFresh($)
  const verdict = checkVerdict(latest.snapshot, latest.failure, await $.clock.now(), warn, reportOptions())

  return { text: verdict.text, exitCode: verdict.exitCode }
}

/** `/litellm json`: the reading as JSON and nothing else, even an error, for a script to parse. */
const jsonCommand = async ($: EngineInterface): Promise<{ text: string; exitCode?: number }> => {
  await ensureFresh($)
  const got = await current($)

  if (typeof got === 'string') {
    const { failure } = latest

    return {
      text: JSON.stringify(
        {
          schema: 1,
          error: failure
            ? { kind: failure.kind, message: failure.message, hint: failure.hint }
            : { kind: 'pending', message: got },
        },
        null,
        2,
      ),
      exitCode: 3,
    }
  }

  return {
    text: jsonReport(got.snapshot, got.now, config.warnPercent, {
      ...reportOptions(),
      stale: got.failure?.message ?? null,
    }),
  }
}

/** `/litellm csv`: the days as CSV and nothing else, to be redirected into a file. */
const csvCommand = async ($: EngineInterface, words: readonly string[]): Promise<{ text: string; exitCode?: number }> => {
  await ensureFresh($)
  const got = await current($)

  if (typeof got === 'string') {
    return { text: got, exitCode: 3 }
  }

  return got.snapshot.usage === null
    ? { text: NO_HISTORY, exitCode: 3 }
    : { text: usageCsv(got.snapshot, rangeIn(words, RANGES, 7)) }
}

/** `/litellm ping`: every endpoint the plugin reads, asked once, with its status and its time. */
const pingCommand = async ($: EngineInterface): Promise<{ text: string; exitCode?: number }> => {
  // A reading first, to know the user and the team to ask about; if it fails, the rest is asked all the same.
  await ensureFresh($)
  const now = await $.clock.now()
  const resolved = resolveCredentials(await sourcesOf($, config), now)

  if (!resolved.ok) {
    return { text: failureText(resolved.failure), exitCode: 3 }
  }
  const { credentials } = resolved
  const root =
    pinnedRoot !== null && credentials.roots.includes(pinnedRoot) ? pinnedRoot : (credentials.roots[0] ?? '')
  const probes = await probeEndpoints({
    credentials,
    root,
    http: (url, headers) => fetchWithin($, url, headers),
    snapshot: latest.snapshot,
    now,
  })

  const text = pingReport(credentials.host, withoutCredentials(root), probes)

  // The key info is what the plugin cannot do without; the rest is optional, and does not fail a script.
  return probes[0]?.ok === false ? { text, exitCode: 3 } : { text }
}

/** `/litellm models [text]`: the names the key can call, or just the ones that hold `text`. */
const modelsCommand = async ($: EngineInterface, words: readonly string[]): Promise<{ text: string }> => {
  await ensureFresh($)
  const needle = words.join(' ').toLowerCase()

  return {
    text: await report($, snapshot => {
      const names = snapshot.models ?? snapshot.key.models
      const shown = needle === '' ? names : names.filter(name => name.toLowerCase().includes(needle))

      if (names.length === 0) {
        return `Models: ${modelsText(snapshot)}`
      }

      return needle === ''
        ? `Models (${names.length}): ${names.join(', ')}`
        : shown.length === 0
          ? `No model of ${names.length} has "${truncate(needle, 30)}" in its name.`
          : `Models (${shown.length} of ${names.length} have "${truncate(needle, 30)}"): ${shown.join(', ')}`
    }),
  }
}

const loadPrefs = async ($: EngineInterface): Promise<void> => {
  const stored: unknown = await $.store.get('prefs').catch(() => undefined)

  if (!isObject(stored)) {
    return
  }
  const { range, sort, metric } = stored

  if (typeof range === 'number' && RANGES.includes(range)) {
    await update($, rangeState, () => range)
  }
  if (sort === 'spend' || sort === 'name') {
    await update($, sortState, () => sort)
  }
  const picked = METRICS.find(item => item === metric)

  if (picked !== undefined) {
    await update($, metricState, () => picked)
  }
}

/** What the person chose is kept for next time; a store that fails only loses that. */
const savePrefs = async ($: EngineInterface): Promise<void> => {
  await $.store
    .set('prefs', {
      range: await read($, rangeState),
      sort: await read($, sortState),
      metric: await read($, metricState),
    })
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
  const server = [
    snapshot?.proxy?.version ? `LiteLLM v${snapshot.proxy.version}` : null,
    snapshot?.proxy?.db ? `database ${snapshot.proxy.db.toLowerCase()}` : null,
    snapshot?.latencyMs ? `${Math.round(snapshot.latencyMs)} ms to read /key/info` : null,
  ].filter(Boolean)
  const lines = [
    `Refresh every ${config.refreshSeconds}s · status line ${on(config.isStatusShown)} (bar ${on(config.isStatusBar)}) · related ${on(config.isRelatedShown)} · usage ${on(config.isUsageShown)} · forecast ${on(config.isForecastShown)} · compact pane ${on(config.isCompact)}`,
    `Alerts   toasts ${on(config.isToastShown)} · warn at ${config.warnPercent}% · daily alert ${config.dailyAlert > 0 ? money(config.dailyAlert) : 'off'}`,
    `Pane     ${await read($, viewState)} tab · ${await read($, rangeState)} days · sorted by ${await read($, sortState)} · chart ${await read($, metricState)}`,
    diagnostics
      ? `Proxy    ${diagnostics.host} (tries ${tries.join(', ')}${using})`
      : 'Proxy    not resolved',
    ...(server.length > 0 ? [`Server   ${server.join(' · ')}`] : []),
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

/** A line for a number that was asked for and is no range of the command, once the report is shown anyway. */
const strayNote = (stray: string | null, shown: number, takes: string): string =>
  stray === null ? '' : `\n(${stray} is not a range ${takes}. This is ${shown} days.)`

const READS = 'the plugin reads: 7, 14 or 30'
const COMPARES = 'to compare: 7 or 14'

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
      description: 'Show your LiteLLM virtual key: budget, pace, limits, models and usage',
      argumentHint: '[tab|pace|usage|compare|day|models|check|json|copy|ping|debug|help]',
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
    const { word, rest } = splitArgs(e.args)
    const [argument = ''] = rest

    try {
      switch (word.toLowerCase()) {
        case '':
        case 'pane':
        case 'open':
          return { text: await showPane($, null) }
        case 'tab':
        case 'view': {
          const tab = viewNamed(argument)
          const guess = tab === null ? closest(argument, VIEWS) : null

          return {
            text:
              tab === null
                ? `Unknown tab "${truncate(argument, 30)}".${guess === null ? '' : ` Did you mean "${guess}"?`} The tabs are ${VIEWS.join(', ')}.`
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
        case 'status':
        case 'line':
          await ensureFresh($)

          return {
            text: await report($, (snapshot, now) => statusText(snapshot, null, now, statusOptions()) ?? 'no data'),
          }
        case 'pace':
        case 'forecast':
        case 'runway':
          await ensureFresh($)

          return { text: await report($, (snapshot, now) => paceReport(snapshot, now, reportOptions())) }
        case 'usage': {
          const days = rangeIn(rest, RANGES, 7)
          const stray = strayNumber(rest, RANGES)

          await ensureFresh($)

          return {
            text: await report($, snapshot => `${usageReport(snapshot, days)}${strayNote(stray, days, READS)}`),
          }
        }
        case 'compare':
        case 'movers': {
          const days = rangeIn(rest, RANGES, 7)
          const stray = strayNumber(rest, RANGES)

          if (!COMPARABLE.includes(days)) {
            return { text: `Comparing ${days} days takes ${days * 2} days of history, and the plugin reads 30. Use 7 or 14.` }
          }
          await ensureFresh($)

          return {
            text: await report($, snapshot => `${compareReport(snapshot, days)}${strayNote(stray, days, COMPARES)}`),
          }
        }
        case 'day':
          return await dayCommand($, argument)
        case 'models':
          return await modelsCommand($, rest)
        case 'check':
          return await checkCommand($, rest[0])
        case 'json':
          return await jsonCommand($)
        case 'csv':
          return await csvCommand($, rest)
        case 'copy':
          return await copyCommand($, rest)
        case 'share':
          return await shareCommand($, rest)
        case 'ping':
        case 'health':
          return await pingCommand($)
        case 'debug':
        case 'diag':
        case 'doctor':
          await ensureFresh($)

          return { text: await debugText($) }
        case 'help':
        case '-h':
        case '--help':
          return { text: HELP }
        default: {
          const guess = closest(word, WORDS)

          return { text: `Unknown option "${truncate(word, 30)}".${guess === null ? '' : ` Did you mean "${guess}"?`}\n${HELP}` }
        }
      }
    } catch (error) {
      return {
        text: `Unexpected error: ${truncate(redact(error instanceof Error ? error.message : String(error)), 160)}`,
        exitCode: 3,
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
    const metric = await read($, metricState)
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
      dailyAlert: config.dailyAlert,
      refreshSeconds: config.refreshSeconds,
      tab,
      range,
      sort,
      metric,
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
      onMetric: next => {
        void update($, metricState, () => next).then(() => savePrefs($))
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
