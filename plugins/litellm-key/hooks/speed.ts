import { sparkline } from './format'

/**
 * How fast the model answered: output tokens over the time of the turn, the last turn and the session so far.
 * `lag` is the wait for the first piece of each recent step (is the model answering, and how soon), and
 * `waitingSince` is set while a step is out and nothing has come back yet.
 */
export type Speed = {
  last: number | null
  tokens: number
  ms: number
  turns: number
  at: number | null
  lag: readonly number[]
  waitingSince: number | null
}

/** What one model step has streamed so far: when its first and last pieces came, and how much text they held. */
export type Meter = { firstAt: number | null; lastAt: number; firstChars: number; chars: number; shownAt: number }

export const newMeter = (): Meter => ({ firstAt: null, lastAt: 0, firstChars: 0, chars: 0, shownAt: 0 })

/** The stream carries text, not tokens: until the step ends with its real count, four characters make a token. */
export const CHARS_PER_TOKEN = 4
/** A rate over less than this is noise; a shown rate is not redrawn more often than this. */
export const MIN_SPAN_MS = 300
export const REFRESH_MS = 400

export const NO_SPEED: Speed = { last: null, tokens: 0, ms: 0, turns: 0, at: null, lag: [], waitingSince: null }

/** How many steps the latency chart remembers, and after how long a silent step is called out. */
export const LAG_HISTORY = 12
export const SILENT_MS = 30_000

/** A speed this old is no longer how the model is answering: the status line drops it rather than show a stale number. */
export const STALE_MS = 2 * 60_000

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Takes what a finished turn says (`usage.output_tokens` and `durationMs`). A turn that was aborted, or that says no
 * tokens or no time, is not counted: nothing is shown rather than a made-up speed. The time is the whole turn (it also
 * holds the wait for the first token and the tools), so the speed reads a little low.
 */
export const withTurn = (speed: Speed, turn: { usage?: unknown; durationMs?: unknown; isAborted?: unknown }, now: number): Speed => {
  const usage = typeof turn.usage === 'object' && turn.usage !== null ? (turn.usage as { output_tokens?: unknown }) : {}
  const tokens = usage.output_tokens

  if (turn.isAborted === true || !positive(tokens) || !positive(turn.durationMs)) {
    return speed
  }

  return { ...speed, last: tokens / (turn.durationMs / 1000), tokens: speed.tokens + tokens, ms: speed.ms + turn.durationMs, turns: speed.turns + 1, at: now }
}

const rate = (value: number): string => (value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, ''))

/** The average of the session: tokens over the time of all the turns that counted. */
export const averageOf = (speed: Speed): number | null => (speed.ms > 0 ? speed.tokens / (speed.ms / 1000) : null)

const lagLabel = (ms: number): string => (ms >= 10_000 ? `${Math.round(ms / 1000)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`)

/** The wait of the last step and a chart of the recent ones: `⏱ 820 ms ▂▅▃`. */
export const lagText = (lag: readonly number[]): string | undefined => {
  const last = lag.at(-1)

  return last === undefined ? undefined : `⏱ ${lagLabel(last)}${lag.length > 1 ? ` ${sparkline(lag)}` : ''}`
}

/**
 * `⚡ 42 tok/s ⏱ 820 ms ▂▅▃`, for the status line: how fast the model answers, and how soon it began. While a step is
 * waiting for its first piece it says so (`⏳ 3s`, and `⚠ no reply 45s` once it is long). Nothing before the first
 * step that counted, nor once it has gone stale.
 */
export const speedText = (speed: Speed, now: number): string | undefined => {
  const isFresh = speed.at === null || now - speed.at <= STALE_MS
  const parts: string[] = []

  if (speed.last !== null && isFresh) {
    parts.push(`⚡ ${rate(speed.last)} tok/s`)
  }
  if (speed.waitingSince !== null) {
    const waited = Math.max(0, now - speed.waitingSince)
    const seconds = Math.floor(waited / 1000)

    parts.push(waited >= SILENT_MS ? `⚠ no reply ${seconds}s` : `⏳ ${seconds}s`)
  } else if (isFresh) {
    const lag = lagText(speed.lag)

    if (lag !== undefined) {
      parts.push(lag)
    }
  }

  return parts.length === 0 ? undefined : parts.join(' ')
}

/** For `/litellm debug`: the last turn, the average and how many turns it rests on. */
export const speedLine = (speed: Speed): string => {
  const average = averageOf(speed)
  const lag = speed.lag.length === 0 ? '' : ` · first piece ${lagLabel(Math.round(speed.lag.reduce((sum, ms) => sum + ms, 0) / speed.lag.length))} on average of ${speed.lag.length} step${speed.lag.length === 1 ? '' : 's'}`

  return speed.last === null || average === null
    ? 'none yet (needs a finished turn that reports its output tokens)'
    : `${rate(speed.last)} tok/s last turn · ${rate(average)} tok/s average of ${speed.turns} turn${speed.turns === 1 ? '' : 's'}${lag}`
}

/** A step got its first piece after `ms`: the chart remembers it. */
export const withLag = (speed: Speed, ms: number, now: number): Speed => ({ ...speed, lag: [...speed.lag, ms].slice(-LAG_HISTORY), waitingSince: null, at: now })

/**
 * Takes one piece of the stream. The time before the first piece (the model thinking of its answer) is not generation,
 * so the rate counts from the first piece on. `rate` is set when it is worth drawing now, null otherwise.
 */
export const feed = (meter: Meter, now: number, chars: number): { meter: Meter; rate: number | null } => {
  if (meter.firstAt === null) {
    return { meter: { ...meter, firstAt: now, lastAt: now, firstChars: chars, chars }, rate: null }
  }
  const next = { ...meter, lastAt: now, chars: meter.chars + chars }
  const span = now - meter.firstAt

  if (span < MIN_SPAN_MS || now - meter.shownAt < REFRESH_MS) {
    return { meter: next, rate: null }
  }

  return { meter: { ...next, shownAt: now }, rate: (next.chars - next.firstChars) / CHARS_PER_TOKEN / (span / 1000) }
}

/** The step has ended: its tokens (the real count when the stop reports one) over the time it streamed, or null when too short to say. */
export const settle = (meter: Meter, outputTokens: unknown): { tokens: number; ms: number } | null => {
  const ms = meter.firstAt === null ? 0 : meter.lastAt - meter.firstAt
  const estimated = (meter.chars - meter.firstChars) / CHARS_PER_TOKEN
  // The first piece came before the clock started: leave its tokens out of the count too.
  const tokens = positive(outputTokens) ? Math.max(0, outputTokens - meter.firstChars / CHARS_PER_TOKEN) : estimated

  return ms < MIN_SPAN_MS || tokens <= 0 ? null : { tokens, ms }
}

/** A finished step joins the session: the last rate and the average. */
export const withStep = (speed: Speed, step: { tokens: number; ms: number }, now: number): Speed => ({
  ...speed,
  last: step.tokens / (step.ms / 1000),
  tokens: speed.tokens + step.tokens,
  ms: speed.ms + step.ms,
  turns: speed.turns + 1,
  at: now,
})
