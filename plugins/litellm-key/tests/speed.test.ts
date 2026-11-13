import { describe, expect, test } from 'claude-code/testing'
import { NO_SPEED, speedLine, speedText, withTurn } from '../hooks/speed'
import { configOf } from '../hooks/settings'
import { boot, run, start } from './boot'

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
