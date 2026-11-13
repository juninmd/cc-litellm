import { describe, expect, test } from 'claude-code/testing'
import { resolveCredentials } from '../hooks/credentials'
import { forgetHelper } from '../hooks/helper'
import { configOf, sourcesOf } from '../hooks/settings'
import { boot, start, urls } from './boot'
import { sources } from './factories'
import { BASE, KEY, NOW } from './support'

const HELPER = 'vault read -field=key litellm'
const bare = { ANTHROPIC_BASE_URL: BASE }

describe('resolveCredentials with the apiKeyHelper', () => {
  test('uses what the helper printed when nothing before it has a key', () => {
    const resolved = resolveCredentials(sources({ env: bare, helperKey: 'sk-from-helper' }), NOW)

    expect(resolved.ok && resolved.credentials.key).toBe('sk-from-helper')
    expect(resolved.ok && resolved.credentials.keySource).toBe('apiKeyHelper')
  })

  test('the environment keys and the plugin option come first', () => {
    const env = resolveCredentials(sources({ helperKey: 'sk-from-helper' }), NOW)
    const option = resolveCredentials(sources({ env: bare, key: 'sk-option', helperKey: 'sk-from-helper' }), NOW)

    expect(env.ok && env.credentials.keySource).toBe('ANTHROPIC_AUTH_TOKEN')
    expect(option.ok && option.credentials.keySource).toBe('plugin option litellm_key')
  })

  test('strips Bearer and is not sent to a host of another route', () => {
    const bearer = resolveCredentials(sources({ env: bare, helperKey: 'Bearer sk-h' }), NOW)
    const custom = resolveCredentials(sources({ env: bare, url: 'https://other.test', helperKey: 'sk-h' }), NOW)

    expect(bearer.ok && bearer.credentials.headers.authorization).toBe('Bearer sk-h')
    expect(custom.ok).toBe(false)
  })

  test('says why the helper gave nothing', () => {
    const resolved = resolveCredentials(sources({ env: bare, helperError: 'apiKeyHelper exited with 2' }), NOW)

    expect(!resolved.ok && resolved.failure.hint).toContain('apiKeyHelper exited with 2')
  })
})

describe('sourcesOf', () => {
  const config = configOf({})
  const read = (run: () => Promise<{ exitCode: number | null; stdout: string; stderr: string }>, env: Record<string, string> = bare) => ({
    env: async () => env,
    settings: async () => ({ apiKeyHelper: HELPER }),
    now: async () => NOW,
    run,
  })

  test('does not run the helper when another source has a key', async () => {
    forgetHelper()
    let runs = 0
    const found = await sourcesOf(config, read(async () => (runs++, { exitCode: 0, stdout: 'x', stderr: '' }), { ...bare, ANTHROPIC_AUTH_TOKEN: KEY }))

    expect(runs).toBe(0)
    expect(found.helperKey).toBeUndefined()
  })

  test('runs it through a shell, trims, and keeps the answer for five minutes', async () => {
    forgetHelper()
    let runs = 0
    const run = async () => (runs++, { exitCode: 0, stdout: '  sk-h\n', stderr: '' })
    const reader = { ...read(run) }
    const first = await sourcesOf(config, reader)
    const second = await sourcesOf(config, reader)

    expect(first.helperKey).toBe('sk-h')
    expect(second.helperKey).toBe('sk-h')
    expect(runs).toBe(1)
  })

  test('a failing, empty or throwing helper becomes a reason, never a key', async () => {
    const failed = async () => ({ exitCode: 2, stdout: 'sk-leak\n', stderr: 'denied\nmore' })
    const empty = async () => ({ exitCode: 0, stdout: '\n', stderr: '' })
    const timedOut = async () => ({ exitCode: null, stdout: '', stderr: '' })
    const thrown = async (): Promise<never> => {
      throw new Error('spawn sh ENOENT')
    }
    const reasons: (string | null | undefined)[] = []

    for (const run of [failed, empty, timedOut, thrown]) {
      forgetHelper()
      const found = await sourcesOf(config, read(run))

      expect(found.helperKey).toBeUndefined()
      reasons.push(found.helperError)
    }
    expect(reasons).toEqual([
      'apiKeyHelper exited with 2: denied',
      'apiKeyHelper printed nothing',
      'apiKeyHelper timed out',
      'apiKeyHelper did not run: spawn sh ENOENT',
    ])
    expect(reasons.join()).not.toContain('sk-leak')
  })
})

describe('the plugin with an apiKeyHelper', () => {
  test('reads the key from the helper and calls the proxy with it', async ($, on) => {
    forgetHelper()
    const { log, net, clock } = boot(on, { env: bare, apiKeyHelper: HELPER })

    await start($, clock)

    expect(log.runs[0]).toEqual(['sh', '-c', HELPER])
    expect(urls(net)).toContain('/key/info')
    expect(net.calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('without a helper nothing is run', async ($, on) => {
    forgetHelper()
    const { log, clock } = boot(on)

    await start($, clock)
    expect(log.runs).toEqual([])
  })

  test('a failing helper leaves the plugin unconfigured and says so', async ($, on) => {
    forgetHelper()
    const { log, net, clock } = boot(on, { env: bare, apiKeyHelper: HELPER, run: () => ({ exitCode: 1, stdout: '', stderr: 'no token' }) })

    await start($, clock)
    expect(urls(net)).not.toContain('/key/info')
    expect(log.runs.length).toBeGreaterThan(0)
  })
})
