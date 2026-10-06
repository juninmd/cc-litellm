import { describe, expect, test } from 'claude-code/testing'
import { boot, run, start, urls } from './boot'
import { BASE, KEY } from './support'

describe('session start', () => {
  test('registers /litellm, reads the key and pins the status line', async ($, on) => {
    const { log, net, clock } = boot(on)

    await start($, clock)

    expect(log.commands).toEqual(['litellm'])
    expect(urls(net)).toContain('/key/info')
    expect(log.statuses.at(-1)).toBe('██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('re-reads on the refresh interval and not before', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = urls(net).filter(url => url === '/key/info').length

    await clock.advance(59_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first)
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first + 1)
  })

  test('a finished turn triggers a throttled re-read', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    await clock.advance(25_000)
    const before = urls(net).filter(url => url === '/key/info').length

    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)

    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
    await clock.advance(2_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)
  })

  test('says nothing in the status line when Claude Code is not behind a proxy', async ($, on) => {
    const { log, net, clock } = boot(on, { env: {} })

    await start($, clock)

    expect(net.calls).toHaveLength(0)
    expect(log.statuses.at(-1)).toBeUndefined()
    expect(log.toasts).toEqual(['Not configured. Run /litellm for setup help.'])
  })
})

describe('/litellm', () => {
  test('info prints the whole summary and never the key', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('prod-claude')
    expect(text).toContain('$12.50 / $50.00')
    expect(text).toContain('eng-platform')
    expect(text).not.toContain(KEY)
  })

  test('opens the pane and answers with one line', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const { text } = await run($, '')

    expect(log.opens).toEqual(['litellm-key'])
    expect(text).toBe('██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
  })

  test('falls back to text when nothing draws (headless)', async ($, on) => {
    const { log, clock } = boot(on, { surfaces: [] })

    await start($, clock)
    const { text } = await run($, '')

    expect(log.opens).toHaveLength(0)
    expect(text).toContain('prod-claude · sk-...7890')
  })

  test('says why the pane could not open', async ($, on) => {
    const { clock } = boot(on, { open: { isPlaced: false, reason: 'too narrow' } })

    await start($, clock)
    const { text } = await run($, 'pane')

    expect(text).toContain('too narrow')
  })

  test('refresh reads again at once, even inside the throttle window', async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const before = urls(net).filter(url => url === '/key/info').length

    await run($, 'refresh')
    expect(urls(net).filter(url => url === '/key/info').length).toBe(before + 1)
  })

  test('models lists what the key can call', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'models')).text).toBe('Models (3): claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5')
  })

  test('debug says where the url and the key come from, without the key', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const { text } = await run($, 'debug')

    expect(text).toContain('litellm.test')
    expect(text).toContain('from ANTHROPIC_AUTH_TOKEN')
    expect(text).toContain('sk-…7890')
    expect(text).not.toContain(KEY)
  })

  test('debug says whether the compact pane is on', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('compact pane off')
  })

  test('debug says the compact pane is on when the option asks for it', { options: { compact_pane: true } }, async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('compact pane on')
  })

  test('close and help and a typo', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect((await run($, 'close')).text).toBe('Pane closed.')
    expect(log.closes).toEqual(['litellm-key'])
    expect((await run($, 'help')).text).toContain('/litellm refresh')
    expect((await run($, 'wat')).text).toContain('Unknown option "wat"')
  })

  test('explains the setup when there is nothing to read', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)
    const { text } = await run($, 'info')

    expect(text).toContain('ANTHROPIC_BASE_URL is not set')
    expect(text).toContain('claude plugin configure litellm-key')
  })

  test('reads the url and key from the settings.json env block too', async ($, on) => {
    const { net, clock } = boot(on, {
      env: {},
      settingsEnv: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY },
    })

    await start($, clock)

    expect(urls(net)).toContain('/key/info')
  })
})

describe('first command', () => {
  test('a command that arrives before the first read waits for it and sees the result', async ($, on) => {
    boot(on)

    const { text } = await run($, 'debug')

    expect(text).toContain('Result   ok at')
  })

  test('info as the very first thing also has the data', async ($, on) => {
    boot(on)

    expect((await run($, 'info')).text).toContain('prod-claude')
  })
})

describe('options', () => {
  const OWN = { litellm_url: 'https://other.test', litellm_key: 'sk-from-option-123456' }

  test('litellm_url and litellm_key win over the environment', { options: OWN }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)

    expect(net.calls.length).toBeGreaterThan(0)
    for (const call of net.calls) {
      expect(call.url.startsWith('https://other.test/')).toBe(true)
      expect(call.headers.authorization).toBe('Bearer sk-from-option-123456')
    }
  })

  test('show_status_line off keeps the line empty', { options: { show_status_line: false } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.statuses.every(line => line === undefined)).toBe(true)
  })

  test('show_related and show_usage off skip those endpoints', { options: { show_related: false, show_usage: false } }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)

    expect(urls(net)).toEqual(['/key/info', '/v1/models', '/model_group/info'])
  })

  test('refresh_seconds sets the interval', { options: { refresh_seconds: 30 } }, async ($, on) => {
    const { net, clock } = boot(on)

    await start($, clock)
    const first = urls(net).filter(url => url === '/key/info').length

    await clock.advance(31_000)
    expect(urls(net).filter(url => url === '/key/info').length).toBe(first + 1)
  })

  test('warn_percent moves the first warning', { options: { warn_percent: 20 } }, async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect(log.toasts).toEqual(['25% of the key budget is used ($12.50 of $50.00)'])
  })
})
