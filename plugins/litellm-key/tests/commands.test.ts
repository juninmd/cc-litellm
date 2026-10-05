import { describe, expect, test } from 'claude-code/testing'

import { boot, keysOf, mount, run, start, texts, urls } from './harness'
import { HASH, KEY, activity, health, keyBody, reply, standardRoutes } from './support'

/** 15 quiet days, 7 of $10 (sonnet 80%), 7 of $15 (opus up to 47%), and today at $99: a month to compare. */
const SPENDS = [...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 15), 99]
const month = (): Record<string, ReturnType<typeof activity>> => ({
  '/user/daily/activity': activity(SPENDS, (at): Record<string, number> =>
    at === 29
      ? { 'claude-sonnet-4-5': 1 }
      : at >= 22
        ? { 'claude-sonnet-4-5': 8 / 15, 'claude-opus-4-1': 7 / 15 }
        : { 'claude-sonnet-4-5': 0.8, 'claude-opus-4-1': 0.2 },
  ),
})
const spending = (spend: number) => ({ ...standardRoutes(), '/key/info': reply(200, keyBody({ spend })) })

describe('/litellm status', () => {
  test('prints the line the status bar pins', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect((await run($, 'status')).text).toBe('▰▰▱▱▱▱ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect((await run($, 'line')).text).toBe(log.statuses.at(-1) ?? '')
  })

  test('says what it has when it has no reading', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)

    expect((await run($, 'status')).text).toContain('ANTHROPIC_BASE_URL is not set')
  })
})

describe('/litellm pace', () => {
  test('says where the budget is heading and what it can spend a day', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'pace')

    expect(text).toContain('Pace · prod-claude · litellm.test')
    expect(text).toContain('Allowance  $5.77/day to last · now $0.53/day')
    expect(text).toContain('Headroom   about 396 more requests')
    expect(text).toContain('Team eng-platform')
  })

  test('is there when the pace is turned off, since it was asked for', { options: { show_forecast: false } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'forecast')).text).toContain('Allowance  $5.77/day')
    expect((await run($, 'runway')).text).toContain('Pace · prod-claude')
  })

  test('has the session once there is one', async ($, on) => {
    let spend = 12.5
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/key/info': () => reply(200, keyBody({ spend })) } })

    await start($, clock)
    spend = 14.5
    await clock.advance(3_600_000)
    await run($, 'refresh')

    expect((await run($, 'pace')).text).toMatch(/Session {4}\+\$2\.00 since 12:00 \(1h ago\) · \$2\.00\/h/)
  })
})

describe('/litellm usage', () => {
  test('says when the days it was given are no range, and shows 7', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'usage 9')).text).toMatch(/last 7 days[\s\S]*\(9 is not a range the plugin reads: 7, 14 or 30\. This is 7 days\.\)$/)
    expect((await run($, 'usage 14')).text).not.toContain('is not a range')
    expect((await run($, 'usage 30d')).text).toContain('last 30 days')
  })
})

describe('/litellm compare', () => {
  test('sets the last seven days against the seven before, model by model', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

    await start($, clock)
    const { text } = await run($, 'compare')

    expect(text).toContain('Compare · last 7 full days vs the 7 before · UTC, today left out · litellm.test')
    expect(text).toMatch(/Spend +\$105\.00 +\$70\.00 +▲ 50%/)
    expect(text).toMatch(/claude-opus-4-1 +\$49\.00 +\$14\.00 +▲ 250%/)
    expect((await run($, 'movers')).text).toContain('Compare · last 7 full days')
  })

  test('does fourteen days too, and says why not thirty', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

    await start($, clock)

    expect((await run($, 'compare 14')).text).toContain('Not enough history to compare 14 days')
    expect((await run($, 'compare 30')).text).toBe('Comparing 30 days takes 60 days of history, and the plugin reads 30. Use 7 or 14.')
    expect((await run($, 'compare 9')).text).toMatch(/\(9 is not a range the plugin reads: 7, 14 or 30\. This is 7 days\.\)$/)
  })

  test('says it cannot when the history is too short', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'compare')).text).toContain('Not enough history to compare 7 days with the 7 before them')
  })
})

describe('/litellm day', () => {
  test('says what today did, by model', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'day')

    expect(text).toContain('Sat Oct 3 (today) · UTC · litellm.test')
    expect(text).toContain('$8.70 · 90 requests · 1.7M tokens')
    expect(text).toMatch(/claude-sonnet-4-5 +\$6\.5\d +75% +68 requests/)
    expect((await run($, 'day today')).text).toBe(text)
  })

  test('takes yesterday, a date, a date without the year, and a weekday', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'day yesterday')).text).toContain('Fri Oct 2 · UTC')
    expect((await run($, 'day 2026-10-01')).text).toContain('Thu Oct 1 · UTC')
    expect((await run($, 'day 09-30')).text).toContain('Wed Sep 30 · UTC')
    expect((await run($, 'day sat')).text).toContain('Sat Oct 3 (today)')
    expect((await run($, 'day Thursday')).text).toContain('Thu Oct 1')
  })

  test('says what it could not find, and what it can', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'day someday')

    expect(text).toBe(
      'No day "someday" in the history of 30 days. Try today, yesterday, a date such as 2026-10-03 or 10-03, or a weekday such as mon.',
    )
    expect((await run($, 'day 2025-01-01')).text).toContain('No day "2025-01-01"')
  })

  test('says there is no history to look a day up in', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

    await start($, clock)

    expect((await run($, 'day')).text).toContain('No usage history')
  })
})

describe('/litellm models', () => {
  test('lists only the names that hold the text', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'models OPUS')).text).toBe('Models (1 of 3 have "opus"): claude-opus-4-1')
    expect((await run($, 'models claude')).text).toBe('Models (3 of 3 have "claude"): claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5')
    expect((await run($, 'models zzz')).text).toBe('No model of 3 has "zzz" in its name.')
  })

  test('keeps the plain list without a filter, and the open case with no models at all', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/v1/models': reply(500, 'x') } })

    await start($, clock)

    expect((await run($, 'models')).text).toBe('Models: all proxy models')
    expect((await run($, 'models opus')).text).toBe('Models: all proxy models')
  })
})

describe('/litellm check', () => {
  test('says OK, and exits with 0, while nothing needs a look', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const result = await run($, 'check')

    expect(result.text).toBe('OK · 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect(result.exitCode).toBe(0)
  })

  test('says WARNING with 1 when something is near, and lists it', async ($, on) => {
    const { clock } = boot(on, { routes: spending(42) })

    await start($, clock)
    const result = await run($, 'check')

    expect(result.exitCode).toBe(1)
    expect((result.text ?? '').split('\n')[0]).toMatch(/^WARNING · 84% of budget/)
    expect(result.text).toContain('  ▲ Key budget is at 84%: $42.00 of $50.00')
  })

  test('says CRITICAL with 2 for a budget that is over, or a key that is dead', async ($, on) => {
    const over = boot(on, { routes: spending(52) })

    await start($, over.clock)
    expect(await run($, 'check')).toMatchObject({ exitCode: 2 })
    expect((await run($, 'check')).text).toMatch(/^CRITICAL · /)
  })

  test('takes the threshold to warn at', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'check 20')).exitCode).toBe(1)
    expect((await run($, 'check 50')).exitCode).toBe(0)
    expect((await run($, 'check 50%')).exitCode).toBe(0)
  })

  test('says how it is used when the threshold is none, with 3', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    for (const word of ['abc', '0', '100', '-5']) {
      expect(await run($, `check ${word}`)).toEqual({
        text: 'Usage: /litellm check [warn%], with the percentage from 1 to 99.',
        exitCode: 3,
      })
    }
  })

  test('says UNKNOWN with 3 when there is nothing to judge', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const result = await run($, 'check')

    expect(result.exitCode).toBe(3)
    expect(result.text).toMatch(/^UNKNOWN · Claude Code is not routed through a LiteLLM proxy/)
  })

  test('says UNKNOWN when the proxy fails after a good reading, and what it saw last', async ($, on) => {
    let isUp = true
    const routes = { ...standardRoutes(), '/key/info': () => (isUp ? reply(200, keyBody()) : reply(502, 'bad gateway')) }
    const { clock } = boot(on, { routes })

    await start($, clock)
    isUp = false
    await clock.advance(20_000)
    const result = await run($, 'check')

    expect(result.exitCode).toBe(3)
    expect(result.text).toMatch(/^UNKNOWN · The proxy answered 502.*last good reading 20s ago: 25% of budget/)
  })

  test('hears the daily alert', { options: { daily_alert: 5 } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const result = await run($, 'check')

    expect(result.exitCode).toBe(1)
    expect(result.text).toContain("▲ Today's spend is $8.70, over your daily alert of $5.00")
  })
})

describe('/litellm json', () => {
  test('is JSON, and nothing else', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text, exitCode } = await run($, 'json')
    const json = JSON.parse(text ?? '') as Record<string, any>

    expect(exitCode).toBeUndefined()
    expect(json.schema).toBe(1)
    expect(json.budget).toMatchObject({ spend: 12.5, limit: 50, percent: 25 })
    expect(json.key.name).toBe('sk-...7890')
    expect(json.stale).toBeNull()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain(HASH)
  })

  test('says why the reading is old, inside the JSON', async ($, on) => {
    let isUp = true
    const routes = { ...standardRoutes(), '/key/info': () => (isUp ? reply(200, keyBody()) : reply(502, 'bad gateway')) }
    const { clock } = boot(on, { routes })

    await start($, clock)
    isUp = false
    await clock.advance(20_000)
    const json = JSON.parse((await run($, 'json')).text ?? '') as Record<string, any>

    expect(json.stale).toContain('The proxy answered 502')
    expect(json.budget.spend).toBe(12.5)
  })

  test('is JSON when there is nothing to show too, with 3 for a script', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const { text, exitCode } = await run($, 'json')
    const json = JSON.parse(text ?? '') as Record<string, any>

    expect(exitCode).toBe(3)
    expect(json.error.kind).toBe('not-configured')
    expect(json.error.message).toContain('ANTHROPIC_BASE_URL is not set')
  })

  test('uses the options of the person: the pace and the daily alert', { options: { show_forecast: false, daily_alert: 5 } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const json = JSON.parse((await run($, 'json')).text ?? '') as Record<string, any>

    expect(json.pace).toBeNull()
    expect(json.level).toBe('warning')
  })
})

describe('/litellm csv', () => {
  test('is the days as CSV, and nothing else', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text, exitCode } = await run($, 'csv')
    const lines = (text ?? '').split('\n')

    expect(exitCode).toBeUndefined()
    expect(lines[0]).toBe('date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens')
    expect(lines).toHaveLength(8)
    expect(lines.at(-1)).toBe('2026-10-03,8.700000,90,0,1700000,1360000,340000,850000')
    expect(((await run($, 'csv 30')).text ?? '').split('\n')).toHaveLength(31)
    expect(((await run($, 'csv 9')).text ?? '').split('\n')).toHaveLength(8)
  })

  test('says there is nothing to write when there is no history, with 3', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

    await start($, clock)

    expect(await run($, 'csv')).toMatchObject({ exitCode: 3 })
    expect((await run($, 'csv')).text).toContain('No usage history')
  })

  test('says what it has when there is no reading, with 3', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)

    expect(await run($, 'csv')).toMatchObject({ exitCode: 3 })
  })
})

describe('/litellm copy', () => {
  test('copies the report it is asked for, and says so', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'copy usage')

    expect(log.copies[0]).toContain('Usage · last 7 days · litellm.test')
    expect(text).toMatch(/^Copied the usage report \(\d+ lines\)\.$/)
    expect(JSON.stringify(log.copies)).not.toContain(KEY)
  })

  test('copies the tab the pane is on when it is given no name', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await run($, 'copy')
    await ui.press({ key: 'tab-models' })
    const { text } = await run($, 'copy')

    expect(log.copies[0]).toContain('prod-claude · sk-...7890 · litellm.test')
    expect(log.copies[1]).toContain('Models (3) · spend over the last 7 days')
    expect(text).toMatch(/^Copied the model list/)
  })

  test('copies every kind of report there is', async ($, on) => {
    const { log, clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

    await start($, clock)
    for (const name of ['overview', 'info', 'usage', 'models', 'details', 'pace', 'compare', 'csv', 'json']) {
      expect((await run($, `copy ${name}`)).text).toMatch(/^Copied /)
    }
    expect(log.copies).toHaveLength(9)
    expect(log.copies[6]).toContain('Compare · last 7 full days')
    expect(log.copies[7]?.split('\n')[0]).toBe('date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens')
    expect(JSON.parse(log.copies[8] ?? '').schema).toBe(1)
  })

  test('takes the range after the name', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    await run($, 'copy csv 30')
    await run($, 'copy usage 14')

    expect(log.copies[0]?.split('\n')).toHaveLength(31)
    expect(log.copies[1]).toContain('last 14 days')
  })

  test('says which reports there are when the name is none', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect((await run($, 'copy nope')).text).toBe(
      'Unknown report "nope". The reports are overview, usage, models, details, pace, compare, csv, json.',
    )
    expect(log.copies).toEqual([])
  })

  test('says when the clipboard would not take it, and how to print it instead', async ($, on) => {
    const { clock } = boot(on, { copy: { isCopied: false, reason: 'no-clipboard' } })

    await start($, clock)

    expect((await run($, 'copy usage')).text).toBe('Could not copy the usage report (no-clipboard). Use /litellm usage to print it instead.')
  })

  test('says what it has when there is nothing to copy', async ($, on) => {
    const { log, clock } = boot(on, { env: {} })

    await start($, clock)

    expect((await run($, 'copy usage')).text).toContain('ANTHROPIC_BASE_URL is not set')
    expect(log.copies).toEqual([])
  })
})

describe('/litellm share', () => {
  test('hands the summary to Claude, out of the way of the person, and says so', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text, context } = await run($, 'share')

    expect(text).toBe('Shared the summary with Claude. Ask it about your spend, budget or usage.')
    expect(context).toHaveLength(1)
    expect(context?.[0]).toContain('The user ran /litellm share')
    expect(context?.[0]).toContain('read from litellm.test at 12:00:00')
    expect(context?.[0]).toContain('$12.50 / $50.00 (25%)')
    expect(context?.[0]).toContain('prod-claude')
    expect(context?.[0]).not.toContain(KEY)
  })

  test('hands over any report it is asked for', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const usage = await run($, 'share usage 14')

    expect(usage.text).toContain('Shared the usage report with Claude')
    expect(usage.context?.[0]).toContain('Usage · last 14 days')
    expect((await run($, 'share pace')).context?.[0]).toContain('Allowance')
  })

  test('hands over nothing for a name that is none', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const bad = await run($, 'share nope')

    expect(bad.text).toContain('Unknown report "nope"')
    expect(bad.context).toBeUndefined()
  })

  test('hands over nothing when it has nothing to hand', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const none = await run($, 'share')

    expect(none.text).toContain('ANTHROPIC_BASE_URL is not set')
    expect(none.context).toBeUndefined()
  })
})

describe('/litellm ping', () => {
  test('asks every endpoint and says what each answered', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/health/readiness': health() } })

    await start($, clock)
    const { text } = await run($, 'ping')
    const lines = (text ?? '').split('\n')

    expect(lines[0]).toBe('litellm.test · https://litellm.test')
    expect(lines.slice(1).map(line => line.split(/\s+/).slice(0, 3).join(' '))).toEqual([
      '✓ /key/info 200',
      '✓ /user/info 200',
      '✓ /team/info 200',
      '✓ /v1/models 200',
      '✓ /user/daily/activity 200',
      '✓ /health/readiness 200',
    ])
    expect(text).toContain('v1.77.0 · database connected')
    expect(text).toContain('3 active days')
    expect(text).not.toContain(KEY)
  })

  test('marks what failed, with the reason', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

    await start($, clock)
    const { text } = await run($, 'health')

    expect(text).toMatch(/✗ \/user\/daily\/activity +404 +— +Not Found · the usage history is a beta endpoint/)
    expect(text).toMatch(/✗ \/health\/readiness +404/)
  })

  test('only needs the key, and the proxy: it asks again on its own', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const before = urls(net).length

    await run($, 'ping')
    expect(urls(net).length).toBe(before + 6)
    expect(net.calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('exits with 0 while the key can be read, whatever the optional endpoints say', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, { detail: 'Not Found' }) } })

    await start($, clock)

    expect((await run($, 'ping')).exitCode).toBeUndefined()
  })

  test('exits with 3 when the key cannot be read', async ($, on) => {
    const routes = { '/key/info': reply(401, { error: { message: 'bad key', type: 'auth_error', param: 'None', code: '401' } }) }
    const { clock } = boot(on, { routes })

    await start($, clock)
    const result = await run($, 'ping')

    expect(result.exitCode).toBe(3)
    expect(result.text).toMatch(/✗ \/key\/info +401 .*bad key/)
  })

  test('says what is missing when there is nothing to ask', async ($, on) => {
    const { net, clock } = boot(on, { env: {} })

    await start($, clock)

    const result = await run($, 'ping')

    expect(result.text).toContain('ANTHROPIC_BASE_URL is not set')
    expect(result.exitCode).toBe(3)
    expect(net.calls).toHaveLength(0)
  })
})

describe('typos and help', () => {
  test('suggests the command a slip of the fingers was after', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'usgae')).text).toContain('Unknown option "usgae". Did you mean "usage"?')
    expect((await run($, 'comapre')).text).toContain('Did you mean "compare"?')
    expect((await run($, 'chek')).text).toContain('Did you mean "check"?')
  })

  test('has no suggestion for what is nothing like a command', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'wat')).text).toMatch(/^Unknown option "wat"\.\n/)
  })

  test('the help lists every command', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'help')

    for (const word of ['status', 'pace', 'compare [7|14]', 'day [when]', 'models [text]', 'check [warn%]', 'json', 'csv', 'copy [what]', 'share [what]', 'ping', 'debug']) {
      expect(text).toContain(`/litellm ${word}`)
    }
  })
})

describe('show_toasts', () => {
  test('off keeps every warning to the pane and the status line', { options: { show_toasts: false } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: spending(42) })

    await start($, clock)
    await run($, 'refresh')

    expect(log.toasts).toEqual([])
    expect(log.statuses.at(-1)).toContain('84% of budget')
    expect((await run($, 'check')).exitCode).toBe(1)
  })

  test('off says nothing of a proxy that is not there either', { options: { show_toasts: false } }, async ($, on) => {
    const { log, clock } = boot(on, { env: {} })

    await start($, clock)

    expect(log.toasts).toEqual([])
  })

  test('off keeps the answer to a press: a copy still says it was made', { options: { show_toasts: false } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'copy' })
    expect(log.toasts).toEqual(['Copied the summary'])
  })

  test('on is how it was', async ($, on) => {
    const { log, clock } = boot(on, { routes: spending(42) })

    await start($, clock)

    expect(log.toasts.length).toBeGreaterThan(0)
  })

  test('off does not use up the warnings it did not say', { options: { show_toasts: false } }, async ($, on) => {
    const { log, clock } = boot(on, { routes: spending(42) })

    await start($, clock)

    expect(log.stored.notified).toBeUndefined()
  })
})

describe('daily_alert', () => {
  const ALERT = { daily_alert: 5 }

  test('toasts once when today has spent as much as the alert', { options: ALERT }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    await run($, 'refresh')
    await run($, 'refresh')

    expect(log.toasts).toEqual(["Today's spend is $8.70, over your daily alert of $5.00"])
  })

  test('is the same alert, whatever the pace says, and is remembered between sessions', { options: ALERT }, async ($, on) => {
    const { log, clock } = boot(on, { store: { notified: ['daily:2026-10-03:5'] } })

    await start($, clock)

    expect(log.toasts).toEqual([])
  })

  test('says it again when the alert is another, and not before the day is another', { options: { daily_alert: 6 } }, async ($, on) => {
    const { log, clock } = boot(on, { store: { notified: ['daily:2026-10-03:5'] } })

    await start($, clock)

    expect(log.toasts).toEqual(["Today's spend is $8.70, over your daily alert of $6.00"])
  })

  test('is quiet while the day stays under it', { options: { daily_alert: 10 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.toasts).toEqual([])
    expect(log.statuses.at(-1)).not.toContain('today')
  })

  // The engine holds the option to the plugin.json that says it is a number from 0: a bad value never reaches the plugin.
  test('is off at zero, which is what it is by default', { options: { daily_alert: 0 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.toasts).toEqual([])
    expect(log.statuses.at(-1)).not.toContain('today')
  })

  test('shows in the status line, beside the budget', { options: ALERT }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.statuses.at(-1)).toBe('▰▰▱▱▱▱ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d) · today $8.70 (alert $5.00)')
    expect((await run($, 'status')).text).toBe(log.statuses.at(-1) ?? '')
  })

  test('is a line in the pane, among what needs a look', { options: ALERT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await texts(ui, /^▲ Today's spend is \$8\.70, over your daily alert of \$5\.00$/)).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: /Nothing needs attention/ })).toBeUndefined()
  })

  test('reads the history every three minutes, not ten, to keep up with the day', { options: ALERT }, async ($, on) => {
    const { net, clock } = boot(on)
    const count = (path: string) => urls(net).filter(url => url === path).length

    await start($, clock)
    expect(count('/user/daily/activity')).toBe(1)
    await clock.advance(2 * 60_000)
    expect(count('/user/daily/activity')).toBe(1)
    await clock.advance(2 * 60_000)
    expect(count('/user/daily/activity')).toBe(2)
  })

  test('keeps the ten minutes without it', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    await clock.advance(4 * 60_000)

    expect(urls(net).filter(url => url === '/user/daily/activity')).toHaveLength(1)
  })

  test('is told in the debug text', { options: ALERT }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('Alerts   toasts on · warn at 80% · daily alert $5.00')
  })
})

describe('debug', () => {
  test('says the alerts are on and the daily alert off, by default', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('Alerts   toasts on · warn at 80% · daily alert off')
  })

  test('says the chart it draws, and what the proxy said of itself', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/health/readiness': health('1.77.0') } })

    await start($, clock)
    const { text } = await run($, 'debug')

    expect(text).toContain('sorted by spend · chart spend')
    expect(text).toContain('Server   LiteLLM v1.77.0 · database connected')
  })

  test('times the proxy, when the clock moved while it answered', async ($, on) => {
    let wait = async (_ms: number): Promise<void> => {}
    const routes = {
      ...standardRoutes(),
      '/key/info': async () => {
        await wait(150)

        return reply(200, keyBody())
      },
    }
    const { clock } = boot(on, { routes })

    wait = clock.sleep
    await start($, clock)
    await clock.advance(500)

    expect((await run($, 'debug')).text).toContain('Server   150 ms to read /key/info')
  })
})

describe('the pane', () => {
  test('has the allowance, the headroom and today in the overview', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /^\$5\.77\/day to last · now \$0\.53\/day$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^about 396 more requests at \$0\.095 each \(7-day average\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$8\.70 · 90 requests · 4\.7× the usual day \(\$1\.83\)$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^\$8\.70 · 90 requests/ }))?.props.color).toBe('warning')
  })

  test('marks an allowance the pace is over', async ($, on) => {
    const { clock } = boot(on, { routes: spending(42) })

    await start($, clock)
    const ui = await mount($, 'terminal')
    const allowance = await ui.find({ type: 'Text', text: /cut 31%/ })

    expect(allowance?.text).toBe('$1.23/day to last · now $1.79/day (cut 31%)')
    expect(allowance?.props.color).toBe('warning')
  })

  test('leaves the allowance and the headroom out with the pace off', { options: { show_forecast: false } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /to last/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /more requests at/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /the usual day/ })).toBeDefined()
  })

  test('says the time it took to read, and the proxy version, in the details', async ($, on) => {
    let wait = async (_ms: number): Promise<void> => {}
    const routes = {
      ...standardRoutes(),
      '/health/readiness': health('1.77.0'),
      '/key/info': async () => {
        await wait(150)

        return reply(200, keyBody())
      },
    }
    const { clock } = boot(on, { routes })

    wait = clock.sleep
    await start($, clock)
    await clock.advance(500)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-details' })
    expect(await ui.find({ type: 'Text', text: /^v1\.77\.0 · database connected$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^150 ms to read \/key\/info$/ })).toBeDefined()
  })

  describe('the chart', () => {
    test('counts spend, requests and tokens in turn, with a key for it', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect((await ui.find({ key: 'metric' }))?.props).toMatchObject({ label: 'chart: spend', hotkey: 'm' })
      expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\s*\$8\.70$/ })).toBeDefined()

      await ui.press({ key: 'metric' })
      expect((await ui.find({ key: 'metric' }))?.props.label).toBe('chart: requests')
      expect(await ui.find({ type: 'Text', text: /^Requests per day \(UTC\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\s*90$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^40$/ })).toBeDefined()

      await ui.press({ key: 'metric' })
      expect(await ui.find({ type: 'Text', text: /^Tokens per day \(UTC\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\s*1\.7M$/ })).toBeDefined()

      await ui.press({ key: 'metric' })
      expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
    })

    test('keeps the days to pick, whatever it counts', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'metric' })
      expect((await keysOf(ui)).filter(key => key?.startsWith('day-'))).toHaveLength(7)
      await ui.press({ key: 'day-2026-10-03' })
      expect(await ui.find({ type: 'Text', text: /^\$8\.70 · 90 requests · 1\.7M tokens$/ })).toBeDefined()
    })

    test('remembers what it counted for the next session', async ($, on) => {
      const { log, clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'metric' })

      expect(log.stored.prefs).toEqual({ range: 7, sort: 'spend', metric: 'requests' })
    })

    test('starts on the metric it remembers', async ($, on) => {
      const { clock } = boot(on, { store: { prefs: { range: 7, sort: 'spend', metric: 'tokens' } } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^Tokens per day \(UTC\)$/ })).toBeDefined()
    })

    test('ignores a metric it does not know', async ($, on) => {
      const { clock } = boot(on, { store: { prefs: { metric: 'lines' } } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^Spend per day \(UTC\)$/ })).toBeDefined()
    })

    test('draws a line of blocks of what it counts where the bars will not fit', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal', { bodyColumns: 20 })

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'range-30' })
      await ui.press({ key: 'metric' })
      expect(await texts(ui, /^[▁-█]{30}$/)).toHaveLength(1)
    })
  })

  describe('the models that moved', () => {
    test('says by how much each changed against the days before, and which is new', async ($, on) => {
      const { clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^By model, last 7 days · ▲▼ vs the 7 before/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$42\.00 ▲ 250% · 420 requests$/ })).toBeDefined()
      // The sonnet of the full days did what it did before: no arrow, only what it spent.
      expect(await ui.find({ type: 'Text', text: /^\$147\.00 · 1470 requests$/ })).toBeDefined()
    })

    test('has no arrows where the history has nothing to compare, or the range is too long for it', async ($, on) => {
      const { clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      await ui.press({ key: 'range-14' })
      expect(await ui.find({ type: 'Text', text: /▲▼/ })).toBeUndefined()
      await ui.press({ key: 'range-30' })
      expect(await ui.find({ type: 'Text', text: /▲▼/ })).toBeUndefined()
    })

    test('has none on a young history either', async ($, on) => {
      const { clock } = boot(on)

      await start($, clock)
      const ui = await mount($, 'terminal')

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /▲▼/ })).toBeUndefined()
      expect(await texts(ui, /· (new|▲|▼)/)).toEqual([])
    })

    test('keeps the heading short where there is no room to say what the arrows are', async ($, on) => {
      const { clock } = boot(on, { routes: { ...standardRoutes(), ...month() } })

      await start($, clock)
      const ui = await mount($, 'terminal', { bodyColumns: 60 })

      await ui.press({ key: 'tab-usage' })
      expect(await ui.find({ type: 'Text', text: /^By model, last 7 days$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /▲ 250%/ })).toBeDefined()
    })
  })
})
