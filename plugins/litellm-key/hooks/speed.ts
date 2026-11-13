/** How fast the model answered: output tokens over the time of the turn, the last turn and the session so far. */
export type Speed = { last: number | null; tokens: number; ms: number; turns: number }

/** What one model step has streamed so far: when its first and last pieces came, and how much text they held. */
export type Meter = { firstAt: number | null; lastAt: number; firstChars: number; chars: number; shownAt: number }

export const newMeter = (): Meter => ({ firstAt: null, lastAt: 0, firstChars: 0, chars: 0, shownAt: 0 })

/** The stream carries text, not tokens: until the step ends with its real count, four characters make a token. */
export const CHARS_PER_TOKEN = 4
/** A rate over less than this is noise; a shown rate is not redrawn more often than this. */
export const MIN_SPAN_MS = 300
export const REFRESH_MS = 400

export const NO_SPEED: Speed = { last: null, tokens: 0, ms: 0, turns: 0 }

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Takes what a finished turn says (`usage.output_tokens` and `durationMs`). A turn that was aborted, or that says no
 * tokens or no time, is not counted: nothing is shown rather than a made-up speed. The time is the whole turn (it also
 * holds the wait for the first token and the tools), so the speed reads a little low.
 */
export const withTurn = (speed: Speed, turn: { usage?: unknown; durationMs?: unknown; isAborted?: unknown }): Speed => {
  const usage = typeof turn.usage === 'object' && turn.usage !== null ? (turn.usage as { output_tokens?: unknown }) : {}
  const tokens = usage.output_tokens

  if (turn.isAborted === true || !positive(tokens) || !positive(turn.durationMs)) {
    return speed
  }

  return { last: tokens / (turn.durationMs / 1000), tokens: speed.tokens + tokens, ms: speed.ms + turn.durationMs, turns: speed.turns + 1 }
}

const rate = (value: number): string => (value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, ''))

/** The average of the session: tokens over the time of all the turns that counted. */
export const averageOf = (speed: Speed): number | null => (speed.ms > 0 ? speed.tokens / (speed.ms / 1000) : null)

/** `⚡ 42 tok/s`, for the status line; nothing before the first turn that counted. */
export const speedText = (speed: Speed): string | undefined => (speed.last === null ? undefined : `⚡ ${rate(speed.last)} tok/s`)

/** For `/litellm debug`: the last turn, the average and how many turns it rests on. */
export const speedLine = (speed: Speed): string => {
  const average = averageOf(speed)

  return speed.last === null || average === null
    ? 'none yet (needs a finished turn that reports its output tokens)'
    : `${rate(speed.last)} tok/s last turn · ${rate(average)} tok/s average of ${speed.turns} turn${speed.turns === 1 ? '' : 's'}`
}

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
export const withStep = (speed: Speed, step: { tokens: number; ms: number }): Speed => ({
  last: step.tokens / (step.ms / 1000),
  tokens: speed.tokens + step.tokens,
  ms: speed.ms + step.ms,
  turns: speed.turns + 1,
})
