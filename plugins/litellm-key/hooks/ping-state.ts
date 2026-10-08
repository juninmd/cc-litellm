import type { PingState } from '../types'
import type { Round } from './probe'

const HISTORY = 20

/** The state of a tab that has not run yet, or has nothing left from the round before. */
const EMPTY: PingState = { host: '', root: '', at: 0, probes: [], history: [], failure: null, isRunning: false }

/** The tab while a round is out: what it showed stays, so the table does not blink away. */
export const pinging = (before: PingState | null): PingState => ({ ...(before ?? EMPTY), isRunning: true })

/** The tab once the round is over: the new table and its time beside the rounds before, or why it could not run. */
export const pinged = (before: PingState | null, round: Round | null): PingState => {
  const last = before ?? EMPTY

  if (round === null) {
    return { ...last, isRunning: false }
  }
  if ('failure' in round) {
    return { ...last, failure: round.failure, isRunning: false }
  }
  const ms = round.probes[0]?.ms ?? null

  return {
    host: round.host,
    root: round.root,
    at: round.at,
    probes: round.probes,
    history: ms === null ? last.history : [...last.history, ms].slice(-HISTORY),
    failure: null,
    isRunning: false,
  }
}
