import { describe, expect, test } from 'claude-code/testing'
import { NO_SPEED, STALE_MS, speedLine, speedText, withTurn } from '../hooks/speed'
import { configOf } from '../hooks/settings'
import { liveSpeed } from '../hooks/live-speed'
import type { Ports } from '../hooks/ports'
import { createSession } from '../hooks/session'
import { boot, run, start } from './boot'
import { BASE, KEY, NOW, snapshotOf } from './support'

const usage = (output: number) => ({ input_tokens: 100, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
const turn = (tokens: number, ms: number) => ({ usage: usage(tokens), durationMs: ms, isAborted: false })

describe('speed of the answers', () => {
  test('is the output tokens over the time of the turn', () => {
    const speed = withTurn(NO_SPEED, turn(420, 10_000), NOW)

    expect(speed.last).toBe(42)
    expect(speedText(speed, NOW)).toBe('⚡ 42 tok/s')
  })

  test('keeps the average of the session beside the last turn', () => {
    const speed = withTurn(withTurn(NO_SPEED, turn(100, 10_000), NOW), turn(300, 10_000), NOW)

    expect(speed.last).toBe(30)
    expect(speedLine(speed)).toBe('30 tok/s last turn · 20 tok/s average of 2 turns')
  })

  test('counts nothing it cannot trust, and shows nothing before a turn counts', () => {
    const aborted = withTurn(NO_SPEED, { ...turn(100, 1000), isAborted: true }, NOW)

    expect(aborted).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, { durationMs: 1000 }, NOW)).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, turn(0, 1000), NOW)).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, turn(100, 0), NOW)).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, { usage: 'x', durationMs: 5 }, NOW)).toBe(NO_SPEED)
    expect(speedText(NO_SPEED, NOW)).toBeUndefined()
    expect(speedLine(NO_SPEED)).toContain('none yet')
  })

  test('rounds big and small rates', () => {
    expect(speedText(withTurn(NO_SPEED, turn(1234, 10_000), NOW), NOW)).toBe('⚡ 123 tok/s')
    expect(speedText(withTurn(NO_SPEED, turn(25, 10_000), NOW), NOW)).toBe('⚡ 2.5 tok/s')
  })

  test('drops a speed that has gone stale', () => {
    const speed = withTurn(NO_SPEED, turn(420, 10_000), NOW)

    expect(speedText(speed, NOW + STALE_MS)).toBe('⚡ 42 tok/s')
    expect(speedText(speed, NOW + STALE_MS + 1)).toBeUndefined()
  })

  test('show_speed is on unless turned off', () => {
    expect(configOf({}).isSpeedShown).toBe(true)
    expect(configOf({ show_speed: false }).isSpeedShown).toBe(false)
  })
})

describe('speed in the plugin', () => {
  test('a finished turn puts its speed in front of the status line', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const before = log.statuses.at(-1)

    await $.turn.complete({ answer: 'ok', durationMs: 10_000, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(420) })
    await clock.advance(10)
    expect(log.statuses.at(-1)).toBe(`⚡ 42 tok/s · ${before}`)
    // The next reading keeps it.
    await clock.advance(61_000)
    expect(log.statuses.at(-1)?.startsWith('⚡ 42 tok/s · ██')).toBe(true)
  })

  test('a turn without usage leaves the status line as it was', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const before = log.statuses.at(-1)

    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(log.statuses.at(-1)).toBe(before)
  })

  test('/litellm debug tells the speed', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'debug')).text).toContain('Speed    on · none yet')
    await $.turn.complete({ answer: 'ok', durationMs: 10_000, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(420) })
    expect((await run($, 'debug')).text).toContain('Speed    on · 42 tok/s last turn · 42 tok/s average of 1 turn')
  })
})

// The model's stream cannot be mocked in the engine, so the meter runs here against a stream and a clock of its own.
const streaming = (pieces: ({ wait: number } | Record<string, unknown>)[]) => {
  const statuses: (string | undefined)[] = []
  let clock = NOW
  const ports = {
    now: async () => clock,
    env: async () => ({ ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY }),
    status: (text: string | undefined) => void statuses.push(text),
  } as unknown as Ports
  const session = createSession()
  const source = async function* (): AsyncGenerator<Record<string, unknown>> {
    for (const piece of pieces) {
      if ('wait' in piece) {
        clock += piece.wait as number
      } else {
        yield piece
      }
    }
  }
  const run = async (seen: () => void = () => undefined) => {
    const out: unknown[] = []

    for await (const piece of liveSpeed(session, ports, {}, source)) {
      out.push(piece)
      seen()
    }

    return out
  }

  return { run, session, statuses, ports }
}
const text = (chars: number) => ({ kind: 'text', index: 0, text: 'x'.repeat(chars) })
const stop = (output: number) => ({ kind: 'stop', stopReason: 'end_turn', usage: usage(output) })

describe('speed while the answer streams', () => {
  test('shows a rate while the pieces are still coming, then settles it from the real count', async () => {
    // 40 characters every 100 ms = 10 tokens per 100 ms = 100 tok/s.
    const pieces = [text(40), { wait: 100 }, text(40), { wait: 100 }, text(40), { wait: 100 }, text(40), { wait: 100 }, text(40), { wait: 100 }, text(40), stop(50)]
    const { run, session, statuses } = streaming(pieces)
    const live: number[] = []

    session.state.latest = { snapshot: null, failure: null }
    await run(() => {
      if (session.state.speed.last !== null) {
        live.push(session.state.speed.last)
      }
    })

    // While the step still streams the rate is already there, and it is the one the pieces imply.
    expect(live.length).toBeGreaterThan(0)
    expect(Math.round(live[0] ?? 0)).toBe(100)
    // At the end the real count (50 tokens, the 10 of the first piece left out) over the 500 ms streamed.
    expect(Math.round(session.state.speed.last ?? 0)).toBe(80)
    expect(session.state.speed.turns).toBe(1)
    expect(statuses.length).toBeGreaterThan(0)
  })

  test('hands every piece on unchanged', async () => {
    const pieces = [{ kind: 'tool', index: 0, id: 'a1', name: 'Read' }, { kind: 'input', index: 0, json: '{"a":1}' }, text(8), stop(3)]
    const { run } = streaming(pieces)

    expect(await run()).toEqual(pieces)
  })

  test('a step too short to time leaves the speed alone', async () => {
    const { run, session } = streaming([text(40), stop(10)])

    await run()
    expect(session.state.speed.last).toBeNull()
  })

  test('without a count at the stop, the text stands for it', async () => {
    const pieces = [text(40), { wait: 500 }, text(40), { kind: 'stop', stopReason: 'end_turn', usage: null }]
    const { run, session } = streaming(pieces)

    await run()
    // 40 characters after the first one, 10 tokens, over 500 ms.
    expect(Math.round(session.state.speed.last ?? 0)).toBe(20)
  })

  test('a turn whose steps were timed is not counted twice, and one that was not is counted', async () => {
    const { run, session, ports } = streaming([text(40), { wait: 400 }, text(40), stop(20)])

    await run()
    await session.recordTurn(ports, { usage: usage(420), durationMs: 10_000, isAborted: false })
    expect(session.state.speed.turns).toBe(1)
    // The next turn had no timed step: its own tokens and time stand in.
    await session.recordTurn(ports, { usage: usage(420), durationMs: 10_000, isAborted: false })
    expect(session.state.speed.turns).toBe(2)
  })

  test('a broken status line never breaks the stream', async () => {
    const { run, ports } = streaming([text(40), { wait: 500 }, text(40), stop(20)])

    ports.status = () => {
      throw new Error('no status')
    }
    expect((await run()).length).toBe(3)
  })
})

describe('latency chart beside the speed', () => {
  test('the wait for the first piece is charted, and the steps before it make the sparkline', async () => {
    const { run, session } = streaming([{ wait: 800 }, text(40), { wait: 400 }, text(40), stop(20)])

    await run()
    expect(session.state.speed.lag).toEqual([800])
    expect(session.state.speed.waitingSince).toBeNull()
    expect(speedText(session.state.speed, NOW + 1200)).toMatch(/^⚡ [\d.]+ tok\/s ⏱ 800 ms$/)

    const second = streaming([{ wait: 1600 }, text(40), { wait: 400 }, text(40), stop(20)])

    second.session.state.speed = session.state.speed
    await second.run()
    expect(second.session.state.speed.lag).toEqual([800, 1600])
    expect(speedText(second.session.state.speed, NOW + 3000)).toContain('⏱ 1.6 s ')
  })

  test('says the model is silent while nothing has come, and an error ends the wait', async () => {
    const waiting = { ...NO_SPEED, waitingSince: NOW }

    expect(speedText(waiting, NOW + 3000)).toBe('⏳ 3s')
    expect(speedText(waiting, NOW + 45_000)).toBe('⚠ no reply 45s')

    const { run, session } = streaming([])
    const broken = async function* (): AsyncGenerator<never> {
      throw new Error('down')
    }
    const flow = liveSpeed(session, { now: async () => NOW, status: () => undefined } as unknown as Ports, {}, broken)

    await expect(flow.next()).rejects.toThrow('down')
    expect(session.state.speed.waitingSince).toBeNull()
    await run()
  })

  test('a timer redraws the wait every second and stops at the first piece', async () => {
    const { session, statuses } = streaming([])
    let cancelled = false
    let tick: () => void = () => undefined
    const ports = {
      now: async () => NOW,
      status: (text: string | undefined) => void statuses.push(text),
      every: (_ms: number, fn: () => void) => {
        tick = fn

        return { cancel: () => void (cancelled = true) }
      },
    } as unknown as Ports
    let drawn = 0
    const source = async function* () {
      tick()
      await Promise.resolve()
      drawn = statuses.length
      yield text(8)
    }

    for await (const _ of liveSpeed(session, ports, {}, source)) {
      // drained
    }
    expect(cancelled).toBe(true)
    // The start of the step drew once, and the tick drew again while the model was silent.
    expect(drawn).toBe(2)
  })

  test('debug tells the average wait', () => {
    const speed = { ...withTurn(NO_SPEED, turn(420, 10_000), NOW), lag: [800, 1200] }

    expect(speedLine(speed)).toBe('42 tok/s last turn · 42 tok/s average of 1 turn · first piece 1.0 s on average of 2 steps')
  })
})

describe('context in the stream', () => {
  const prices = { 'cloud/auto': { input: 3, output: 15, context: 200_000 } }
  const used = (input: number) => ({ input_tokens: input, output_tokens: 1000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, model: 'cloud/auto' })

  test('a step that ends with its usage puts the context in the status line, beside the speed', async () => {
    const { run, session, statuses } = streaming([text(40), { wait: 500 }, text(40), { kind: 'stop', stopReason: 'end_turn', usage: used(78_000) }])

    session.state.latest = { snapshot: { ...(await snapshotOf()), prices }, failure: null }
    await run()
    expect(session.state.context).toEqual({ used: 84_000, model: 'cloud/auto' })
    expect(statuses.at(-1)).toMatch(/^⚡ [\d.]+ tok\/s ⏱ 0 ms · 🧠 84k\/200k 42% · /)
  })
})
