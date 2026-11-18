import type { Ports } from './ports'
import type { ContextUse } from './context'
import { contextOf } from './context'
import type { Speed } from './speed'
import { withLag, withStep, withTurn } from './speed'

/** What the status line meters, kept in the session's state: the speed of the answers and the size of the context. */
export type Metered = { speed: Speed; context: ContextUse | null }

/** The meters of the status line: each one changes the state and asks for a redraw. */
export const metersOf = (state: Metered, redraw: (ports: Ports) => Promise<void>) => {
  let sawStep = false

  /** The rate of a step that is still streaming: it shows at once, and the step's end replaces it with the settled one. */
  const showSpeed = async (ports: Ports, rate: number): Promise<void> => {
    state.speed = { ...state.speed, last: rate, at: await ports.now() }
    await redraw(ports)
  }

  /** A step is out: until its first piece comes the status line counts the wait. */
  const beginStep = async (ports: Ports): Promise<void> => {
    state.speed = { ...state.speed, waitingSince: await ports.now() }
    await redraw(ports)
  }

  /** The wait is over, after `ms` (the first piece), or with none when the step ended or failed without one. */
  const endWait = async (ports: Ports, ms?: number): Promise<void> => {
    if (state.speed.waitingSince === null) {
      return
    }
    state.speed = ms === undefined ? { ...state.speed, waitingSince: null } : withLag(state.speed, ms, await ports.now())
    await redraw(ports)
  }

  /** The clock of a wait that is still going: nothing else redraws the status line while the model is silent. */
  const tickWait = async (ports: Ports): Promise<void> => {
    if (state.speed.waitingSince !== null) {
      await redraw(ports)
    }
  }

  /** A step that streamed long enough to say: its tokens and time join the average. */
  const endStep = async (ports: Ports, step: { tokens: number; ms: number }): Promise<void> => {
    state.speed = withStep(state.speed, step, await ports.now())
    sawStep = true
    await redraw(ports)
  }

  /** A step's usage says how full the window is; a step that reports none leaves the last reading. */
  const noteContext = async (ports: Ports, usage: unknown): Promise<void> => {
    const use = contextOf(usage)

    if (use !== null) {
      state.context = use
      await redraw(ports)
    }
  }

  /** A finished turn: when no step reported its speed (a stream too short to time), its own tokens and time stand in. */
  const recordTurn = async (ports: Ports, turn: Parameters<typeof withTurn>[1]): Promise<void> => {
    if (sawStep) {
      sawStep = false

      return
    }
    const next = withTurn(state.speed, turn, await ports.now())

    if (next !== state.speed) {
      state.speed = next
      await redraw(ports)
    }
  }

  return { showSpeed, beginStep, endWait, tickWait, endStep, noteContext, recordTurn }
}
