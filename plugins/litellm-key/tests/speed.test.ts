import { describe, expect, test } from 'claude-code/testing'
import { NO_SPEED, speedLine, speedText, withTurn } from '../hooks/speed'
import { configOf } from '../hooks/settings'
import { liveSpeed } from '../hooks/live-speed'
import type { Ports } from '../hooks/ports'
import { createSession } from '../hooks/session'
import { boot, run, start } from './boot'
import { BASE, KEY, NOW } from './support'

const usage = (output: number) => ({ input_tokens: 100, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
const turn = (tokens: number, ms: number) => ({ usage: usage(tokens), durationMs: ms, isAborted: false })

describe('speed of the answers', () => {
  test('is the output tokens over the time of the turn', () => {
    const speed = withTurn(NO_SPEED, turn(420, 10_000))

    expect(speed.last).toBe(42)
    expect(speedText(speed)).toBe('⚡ 42 tok/s')
  })

  test('keeps the average of the session beside the last turn', () => {
    const speed = withTurn(withTurn(NO_SPEED, turn(100, 10_000)), turn(300, 10_000))

    expect(speed.last).toBe(30)
    expect(speedLine(speed)).toBe('30 tok/s last turn · 20 tok/s average of 2 turns')
  })

  test('counts nothing it cannot trust, and shows nothing before a turn counts', () => {
    const aborted = withTurn(NO_SPEED, { ...turn(100, 1000), isAborted: true })

    expect(aborted).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, { durationMs: 1000 })).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, turn(0, 1000))).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, turn(100, 0))).toBe(NO_SPEED)
    expect(withTurn(NO_SPEED, { usage: 'x', durationMs: 5 })).toBe(NO_SPEED)
    expect(speedText(NO_SPEED)).toBeUndefined()
    expect(speedLine(NO_SPEED)).toContain('none yet')
  })

  test('rounds big and small rates', () => {
    expect(speedText(withTurn(NO_SPEED, turn(1234, 10_000)))).toBe('⚡ 123 tok/s')
    expect(speedText(withTurn(NO_SPEED, turn(25, 10_000)))).toBe('⚡ 2.5 tok/s')
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
