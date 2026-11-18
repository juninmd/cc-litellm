import { describe, expect, test } from 'claude-code/testing'
import { contextLine, contextOf, contextText } from '../hooks/context'
import { configOf } from '../hooks/settings'
import { boot, run, start } from './boot'

describe('context in use', () => {
  const prices = { 'cloud/auto': { input: 3, output: 15, context: 200_000 } }
  const used = (input: number, extra: Record<string, unknown> = {}) => ({ input_tokens: input, output_tokens: 1000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, model: 'cloud/auto', ...extra })

  test('is what the step read and wrote, over the window of the model', () => {
    expect(contextOf(used(78_000))).toEqual({ used: 84_000, model: 'cloud/auto' })
    expect(contextText(contextOf(used(78_000)), prices)).toBe('🧠 84k/200k 42%')
  })

  test('finds the window by the name without its provider, and says only the tokens when it has none', () => {
    expect(contextText(contextOf(used(78_000, { model: 'bedrock/cloud/auto' })), prices)).toBe('🧠 84k/200k 42%')
    expect(contextText(contextOf(used(78_000, { model: 'other' })), prices)).toBe('🧠 84k')
    expect(contextText(contextOf(used(78_000)), null)).toBe('🧠 84k')
  })

  test('has nothing for a usage that says nothing', () => {
    expect(contextOf(null)).toBeNull()
    expect(contextOf({ input_tokens: 0 })).toBeNull()
    expect(contextText(null, prices)).toBeUndefined()
    expect(contextLine(null, prices)).toContain('none yet')
    expect(contextLine(contextOf(used(78_000)), prices)).toBe('🧠 84k/200k 42% · cloud/auto')
  })

  test('show_context is on unless turned off', () => {
    expect(configOf({}).isContextShown).toBe(true)
    expect(configOf({ show_context: false }).isContextShown).toBe(false)
  })

  test('/litellm debug tells the context', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'debug')).text).toContain('Context  on · none yet')
  })
})
