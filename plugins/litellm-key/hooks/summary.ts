import type { Budget, Failure, ModelBudget, Session, Snapshot, SortName } from '../types'
import type { Forecast } from './forecast'
import { allowance, forecast, parseDuration } from './forecast'
import {
  ago,
  clock,
  compact,
  count,
  isoDay,
  miniBar,
  money,
  percent,
  plural,
  share,
  shortDate,
  span,
  sparkline,
  times,
  truncate,
  until,
  weekday,
} from './format'
import { byName, isSpike, recentDaily, todayOf, usageOver, usageTrend } from './usage'
import type { UsageTotals } from './usage'

export type Tone = 'ok' | 'warn' | 'error'
export type Meter = {
  label: string
  used: number
  limit: number | null
  text: string
  /** The same reading cut to one short line: the amounts and the reset, no percentage, no "left" or "over", no period. */
  brief: string
  tone: Tone
  /** Where the spend is heading, for the budgets that have a reset to be measured against. */
  forecast: Forecast | null
}
export type Row = { label: string; text: string; tone: Tone }
export type Alert = { tone: 'warn' | 'error'; text: string }
export type Detail = { title: string; rows: Row[] }

export type StatusOptions = {
  /** Draw a small meter in front of the percentage. */
  bar?: boolean
  /** Say when the budget runs out if the pace holds, while that is before it resets. */
  forecast?: boolean
  /** Say so once today's spend reaches this much (the `daily_alert` option); zero or less leaves it out. */
  dailyAlert?: number
}

export type AlertOptions = {
  /** Warn once today's spend reaches this much (the `daily_alert` option); zero or less leaves it out. */
  dailyAlert?: number
}

export type ModelRow = {
  model: string
  spend: number
  requests: number
  tokens: number
  /** Share of the range's spend; null while nothing was spent in it. */
  share: number | null
  /** A cap for this model on the key, when it has one. */
  budget: ModelBudget | null
}

export type ModelList = {
  rows: ModelRow[]
  /** How many models there are before the filter is applied. */
  total: number
  /** The key may call every model the proxy serves, and the proxy did not list them. */
  isOpen: boolean
  /** Whether the usage history says anything about the models. */
  hasUsage: boolean
}

const DAY_MS = 86_400_000
const SOON_MS = 3 * DAY_MS
const STATUS_BAR_CELLS = 6
const RECENT_NOTE = 'at the recent daily average'
// Fewest requests of the last week that make their average price worth building a count of what is left on.
const HEADROOM_MIN_REQUESTS = 10
// The smallest usual day, in dollars, that today can be compared with.
const USUAL_MIN = 0.01
// A rate needs time to say anything: an hour of a session is a rate, five minutes of it is a burst.
const SESSION_RATE_MIN_MS = 30 * 60_000

const toneOf = (pct: number | null, warnPercent: number): Tone =>
  pct === null ? 'ok' : pct >= 100 ? 'error' : pct >= warnPercent ? 'warn' : 'ok'

const resetText = (budget: Budget, now: number, hasPeriod = true): string | null => {
  if (budget.resetAt === null) {
    return budget.duration ? `resets every ${budget.duration}` : null
  }
  if (budget.resetAt <= now) {
    return 'reset pending'
  }

  return `resets ${until(budget.resetAt, now)}${hasPeriod && budget.duration ? ` (${budget.duration})` : ''}`
}

export const budgetText = (budget: Budget, now: number): string => {
  const reset = resetText(budget, now)

  if (budget.limit === null) {
    return [`${money(budget.spend)} spent`, 'no budget cap', reset].filter(Boolean).join(' · ')
  }
  const left = budget.limit - budget.spend
  const pct = percent(budget.spend, budget.limit)

  return [
    `${money(budget.spend)} / ${money(budget.limit)} (${pct}%)`,
    left >= 0 ? `${money(left)} left` : `${money(-left)} over`,
    reset,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const budgetBrief = (budget: Budget, now: number): string =>
  [
    budget.limit === null ? `${money(budget.spend)} spent` : `${money(budget.spend)} / ${money(budget.limit)}`,
    resetText(budget, now, false),
  ]
    .filter(Boolean)
    .join(' · ')

const isOver = (budget: Budget): boolean => budget.limit !== null && budget.spend >= budget.limit

/**
 * Where the key's own budget is heading. What the key spent lately only stands in for the pace of the window when the
 * history is the key's (it has a hash), not every key of the user.
 */
export const keyPace = (snapshot: Snapshot, now: number): Forecast | null => {
  const { key, usage } = snapshot

  return forecast(key.budget, now, usage !== null && key.keyHash !== null ? recentDaily(usage) : null)
}

export const meters = (snapshot: Snapshot, now: number, warnPercent: number, isForecast = true): Meter[] => {
  const { key, team, user } = snapshot
  const ownPace = isForecast ? keyPace(snapshot, now) : null
  const list: Meter[] = [
    {
      label: 'Budget',
      used: key.budget.spend,
      limit: key.budget.limit,
      text: budgetText(key.budget, now),
      brief: budgetBrief(key.budget, now),
      tone: toneOf(percent(key.budget.spend, key.budget.limit), warnPercent),
      forecast: ownPace,
    },
  ]

  for (const window of key.windows) {
    const spend = window.spend ?? 0
    const reset = window.resetAt === null ? null : until(window.resetAt, now)
    const text = [
      `${window.spend === null ? '?' : money(spend)} / ${money(window.limit)}`,
      reset ? `resets ${reset}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    list.push({
      label: `Window ${window.duration}`,
      used: spend,
      limit: window.limit,
      text,
      brief: text,
      tone: toneOf(percent(spend, window.limit), warnPercent),
      forecast: null,
    })
  }
  for (const item of key.modelBudgets) {
    if (item.limit !== null) {
      const text = `${money(item.spend)} / ${money(item.limit)}${item.period ? ` per ${item.period}` : ''}`

      list.push({
        label: `Model ${item.model}`,
        used: item.spend,
        limit: item.limit,
        text,
        brief: text,
        tone: toneOf(percent(item.spend, item.limit), warnPercent),
        forecast: null,
      })
    }
  }
  for (const [label, related] of [
    ['Team', team],
    ['User', user],
  ] as const) {
    if (related) {
      const ahead = isForecast ? forecast(related.budget, now) : null

      list.push({
        label: `${label} ${related.label}`,
        used: related.budget.spend,
        limit: related.budget.limit,
        text: budgetText(related.budget, now),
        brief: budgetBrief(related.budget, now),
        tone: toneOf(percent(related.budget.spend, related.budget.limit), warnPercent),
        forecast: ahead,
      })
    }
  }

  return list
}

/**
 * How far into its period the key's budget is, as a meter to set beside the budget's own: a budget further along than
 * the time is on course to pass its cap. Null without a cap, or without a period and a reset to measure it by.
 */
export const timeMeter = (snapshot: Snapshot, now: number): Meter | null => {
  const { budget } = snapshot.key
  const length = parseDuration(budget.duration)

  if (budget.limit === null || length === null || budget.resetAt === null || budget.resetAt <= now) {
    return null
  }
  const elapsed = Math.min(length, Math.max(0, now - (budget.resetAt - length)))
  const days = Math.ceil(length / 86_400_000)
  const today = Math.min(days, Math.floor(elapsed / 86_400_000) + 1)
  // Whole days to count in for a period of days; a short one is told in the units it is made of.
  const where = length >= 2 * 86_400_000 ? `day ${today} of ${days}` : `${span(elapsed)} of ${span(length)}`
  const text = `${where} (${percent(elapsed, length)}%) · ${span(budget.resetAt - now)} left`

  return { label: 'Time', used: elapsed, limit: length, text, brief: text, tone: 'ok', forecast: null }
}

const limitsText = (snapshot: Snapshot): string | null => {
  const { limits } = snapshot.key
  const parts = [
    limits.rpm === null ? null : `${compact(limits.rpm)} rpm`,
    limits.tpm === null ? null : `${compact(limits.tpm)} tpm`,
    limits.tpd === null ? null : `${compact(limits.tpd)} tokens/day`,
    limits.parallel === null ? null : `${limits.parallel} parallel`,
  ].filter(Boolean)

  return parts.length === 0 ? null : parts.join(' · ')
}

export const modelsText = (snapshot: Snapshot, max = 4): string => {
  const names = snapshot.models ?? snapshot.key.models
  const isAll = snapshot.key.models.length === 0 || snapshot.key.models.includes('all-proxy-models')

  if (names.length === 0) {
    return isAll ? 'all proxy models' : 'none'
  }
  const shown = names.slice(0, max).join(', ')
  const more = names.length > max ? `, +${names.length - max}` : ''

  return `${shown}${more}`
}

const usageText = (snapshot: Snapshot): string | null => {
  const { usage } = snapshot

  if (!usage) {
    return null
  }
  const week = usageOver(usage, 7)

  return [
    sparkline(week.days.map(day => day.spend)),
    money(week.spend),
    plural(week.requests, 'request'),
    `${compact(week.tokens)} tokens`,
  ].join(' · ')
}

/** When the budget runs out at this pace, said for a line of its own; null when that is not worth a line. */
const runsOutText = (budget: Budget, pace: Forecast, now: number): string | null => {
  if (isOver(budget)) {
    return null
  }
  const wait = `in ${span(pace.emptyAt - now)}`

  if (pace.basis === 'window') {
    return pace.beforeReset && budget.resetAt !== null
      ? `${wait} · ${span(budget.resetAt - pace.emptyAt)} before the reset`
      : null
  }

  return pace.beforeReset || pace.emptyAt - now < 30 * 86_400_000 ? `${wait} ${RECENT_NOTE}` : null
}

/**
 * The models on one line: the names while there are few. With many, how many (those the proxy lists and those the
 * history saw), and the ones that spent most lately, which say more than the first few of an alphabetical list.
 */
const modelsFact = (snapshot: Snapshot): string => {
  const list = modelList(snapshot, 7, 'spend', '')

  if (list.total <= 4) {
    return `${modelsText(snapshot)}${snapshot.models ? ` (${snapshot.models.length})` : ''}`
  }
  const names = (rows: readonly ModelRow[]): string => rows.map(row => row.model).join(', ')
  const top = list.rows.filter(row => row.spend > 0).slice(0, 2)

  return top.length > 0
    ? `${list.total} · most used: ${names(top)}`
    : `${list.total} · ${names(list.rows.slice(0, 2))}, +${list.total - 2}`
}

/**
 * What a budget can spend a day from now to its reset and still last that long, set against the pace it keeps. Said per
 * hour once less than a day is left. Null when there is no room left, no reset to reach, or too little time to say.
 */
const allowanceText = (budget: Budget, pace: Forecast | null, now: number): { text: string; tone: Tone } | null => {
  const room = allowance(budget, now)

  if (room === null) {
    return null
  }
  const isHourly = room.ms < DAY_MS
  const per = (day: number): string => (isHourly ? `${money(day / 24)}/h` : `${money(day)}/day`)

  if (pace === null) {
    return { text: `${per(room.perDay)} to last until the reset`, tone: 'ok' }
  }
  const when = pace.basis === 'window' ? 'now' : 'lately'
  const base = `${per(room.perDay)} to last · ${when} ${per(pace.perDay)}`

  if (pace.beforeReset && pace.perDay > room.perDay) {
    const cut = Math.min(99, Math.max(1, Math.round((1 - room.perDay / pace.perDay) * 100)))

    return { text: `${base} (cut ${cut}%)`, tone: 'warn' }
  }

  return { text: base, tone: 'ok' }
}

/** The rows that say where a budget is heading: its pace, when it runs out, what it can spend a day to last. */
export const paceRows = (budget: Budget, pace: Forecast | null, now: number): Row[] => {
  const rows: Row[] = []

  if (pace !== null) {
    rows.push({
      label: 'Pace',
      text:
        pace.basis === 'window'
          ? `${money(pace.perDay)}/day · on pace for ${money(pace.projected)} (${pace.projectedPct}%) at the reset`
          : `${money(pace.perDay)}/day lately`,
      tone: (pace.projectedPct ?? 0) >= 100 ? 'warn' : 'ok',
    })
    const out = runsOutText(budget, pace, now)

    if (out !== null) {
      rows.push({ label: 'Runs out', text: out, tone: 'warn' })
    }
  }
  const room = allowanceText(budget, pace, now)

  if (room !== null) {
    rows.push({ label: 'Allowance', text: room.text, tone: room.tone })
  }

  return rows
}

/**
 * How many more requests the cap holds at what a request cost over the last week. Said only with a cap, some room under
 * it and a week that had enough requests for their average price to mean something.
 */
export const headroomText = (snapshot: Snapshot): string | null => {
  const { budget } = snapshot.key
  const { usage } = snapshot

  if (budget.limit === null || usage === null || !(budget.limit > budget.spend)) {
    return null
  }
  const week = usageOver(usage, 7)

  if (week.requests < HEADROOM_MIN_REQUESTS || !(week.spend > 0)) {
    return null
  }
  const left = Math.floor(((budget.limit - budget.spend) * week.requests) / week.spend)

  return `about ${count(left)} more requests at ${eachText(week.spend, week.requests)} each (7-day average)`
}

/** What today has cost, against the usual day: a day well above it is marked. Null while today did nothing. */
export const todayRow = (snapshot: Snapshot, now: number): Row | null => {
  const today = todayOf(snapshot.usage, now)

  if (today === null || (today.spend <= 0 && today.requests <= 0)) {
    return null
  }
  const usual = snapshot.usage ? recentDaily(snapshot.usage) : null
  const parts = [money(today.spend), plural(today.requests, 'request')]
  // A usual day of a cent or less is no measure: "9000× the usual day" would say nothing.
  const hasUsual = usual !== null && usual >= USUAL_MIN

  if (hasUsual && today.spend > 0) {
    parts.push(`${times(today.spend / usual)} the usual day (${money(usual)})`)
  }

  return {
    label: 'Today',
    text: parts.join(' · '),
    tone: hasUsual && isSpike(today.spend, usual) ? 'warn' : 'ok',
  }
}

export type Extras = {
  /** What was spent since Claude Code started, when the readings say. */
  session?: Session | null
  /** Leave the pace out (the `show_forecast` option). */
  isForecast?: boolean
}

/** What the session spent, and how fast, once it has run long enough to have a rate. */
const sessionText = (session: Session, now: number): string => {
  const hours = (now - session.since) / 3_600_000
  const rate = session.spend > 0 && now - session.since >= SESSION_RATE_MIN_MS ? ` · ${money(session.spend / hours)}/h` : ''

  return `${session.spend > 0 ? `+${money(session.spend)}` : 'nothing spent'} since ${clock(session.since).slice(0, 5)} (${ago(session.since, now)})${rate}`
}

export const facts = (snapshot: Snapshot, now: number, extras: Extras = {}): Row[] => {
  const { key } = snapshot
  const rows: Row[] = []
  const add = (label: string, text: string | null, tone: Tone = 'ok'): void => {
    if (text) {
      rows.push({ label, text, tone })
    }
  }
  const expires = key.expiresAt === null ? null : until(key.expiresAt, now)
  const isForecast = extras.isForecast !== false
  const pace = isForecast ? keyPace(snapshot, now) : null

  add('Status', key.status, key.status === 'active' ? 'ok' : 'error')
  if (isForecast) {
    rows.push(...paceRows(key.budget, pace, now))
    add('Headroom', headroomText(snapshot))
  }
  add('Soft limit', key.budget.softLimit === null ? null : `alerts at ${money(key.budget.softLimit)}`)
  add('Limits', limitsText(snapshot))
  add(
    key.expiresAt !== null && key.expiresAt < now ? 'Expired' : 'Expires',
    expires,
    key.expiresAt === null ? 'ok' : key.expiresAt < now ? 'error' : key.expiresAt - now < SOON_MS ? 'warn' : 'ok',
  )
  add('Models', modelsFact(snapshot))
  if (key.lifetimeSpend !== null && key.lifetimeSpend > key.budget.spend + 0.005) {
    add('Lifetime', `${money(key.lifetimeSpend)} across budget resets`)
  }
  const today = todayRow(snapshot, now)

  if (today !== null) {
    add(today.label, today.text, today.tone)
  }
  add('Last 7 days', usageText(snapshot))
  if (extras.session) {
    add('Session', sessionText(extras.session, now))
  }

  return rows
}

export const identity = (snapshot: Snapshot): string => {
  const { key } = snapshot
  const name = key.alias ?? key.keyName ?? snapshot.keyHint

  return key.alias ? `${name} · ${key.keyName ?? snapshot.keyHint}` : name
}

/**
 * Today's spend, when it has reached the daily alert the person set. Null with no alert set, no history for today, or a
 * day that stayed under it.
 */
export const dailyOver = (snapshot: Snapshot, now: number, dailyAlert: number | undefined): number | null => {
  const today = todayOf(snapshot.usage, now)

  return dailyAlert !== undefined && dailyAlert > 0 && today !== null && today.spend >= dailyAlert ? today.spend : null
}

/** What needs a look right now, the worst first: a key that is not active, caps near or past, a pace that will not last. */
export const alerts = (
  snapshot: Snapshot,
  now: number,
  warnPercent: number,
  isForecast = true,
  options: AlertOptions = {},
): Alert[] => {
  const { key } = snapshot
  const errors: Alert[] = []
  const warnings: Alert[] = []
  const add = (tone: Alert['tone'], text: string): void => {
    const bucket = tone === 'error' ? errors : warnings

    bucket.push({ tone, text })
  }

  if (key.status !== 'active') {
    add('error', `The key is ${key.status}`)
  } else if (key.expiresAt !== null && key.expiresAt - now < SOON_MS) {
    add(
      key.expiresAt <= now ? 'error' : 'warn',
      `The key ${key.expiresAt <= now ? 'expired' : 'expires'} ${until(key.expiresAt, now)}`,
    )
  }
  for (const meter of meters(snapshot, now, warnPercent, isForecast)) {
    const pct = percent(meter.used, meter.limit)
    const name = meter.label === 'Budget' ? 'Key budget' : meter.label
    const amounts = `${money(meter.used)} of ${money(meter.limit)}`

    if (pct !== null && meter.tone === 'error') {
      add('error', `${name} is over its cap: ${amounts}`)
    } else if (pct !== null && meter.tone === 'warn') {
      add('warn', `${name} is at ${pct}%: ${amounts}`)
    }
    const { forecast: pace } = meter

    if (pace !== null && pace.basis === 'window' && pace.beforeReset && meter.tone !== 'error') {
      const subject = meter.label === 'Budget' ? 'the key budget' : meter.label

      add('warn', `At this pace ${subject} runs out in ${span(pace.emptyAt - now)}, before it resets`)
    }
  }
  const over = dailyOver(snapshot, now, options.dailyAlert)

  if (over !== null && options.dailyAlert !== undefined) {
    add('warn', `Today's spend is ${money(over)}, over your daily alert of ${money(options.dailyAlert)}`)
  }

  return [...errors, ...warnings]
}

export const summaryText = (snapshot: Snapshot, now: number, warnPercent: number, extras: Extras = {}): string => {
  const rows = [
    ...meters(snapshot, now, warnPercent, extras.isForecast !== false),
    ...facts(snapshot, now, extras),
    { label: 'Updated', text: `${clock(snapshot.fetchedAt)} · via ${snapshot.keySource}` },
    ...snapshot.notes.map(note => ({ label: 'Note', text: note })),
  ]
  const width = Math.min(24, Math.max(...rows.map(row => row.label.length)))

  return [
    `${identity(snapshot)} · ${snapshot.host}`,
    ...rows.map(row => `${truncate(row.label, width).padEnd(width)}  ${row.text}`),
  ].join('\n')
}

export const failureText = (failure: Failure): string => `${failure.message}${failure.hint ? `\n${failure.hint}` : ''}`

const shortFailure = (failure: Failure): string => {
  switch (failure.kind) {
    case 'auth':
      return 'key rejected (401)'
    case 'forbidden':
      return 'no access to key info (403)'
    case 'not-found':
      return 'key not in proxy database'
    case 'not-litellm':
      return 'not a LiteLLM proxy'
    case 'db':
      return 'proxy has no database'
    case 'rate-limit':
      return 'rate limited (429)'
    case 'network':
      return 'proxy unreachable'
    default:
      return failure.status === null ? 'request failed' : `HTTP ${failure.status}`
  }
}

export const statusText = (
  snapshot: Snapshot | null,
  failure: Failure | null,
  now: number,
  options: StatusOptions = {},
): string | undefined => {
  if (failure?.kind === 'not-configured') {
    return undefined
  }
  if (!snapshot) {
    return failure ? shortFailure(failure) : undefined
  }
  const { key } = snapshot
  const pct = percent(key.budget.spend, key.budget.limit)
  const expiresSoon = key.expiresAt !== null && key.expiresAt > now && key.expiresAt - now < SOON_MS
  const parts: (string | null)[] = []

  if (key.status !== 'active') {
    parts.push(`key ${key.status}`)
  } else if (pct === null) {
    parts.push(`${money(key.budget.spend)} spent`, 'no cap')
  } else {
    const pace = options.forecast ? keyPace(snapshot, now) : null
    const runsOut =
      pace !== null && pace.basis === 'window' && pace.beforeReset && pct < 100
        ? `empty in ${span(pace.emptyAt - now)}`
        : null

    const meter =
      options.bar && key.budget.limit !== null
        ? `${miniBar(share(key.budget.spend, key.budget.limit), STATUS_BAR_CELLS)} `
        : ''

    parts.push(
      `${meter}${pct}% of budget`,
      `${money(key.budget.spend)} of ${money(key.budget.limit)}`,
      pct >= 100 ? 'over budget' : resetText(key.budget, now),
      runsOut,
    )
  }
  const daily = dailyOver(snapshot, now, options.dailyAlert)

  if (daily !== null && options.dailyAlert !== undefined) {
    parts.push(`today ${money(daily)} (alert ${money(options.dailyAlert)})`)
  }
  if (expiresSoon && key.expiresAt !== null) {
    parts.push(`expires ${until(key.expiresAt, now)}`)
  }
  if (failure) {
    parts.push(`stale: ${shortFailure(failure)}`)
  }

  return parts.filter(Boolean).join(' · ')
}

export const oneLine = (snapshot: Snapshot, now: number): string => statusText(snapshot, null, now) ?? 'no data'

/** The models of the key and the ones it used, with what each spent over the last `range` days. */
export const modelList = (snapshot: Snapshot, range: number, sort: SortName, filter: string): ModelList => {
  const listed = snapshot.models ?? snapshot.key.models.filter(name => name !== 'all-proxy-models')
  const isOpen = snapshot.key.models.length === 0 || snapshot.key.models.includes('all-proxy-models')
  const totals = snapshot.usage ? usageOver(snapshot.usage, range) : null
  const used = new Map((totals?.models ?? []).map(item => [item.model, item]))
  const caps = new Map(snapshot.key.modelBudgets.map(item => [item.model, item]))
  const names = [...new Set([...listed, ...used.keys()])]
  const spent = totals?.spend ?? 0
  const needle = filter.trim().toLowerCase()
  const rows = names
    .filter(name => needle === '' || name.toLowerCase().includes(needle))
    .map(name => {
      const own = used.get(name)

      return {
        model: name,
        spend: own?.spend ?? 0,
        requests: own?.requests ?? 0,
        tokens: own?.tokens ?? 0,
        share: spent > 0 && own ? own.spend / spent : spent > 0 ? 0 : null,
        budget: caps.get(name) ?? null,
      }
    })
    .sort((a, b) => (sort === 'name' ? byName(a.model, b.model) : b.spend - a.spend || byName(a.model, b.model)))

  return { rows, total: names.length, isOpen, hasUsage: totals !== null }
}

const trendText = (snapshot: Snapshot, range: number): string | null => {
  const trend = snapshot.usage ? usageTrend(snapshot.usage, range) : null

  if (trend === null) {
    return null
  }
  const { pct, direction } = trend.change

  return direction === 'flat'
    ? `unchanged vs the ${range} days before (full days)`
    : `${direction === 'up' ? '▲' : '▼'} ${pct}% vs the ${range} days before (full days)`
}

/** What one request cost, with the third decimal that cents would round away. */
export const eachText = (spend: number, requests: number): string => {
  const each = spend / requests

  return each >= 1 || each < 0.001 ? money(each) : `$${each.toFixed(3)}`
}

/** The token split of a range in one line: what went in, what came out, how much of the input came from the cache. */
export const tokensText = (totals: UsageTotals): string => {
  const cached =
    totals.inputTokens > 0 && totals.cacheReadTokens <= totals.inputTokens
      ? ` (${Math.round((totals.cacheReadTokens / totals.inputTokens) * 100)}% of input)`
      : ''

  return `in ${compact(totals.inputTokens)} · out ${compact(totals.outputTokens)} · cache read ${compact(totals.cacheReadTokens)}${cached}`
}

/** The totals of a range as labeled lines: what the Usage tab shows beside its chart, and the report prints. */
export const usageFacts = (snapshot: Snapshot, range: number): Row[] => {
  const { usage } = snapshot

  if (!usage) {
    return []
  }
  const totals = usageOver(usage, range)
  const rows: Row[] = []
  const add = (label: string, text: string | null, tone: Tone = 'ok'): void => {
    if (text) {
      rows.push({ label, text, tone })
    }
  }
  const trend = trendText(snapshot, range)

  add('Spend', `${money(totals.spend)} · ${money(totals.average)}/day`)
  add(
    'Requests',
    `${count(totals.requests)}${totals.requests > 0 ? ` · ${eachText(totals.spend, totals.requests)} each` : ''}`,
  )
  add(
    'Failed',
    totals.failed > 0
      ? `${plural(totals.failed, 'request')} (${((totals.failed / Math.max(1, totals.requests)) * 100).toFixed(1)}%)`
      : null,
    'warn',
  )
  add('Tokens', totals.tokens > 0 ? `${compact(totals.tokens)} · ${tokensText(totals)}` : null)
  add(
    'Peak day',
    totals.peak ? `${money(totals.peak.spend)} on ${weekday(totals.peak.date)} ${shortDate(totals.peak.date)}` : null,
  )
  add('Active days', `${totals.activeDays} of ${totals.days.length}`)
  add('Trend', trend, trend?.startsWith('▲') ? 'warn' : 'ok')

  return rows
}

export type DayDetail = {
  /** "Sat Oct 3", with "(today)" for the day that is still going. */
  title: string
  /** What the day came to, in one line; "no activity" for a day that did nothing. */
  summary: string
  /** The models of the day, the one that spent most first, with their share of it. */
  models: { model: string; spend: number; share: number }[]
}

/** What a single day of the history did, for the line under the chart. Null for a day the history does not have. */
export const dayDetail = (snapshot: Snapshot, date: string): DayDetail | null => {
  const days = snapshot.usage?.days ?? []
  const day = days.find(item => item.date === date)

  if (!day) {
    return null
  }
  const isToday = days[days.length - 1]?.date === date
  const title = `${weekday(date)} ${shortDate(date)}${isToday ? ' (today)' : ''}`

  return {
    title,
    summary:
      day.spend > 0 || day.requests > 0
        ? `${money(day.spend)} · ${plural(day.requests, 'request')} · ${compact(day.tokens)} tokens`
        : 'no activity',
    models: [...day.models]
      .sort((a, b) => b.spend - a.spend)
      .map(item => ({ model: item.model, spend: item.spend, share: day.spend > 0 ? item.spend / day.spend : 0 })),
  }
}

export const NO_HISTORY = 'No usage history: the proxy did not answer /user/daily/activity, or the key has no user.'

/** The usage report as text: one line per day and the totals, aligned in columns. */
export const usageReport = (snapshot: Snapshot, range: number): string => {
  const { usage } = snapshot

  if (!usage) {
    return NO_HISTORY
  }
  const totals = usageOver(usage, range)
  const lines = [
    `Usage · last ${range} days · ${snapshot.host}`,
    `${'Date'.padEnd(8)}${'Day'.padEnd(5)}${'Spend'.padStart(10)}${'Requests'.padStart(10)}${'Tokens'.padStart(9)}`,
    ...totals.days.map(
      day =>
        `${shortDate(day.date).padEnd(8)}${weekday(day.date).padEnd(5)}${money(day.spend).padStart(10)}${String(day.requests).padStart(10)}${compact(day.tokens).padStart(9)}`,
    ),
    `${'Total'.padEnd(13)}${money(totals.spend).padStart(10)}${String(totals.requests).padStart(10)}${compact(totals.tokens).padStart(9)}`,
    '',
    ...usageFacts(snapshot, range)
      .filter(row => row.label !== 'Spend' && row.label !== 'Requests')
      .map(row => `${row.label.padEnd(12)}${row.text}`),
  ]

  if (totals.models.length > 0) {
    lines.push('', 'By model')
    for (const item of totals.models) {
      lines.push(
        `${truncate(item.model, 30).padEnd(31)}${money(item.spend).padStart(10)}${`${totals.spend > 0 ? Math.round((item.spend / totals.spend) * 100) : 0}%`.padStart(6)}  ${plural(item.requests, 'request')}`,
      )
    }
  }

  return lines.join('\n')
}

/** The days of a range as CSV, for a spreadsheet. */
export const usageCsv = (snapshot: Snapshot, range: number): string => {
  const { usage } = snapshot
  const days = usage ? usageOver(usage, range).days : []

  return [
    'date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens',
    ...days.map(day =>
      [
        day.date,
        day.spend.toFixed(6),
        day.requests,
        day.failed,
        day.tokens,
        day.inputTokens,
        day.outputTokens,
        day.cacheReadTokens,
      ].join(','),
    ),
  ].join('\n')
}

/** The model list as text, with what each spent over the range. */
export const modelsReport = (snapshot: Snapshot, range: number): string => {
  const list = modelList(snapshot, range, 'spend', '')

  if (list.rows.length === 0) {
    return `Models: ${modelsText(snapshot)}`
  }
  const width = Math.min(34, Math.max(...list.rows.map(row => row.model.length)))

  return [
    `Models (${list.rows.length}) · spend over the last ${range} days`,
    ...list.rows.map(row => {
      const cap =
        row.budget !== null && row.budget.limit !== null
          ? ` · cap ${money(row.budget.limit)}${row.budget.period ? ` per ${row.budget.period}` : ''}`
          : ''
      const used =
        row.spend > 0 || row.requests > 0
          ? `${money(row.spend).padStart(10)}  ${plural(row.requests, 'request')}`
          : `${'—'.padStart(10)}`

      return `${truncate(row.model, width).padEnd(width)}  ${used}${cap}`
    }),
  ].join('\n')
}

const dayAndAge = (at: number | null, now: number): string | null =>
  at === null ? null : `${shortDate(isoDay(at))} · ${until(at, now)}`

/** Everything the proxy told about the key and how it was read, in groups: what the Details tab lists. */
export const details = (snapshot: Snapshot, now: number, refreshSeconds: number): Detail[] => {
  const { key } = snapshot
  const groups: Detail[] = []
  const group = (
    title: string,
    build: (add: (label: string, text: string | null, tone?: Tone) => void) => void,
  ): void => {
    const rows: Row[] = []

    build((label, text, tone = 'ok') => {
      if (text) {
        rows.push({ label, text, tone })
      }
    })
    if (rows.length > 0) {
      groups.push({ title, rows })
    }
  }
  const cap = key.budget.limit
  const allowed = snapshot.models ?? key.models

  group('Key', add => {
    add('Alias', key.alias)
    add('Name', key.keyName ?? snapshot.keyHint)
    add('Hash', key.keyHash === null ? null : `${key.keyHash.slice(0, 8)}…${key.keyHash.slice(-4)} (sha256)`)
    add('Status', key.status, key.status === 'active' ? 'ok' : 'error')
    add('Type', key.keyType)
    add('User', key.userId)
    add('Team', key.teamId)
    add('Created', dayAndAge(key.createdAt, now))
    add('Last active', key.lastActiveAt === null ? null : ago(key.lastActiveAt, now))
    add(
      'Expires',
      key.expiresAt === null ? 'never' : dayAndAge(key.expiresAt, now),
      key.expiresAt !== null && key.expiresAt - now < SOON_MS ? 'warn' : 'ok',
    )
  })
  group('Budget', add => {
    add('Spent', money(key.budget.spend))
    add('Cap', cap === null ? 'no cap' : money(cap))
    add('Soft limit', key.budget.softLimit === null ? null : money(key.budget.softLimit))
    add('Period', key.budget.duration)
    add('Resets', key.budget.resetAt === null ? null : dayAndAge(key.budget.resetAt, now))
    add('Lifetime', key.lifetimeSpend === null ? null : money(key.lifetimeSpend))
  })
  group('Limits', add => {
    add('Requests/min', key.limits.rpm === null ? null : compact(key.limits.rpm))
    add('Tokens/min', key.limits.tpm === null ? null : compact(key.limits.tpm))
    add('Tokens/day', key.limits.tpd === null ? null : compact(key.limits.tpd))
    add('Parallel', key.limits.parallel === null ? null : String(key.limits.parallel))
  })
  group('Connection', add => {
    add('Proxy', snapshot.root)
    add(
      'LiteLLM',
      [
        snapshot.proxy?.version ? `v${snapshot.proxy.version}` : null,
        snapshot.proxy?.db ? `database ${snapshot.proxy.db.toLowerCase()}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
      snapshot.proxy?.db && /\bnot\b|\bdown\b|error/i.test(snapshot.proxy.db) ? 'warn' : 'ok',
    )
    add('Latency', snapshot.latencyMs === null ? null : `${Math.round(snapshot.latencyMs)} ms to read /key/info`)
    add('Auth', `via ${snapshot.keySource} (${snapshot.keyHint})`)
    add('Read', `${clock(snapshot.fetchedAt)} (${ago(snapshot.fetchedAt, now)}) · every ${refreshSeconds}s`)
    add('Models', allowed.length === 0 ? 'all proxy models' : plural(allowed.length, 'model'))
    add(
      'Related',
      [snapshot.user ? 'user budget' : null, snapshot.team ? 'team budget' : null].filter(Boolean).join(' · ') || null,
    )
  })

  return groups
}

export const detailsText = (snapshot: Snapshot, now: number, refreshSeconds: number): string => {
  const groups = details(snapshot, now, refreshSeconds)
  const width = Math.max(0, ...groups.flatMap(group => group.rows.map(row => row.label.length)))

  return [
    `${identity(snapshot)} · ${snapshot.host}`,
    ...groups.flatMap(group => [
      '',
      group.title,
      ...group.rows.map(row => `  ${row.label.padEnd(width)}  ${row.text}`),
    ]),
    ...(snapshot.notes.length > 0 ? ['', 'Notes', ...snapshot.notes.map(note => `  ${note}`)] : []),
  ].join('\n')
}
