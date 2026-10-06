import type { ActivityDay, Budget, SessionSpend, Snapshot, Usage } from '../types'
import { isoDay } from './calendar'
import { ago, clock, count, money, plural, times } from './format'
import { runway } from './runway'
import type { Row, Tone } from './summary'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
// Fewest requests of the last week that make their average price worth building a count of what is left on.
const HEADROOM_MIN_REQUESTS = 10
// The smallest usual day, in dollars, that today can be compared with.
const USUAL_MIN = 0.01
// A day is a spike once it passes this many times the usual day, and by enough money for that to mean something.
const SPIKE_TIMES = 3
const SPIKE_MIN_EXTRA = 1
// A rate needs time to say anything: an hour of a session is a rate, five minutes of it is a burst.
const SESSION_RATE_MIN_MS = 30 * 60_000

/** What one request cost, with the third decimal that cents would round away. */
export const eachText = (spend: number, requests: number): string => {
  const each = spend / requests

  return each >= 1 || each < 0.001 ? money(each) : `$${each.toFixed(3)}`
}

export type Allowance = {
  /** What the budget can spend a day from now to its reset and still stay under the cap. */
  perDay: number
  /** Time left to the reset. */
  ms: number
}

/**
 * What a budget can spend from now to its reset to last that long. Null without a cap, a reset still to come, room left
 * under the cap, or at least an hour to spread it over: in the last minutes before a reset any figure is absurd.
 */
export const allowance = (budget: Budget, now: number): Allowance | null => {
  const { limit, spend, resetAt } = budget

  if (limit === null || !Number.isFinite(limit) || !Number.isFinite(spend) || !(limit > spend) || resetAt === null) {
    return null
  }
  const ms = resetAt - now

  return ms >= HOUR_MS ? { perDay: ((limit - spend) / ms) * DAY_MS, ms } : null
}

/** What a budget can spend a day to last until its reset, said per hour once less than a day is left. */
export const allowanceText = (room: Allowance, perDayNow: number | null = null): { text: string; tone: Tone } => {
  const per = (day: number): string => (room.ms < DAY_MS ? `${money(day / 24)}/h` : `${money(day)}/day`)
  const base = `${per(room.perDay)} to last until the reset`

  if (perDayNow === null || !(perDayNow > room.perDay)) {
    return { text: base, tone: 'ok' }
  }
  const cut = Math.min(99, Math.max(1, Math.round((1 - room.perDay / perDayNow) * 100)))

  return { text: `${base} · ${cut}% less than lately`, tone: 'warn' }
}

/** The key's allowance, set against the pace of the last days when the key is on course to run out before its reset. */
export const allowanceRow = (snapshot: Snapshot, now: number): { text: string; tone: Tone } | null => {
  const room = allowance(snapshot.key.budget, now)
  const found = runway(snapshot, now)

  return room && allowanceText(room, found?.kind === 'runs-out' ? found.perDay : null)
}

/**
 * How many more requests the cap holds at what a request cost over the last week. Said only with a cap, some room under
 * it and a week that had enough requests for their average price to mean something.
 */
export const headroomText = (snapshot: Snapshot): string | null => {
  const { budget, keyHash } = snapshot.key
  const { usage } = snapshot

  // Without the key's hash the usage covers every key of the user, and its price per request is not this key's.
  if (budget.limit === null || usage === null || keyHash === null || !(budget.limit > budget.spend)) {
    return null
  }
  if (usage.requests < HEADROOM_MIN_REQUESTS || !(usage.spend > 0)) {
    return null
  }
  const left = Math.floor(((budget.limit - budget.spend) * usage.requests) / usage.spend)

  return `about ${count(left)} more requests at ${eachText(usage.spend, usage.requests)} each (7-day average)`
}

/** The day still going: the last of the history, when it is the day `now` falls on (UTC, as the proxy counts). */
export const todayOf = (usage: Usage | null, now: number): ActivityDay | null => {
  const last = usage?.history[usage.history.length - 1]

  return last !== undefined && last.date === isoDay(now) ? last : null
}

/**
 * What the key spent per day lately: the last full days, up to a week, counted from the first one with any spend, so a
 * young key is not averaged with the days before it existed. Null when none of them spent anything.
 */
export const recentDaily = (usage: Usage | null): number | null => {
  const done = (usage?.history ?? []).slice(0, -1).slice(-7)
  const first = done.findIndex(day => day.spend > 0)

  if (first < 0) {
    return null
  }
  const used = done.slice(first)

  return used.reduce((total, day) => total + day.spend, 0) / used.length
}

/** Whether a day's spend is far above the usual one. A cent against a tenth of a cent is no spike. */
export const isSpike = (spend: number, usual: number): boolean =>
  usual > 0 && spend >= usual * SPIKE_TIMES && spend - usual >= SPIKE_MIN_EXTRA

/** What today has cost, against the usual day: a day well above it is marked. Null while today did nothing. */
export const todayRow = (snapshot: Snapshot, now: number): Row | null => {
  const today = todayOf(snapshot.usage, now)

  if (today === null || (today.spend <= 0 && today.requests <= 0)) {
    return null
  }
  const usual = recentDaily(snapshot.usage)
  const parts = [money(today.spend), plural(today.requests, 'request')]
  // A usual day of a cent or less is no measure: "9000× the usual day" would say nothing.
  const hasUsual = usual !== null && usual >= USUAL_MIN

  if (hasUsual && today.spend > 0) {
    parts.push(`${times(today.spend / usual)} the usual day (${money(usual)})`)
  }

  return { label: 'Today', text: parts.join(' · '), tone: hasUsual && isSpike(today.spend, usual) ? 'warn' : 'ok' }
}

/** Today's spend, when it has reached the daily alert the person set. Null with no alert set or a day under it. */
export const dailyOver = (snapshot: Snapshot, now: number, dailyAlert: number): number | null => {
  const today = todayOf(snapshot.usage, now)

  return dailyAlert > 0 && today !== null && today.spend >= dailyAlert ? today.spend : null
}

export const beginSession = (at: number, spend: number): SessionSpend => ({ since: at, spend: 0, last: spend })

/**
 * What a new reading adds. One far below the last (under half of it) means the budget reset, so all of it is new; a
 * small step back is the proxy's counters disagreeing for a moment, and adds nothing.
 */
const added = (last: number, spend: number): number => (spend >= last ? spend - last : spend < last / 2 ? spend : 0)

export const advanceSession = (session: SessionSpend, spend: number): SessionSpend => ({
  since: session.since,
  spend: session.spend + added(session.last, spend),
  last: spend,
})

/** What the session spent, and how fast, once it has run long enough to have a rate. */
export const sessionText = (session: SessionSpend, now: number): string => {
  const hours = (now - session.since) / HOUR_MS
  const rate = session.spend > 0 && now - session.since >= SESSION_RATE_MIN_MS ? ` · ${money(session.spend / hours)}/h` : ''
  const spent = session.spend > 0 ? `+${money(session.spend)}` : 'nothing spent'

  return `${spent} since ${clock(session.since).slice(0, 5)} (${ago(session.since, now)})${rate}`
}
