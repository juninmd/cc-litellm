import { describe, expect, test } from 'claude-code/testing'

import { boot, run as runCommand, start } from './boot'
import { KEY, reply, standardRoutes } from './support'

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

describe('/litellm copy and share', () => {
  test('copy puts the summary on the clipboard by default, and says how many lines', async ($, on) => {
    const { log, clock } = boot(on)
    const { text } = await read($, clock, 'copy')

    expect(text).toMatch(/^Copied the summary \(\d+ lines\)\.$/)
    expect(log.copies[0]).toContain('prod-claude')
    expect(log.copies[0]).not.toContain(KEY)
  })

  test('copy names the report and the range', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    expect((await run($, 'copy usage 14')).text).toMatch(/^Copied the usage report/)
    expect(log.copies.at(-1)).toContain('Usage · last 14 days')
    expect((await run($, 'copy csv 30')).text).toMatch(/^Copied 30 days as CSV/)
    expect((await run($, 'copy json')).text).toMatch(/^Copied the JSON/)
    expect((await run($, 'copy pace')).text).toMatch(/^Copied the pace report/)
    expect((await run($, 'copy models')).text).toMatch(/^Copied the model list/)
    expect((await run($, 'copy details')).text).toMatch(/^Copied the key details/)
    expect((await run($, 'copy compare')).text).toMatch(/^Copied the comparison/)
  })

  test('copy says when the clipboard would not take it, and what prints it instead', async ($, on) => {
    const { clock } = boot(on, { copy: { isCopied: false, reason: 'no-clipboard' } })

    await start($, clock)
    expect((await run($, 'copy usage')).text).toBe('Could not copy the usage report (no-clipboard). Use /litellm usage to print it instead.')
    expect((await run($, 'copy')).text).toBe('Could not copy the summary (no-clipboard). Use /litellm info to print it instead.')
    expect((await run($, 'copy details')).text).toContain('Use /litellm tab details to print it instead.')
  })

  test('copy and share name the reports there are when the name is none', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const verb of ['copy', 'share']) {
      expect((await run($, `${verb} nothing`)).text).toBe(
        'Unknown report "nothing". The reports are overview, usage, models, details, pace, compare, csv, json.',
      )
    }
  })

  test('copy does not put an empty table on the clipboard when there is no history', async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, 'x') } })

    await start($, clock)
    expect((await run($, 'copy usage')).text).toContain('No usage history')
    expect(log.copies).toEqual([])
  })

  test('a clipboard that throws is one that refuses: it says so, and what prints the report instead', async ($, on) => {
    const { clock } = boot(on, { copyThrows: true })

    await start($, clock)

    expect((await run($, 'copy pace')).text).toBe('Could not copy the pace report (refused). Use /litellm pace to print it instead.')
  })

  test('share hands the report to Claude, unseen, and never holds the key', async ($, on) => {
    const { log, clock } = boot(on)
    const result = await read($, clock, 'share pace')

    expect(result.text).toBe('Shared the pace report with Claude. Ask it about your spend, budget or usage.')
    expect(result.context).toHaveLength(1)
    expect(result.context?.[0]).toContain('Below is the pace report for their LiteLLM virtual key, read from litellm.test')
    expect(result.context?.[0]).toContain('Runway')
    expect(result.context?.[0]).not.toContain(KEY)
    expect(log.copies).toEqual([])
  })
})

describe('/litellm ping', () => {
  test('tries every endpoint the plugin reads, once, with a mark each', async ($, on) => {
    const { net, clock } = boot(on)
    const { text } = await read($, clock, 'ping')
    const before = net.calls.length

    expect(text.split('\n')[0]).toBe('litellm.test · https://litellm.test')
    expect(text).toMatch(/✓ \/key\/info +200/)
    expect(text).toMatch(/✓ \/v1\/models +200 +[—\d ms]+ 3 models/)
    expect(text).toMatch(/✗ \/health\/readiness +404/)
    expect(before).toBeGreaterThan(0)
  })

  test('answers 3 when the key info itself does not answer, and keeps the key out of what it says', async ($, on) => {
    const { clock } = boot(on, { routes: { '/key/info': reply(401, { error: { message: `bad ${KEY}`, type: 'auth_error', code: '401', param: 'None' } }) } })
    const result = await read($, clock, 'ping')

    expect(result.exitCode).toBe(3)
    expect(result.text).toMatch(/✗ \/key\/info +401/)
    expect(result.text).not.toContain(KEY)
  })

  test('says what is wrong when nothing is configured', async ($, on) => {
    const { clock } = boot(on, { env: {} })
    const result = await read($, clock, 'health')

    expect(result.exitCode).toBe(3)
    expect(result.text).toContain('not routed through a LiteLLM proxy')
  })
})

describe('what is typed wrong', () => {
  test('a slip of the fingers gets a guess and the help', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    expect((await run($, 'usgae')).text).toMatch(/^Unknown option "usgae"\. Did you mean "usage"\?\n\/litellm {18}open the live pane/)
    expect((await run($, 'modles')).text).toContain('Did you mean "models"?')
    expect((await run($, 'chekc')).text).toContain('Did you mean "check"?')
    expect((await run($, 'fallback')).text).toContain('Did you mean "fallbacks"?')
  })

  test('something far from every command gets no guess', async ($, on) => {
    const { clock } = boot(on)

    expect((await read($, clock, 'xyzzy')).text).toMatch(/^Unknown option "xyzzy"\.\n/)
  })

  test('help lists the commands this adds, and keeps the admin ones', async ($, on) => {
    const { clock } = boot(on)
    const { text } = await read($, clock, 'help')

    for (const word of ['status', 'pace', 'usage [7|14|30]', 'compare [7|14]', 'day [when]', 'models [text]', 'check [warn%]', 'json', 'csv', 'copy [what]', 'share [what]', 'ping', 'keys']) {
      expect(text).toContain(word)
    }
  })
})
