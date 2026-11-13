/** How fast the model answered: output tokens over the time of the turn, the last turn and the session so far. */
export type Speed = { last: number | null; tokens: number; ms: number; turns: number }

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
