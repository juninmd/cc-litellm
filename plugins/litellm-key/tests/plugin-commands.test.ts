import { describe, expect, test } from 'claude-code/testing'

import { boot, run as runCommand, start } from './boot'
import { activity } from './activity-fixtures'
import { HASH, KEY, keyBody, reply, standardRoutes } from './support'

type Engine = Parameters<typeof start>[0]

/** What `/litellm <args>` answered, with the text as a string: it is what these tests look at. */
const run = async ($: Engine, args: string) => {
  const result = await runCommand($, args)

  return { ...result, text: result.text ?? '' }
}

const read = async ($: Engine, clock: Parameters<typeof start>[1], args: string) => {
  await start($, clock)

  return run($, args)
}

describe('/litellm status, pace, usage, compare, day', () => {
  test('status prints the status line as text', async ($, on) => {
    const { clock } = boot(on)

    expect((await read($, clock, 'status')).text).toBe('██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('pace says where the budget is heading', async ($, on) => {
    const { clock } = boot(on)
    const { text } = await read($, clock, 'pace')

    expect(text).toContain('Pace · prod-claude · litellm.test')
    expect(text).toContain('Runway     lasts until the reset at $2.18/day')
    expect(text).toContain('Allowance  $5.77/day to last until the reset')
  })

  test('usage prints a week by default, and 14 or 30 days when asked, with or without the d', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'usage')).text).toContain('Usage · last 7 days')
    expect((await run($, 'usage 14')).text).toContain('Usage · last 14 days')
    expect((await run($, 'usage 30d')).text).toContain('Usage · last 30 days')
  })

  test('usage tells a number it does not take instead of guessing, and still shows the week', async ($, on) => {
    const { clock } = boot(on)
    const { text } = await read($, clock, 'usage 9')

    expect(text).toContain('Usage · last 7 days')
    expect(text).toContain('(9 is not a range the plugin reads: 7, 14 or 30. This is 7 days.)')
  })

  test('compare sets the last full days against the ones before, and refuses a range the history cannot hold twice', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': activity(Array.from({ length: 30 }, () => 5)) } })

    await start($, clock)
    expect((await run($, 'compare')).text).toContain('Compare · last 7 full days vs the 7 before')
    expect((await run($, 'movers 14')).text).toContain('last 14 full days')
    expect((await run($, 'compare 30')).text).toBe('Comparing 30 days takes 60 days of history, and the plugin reads 30. Use 7 or 14.')
    expect((await run($, 'compare 9')).text).toContain('(9 is not a range to compare: 7 or 14. This is 7 days.)')
  })

  test('day names a day of the history by word, by date or by weekday', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'day')).text).toContain('Sat Oct 3 (today)')
    expect((await run($, 'day yesterday')).text).toContain('Fri Oct 2')
    expect((await run($, 'day 10-01')).text).toContain('Thu Oct 1')
    expect((await run($, 'day 2026-09-30')).text).toContain('Wed Sep 30')
    expect((await run($, 'day mon')).text).toContain('Mon Sep 28')
  })

  test('day says what it can name when the name is none', async ($, on) => {
    const { clock } = boot(on)
    const { text } = await read($, clock, 'day someday')

    expect(text).toContain('No day "someday" in the history of 30 days.')
    expect(text).toContain('a date such as 2026-10-03 or 10-03')
  })

  test('usage, compare and day say why there is no history when there is none', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, 'x') } })

    await start($, clock)
    for (const args of ['usage', 'compare', 'day']) {
      expect((await run($, args)).text).toContain('No usage history')
    }
  })
})

describe('/litellm models', () => {
  const groups = {
    data: [
      { model_group: 'claude-sonnet-4-5', input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5, max_input_tokens: 200000 },
      { model_group: 'claude-opus-4-1', input_cost_per_token: 1.5e-5, output_cost_per_token: 7.5e-5, max_input_tokens: 200000 },
    ],
  }

  test('keeps only the models whose name holds the text, with their prices, and says how many', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/model_group/info': reply(200, groups) } })
    const { text } = await read($, clock, 'models OPUS')

    expect(text.split('\n')[0]).toBe('Models (1 of 3 have "opus") · dollars per million tokens, in / out')
    expect(text).toContain('claude-opus-4-1')
    expect(text).not.toContain('claude-sonnet-4-5')
  })

  test('says so when no model has the text', async ($, on) => {
    const { clock } = boot(on)

    expect((await read($, clock, 'models gemini')).text).toBe('No model of 3 has "gemini" in its name.')
  })

  test('lists them all without a text', async ($, on) => {
    const { clock } = boot(on)

    expect((await read($, clock, 'models')).text).toBe('Models (3): claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5')
  })
})

describe('/litellm check', () => {
  test('is OK with the exit code 0, WARNING with 1 and CRITICAL with 2', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect(await run($, 'check')).toMatchObject({ exitCode: 0, text: expect.stringMatching(/^OK · /) })
    expect(await run($, 'check 20')).toMatchObject({ exitCode: 1, text: expect.stringMatching(/^WARNING · /) })
  })

  test('is CRITICAL for a key that is over its cap', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 52 })) } })
    const result = await read($, clock, 'check')

    expect(result.exitCode).toBe(2)
    expect(result.text).toContain('✗ Key budget is over its cap')
  })

  test('is UNKNOWN with 3 when the proxy did not answer', async ($, on) => {
    const { clock } = boot(on, { routes: { '/key/info': reply(401, { error: { message: 'bad', type: 'auth_error', code: '401', param: 'None' } }) } })
    const result = await read($, clock, 'check')

    expect(result.exitCode).toBe(3)
    expect(result.text).toMatch(/^UNKNOWN · The proxy rejected the key/)
  })

  test('takes the daily alert of the options into account', { options: { daily_alert: 5 } }, async ($, on) => {
    const { clock } = boot(on)
    const result = await read($, clock, 'check')

    expect(result.exitCode).toBe(1)
    expect(result.text).toContain("Today's spend is $8.70, over your daily alert of $5.00")
  })

  test('wants a threshold from 1 to 99, and says so with the exit code 3', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const word of ['0', '100', 'high']) {
      expect(await run($, `check ${word}`)).toEqual({ text: 'Usage: /litellm check [warn%], with the percentage from 1 to 99.', exitCode: 3 })
    }
  })
})

describe('/litellm json and csv', () => {
  test('json is the reading and nothing else, to parse', async ($, on) => {
    const { clock } = boot(on)
    const { text } = await read($, clock, 'json')
    const json = JSON.parse(text) as { schema: number; key: { alias: string } }

    expect(json.schema).toBe(1)
    expect(json.key.alias).toBe('prod-claude')
    expect(text).not.toContain(KEY)
    expect(text).not.toContain(HASH)
  })

  test('json says what went wrong as JSON too, with the exit code 3', async ($, on) => {
    const { clock } = boot(on, { env: {} })
    const result = await read($, clock, 'json')
    const json = JSON.parse(result.text) as { schema: number; error: { kind: string } }

    expect(result.exitCode).toBe(3)
    expect(json.error.kind).toBe('not-configured')
  })

  test('json says the reading is old when the proxy fails after a good one', async ($, on) => {
    const state = { isDown: false }
    const routes = { ...standardRoutes(), '/key/info': () => (state.isDown ? reply(500, 'boom') : reply(200, keyBody())) }
    const { clock } = boot(on, { routes })

    await start($, clock)
    state.isDown = true
    await run($, 'refresh')

    expect((JSON.parse((await run($, 'json')).text) as { stale: string }).stale).toContain('500')
  })

  test('csv is the days and nothing else, a week by default', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'csv')).text.split('\n')).toHaveLength(8)
    expect((await run($, 'csv 30')).text.split('\n')).toHaveLength(31)
    expect((await run($, 'csv 14d')).text.split('\n')).toHaveLength(15)
  })

  test('csv has nothing to give without a history, and says so with the exit code 3', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, 'x') } })
    const result = await read($, clock, 'csv')

    expect(result.exitCode).toBe(3)
    expect(result.text).toContain('No usage history')
  })
})
