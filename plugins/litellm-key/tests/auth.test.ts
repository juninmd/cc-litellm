import { describe, expect, test } from 'claude-code/testing'
import { authSourceOf, resolveCredentials } from '../hooks/credentials'
import { forgetHelper } from '../hooks/helper'
import { configOf } from '../hooks/settings'
import { boot, run, start } from './boot'
import { sources } from './factories'
import { BASE, KEY, NOW, keyBody, reply, standardRoutes } from './support'

const GOOD = 'sk-good-key-1234567890'
const BAD = 'sk-bad-key-0987654321'
const HELPER = 'vault read key'

// The proxy accepts one key and says 401 to the others.
const routes = () => ({
  ...standardRoutes(),
  '/key/info': (_url: string, headers: Record<string, string>) =>
    headers.authorization === `Bearer ${GOOD}` ? reply(200, keyBody()) : reply(401, { error: { message: 'Authentication Error, Invalid proxy server token' } }),
})
const env = { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: BAD, ANTHROPIC_API_KEY: GOOD }

describe('auth_source', () => {
  test('knows the sources and nothing else', () => {
    expect(authSourceOf('helper')).toBe('helper')
    expect(authSourceOf('auto')).toBeNull()
    expect(authSourceOf('nope')).toBeNull()
    expect(configOf({ auth_source: 'api_key' }).authSource).toBe('api_key')
    expect(configOf({}).authSource).toBeNull()
  })

  test('takes the one source asked for, even when an earlier one has a key', () => {
    const resolved = resolveCredentials(sources({ env, prefer: 'api_key' }), NOW)

    expect(resolved.ok && resolved.credentials.keySource).toBe('ANTHROPIC_API_KEY')
    expect(resolved.ok && resolved.credentials.key).toBe(GOOD)
  })

  test('without a preference the first with a key wins, as before', () => {
    const resolved = resolveCredentials(sources({ env, prefer: null }), NOW)

    expect(resolved.ok && resolved.credentials.keySource).toBe('ANTHROPIC_AUTH_TOKEN')
  })

  test('a source with no key is a failure that names the ones that have one', () => {
    const resolved = resolveCredentials(sources({ env, prefer: 'helper' }), NOW)

    expect(resolved.ok).toBe(false)
    expect(!resolved.ok && resolved.failure.message).toContain('auth_source is "helper"')
    expect(!resolved.ok && resolved.failure.hint).toContain('auth_token, api_key')
  })

  test('a source of another route is not offered', () => {
    const resolved = resolveCredentials(sources({ env, url: 'https://other.test', prefer: 'auth_token' }), NOW)

    expect(resolved.ok).toBe(false)
  })
})

describe('/litellm auth', () => {
  test('tests every source against the proxy and marks the one in use', async ($, on) => {
    forgetHelper()
    const { clock, net } = boot(on, { routes: routes(), env, apiKeyHelper: HELPER, run: () => ({ exitCode: 0, stdout: `${GOOD}\n` }) })

    await start($, clock)
    const before = net.calls.length
    const { text: out, exitCode } = await run($, 'auth')
    const text = out ?? ''
    const row = (id: string) => text.split('\n').find(line => line.includes(` ${id} `)) ?? ''

    expect(row('auth_token')).toContain('►')
    expect(row('auth_token')).toContain('✗')
    expect(row('api_key')).toContain('✓')
    expect(row('helper')).toContain('✓')
    expect(row('header')).toContain('–')
    expect(row('litellm_key')).toContain('–')
    expect(text).toContain('The key in use (auth_token) is not valid. Switch with /litellm auth use api_key or helper')
    expect(exitCode).toBe(3)
    // The same key under two sources (api_key and helper) is asked once.
    const asked = net.calls.slice(before).filter(call => call.url.endsWith('/key/info') && call.headers.authorization === `Bearer ${GOOD}`)

    expect(asked.length).toBe(1)
  })

  test('never prints a key, only its tail', async ($, on) => {
    forgetHelper()
    const { clock } = boot(on, { routes: routes(), env })

    await start($, clock)
    const { text: out } = await run($, 'auth')
    const text = out ?? ''

    expect(text).not.toContain(GOOD)
    expect(text).not.toContain(BAD)
    expect(text).toContain('…7890')
  })

  test('is quiet and exit 0 when the key in use is valid', async ($, on) => {
    forgetHelper()
    const { clock } = boot(on, { routes: routes(), env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: GOOD } })

    await start($, clock)
    const { text: out, exitCode } = await run($, 'auth')
    const text = out ?? ''

    expect(text).toContain('The choice is auto')
    expect(exitCode).toBeUndefined()
  })

  test('says so when no source has a key', async ($, on) => {
    forgetHelper()
    const { clock } = boot(on, { routes: routes(), env: { ANTHROPIC_BASE_URL: BASE } })

    await start($, clock)
    const { text: out, exitCode } = await run($, 'auth')
    const text = out ?? ''

    expect(text).toContain('No source has a key')
    expect(exitCode).toBe(3)
  })
})

describe('/litellm auth use', () => {
  const nothing = { routes: routes(), env }

  test('keeps a valid source, and the next readings use it', async ($, on) => {
    forgetHelper()
    const { clock, net, log } = boot(on, nothing)

    await start($, clock)
    expect((await run($, 'auth use api_key')).text).toContain('Using api_key (ANTHROPIC_API_KEY, sk-…7890) from now on')
    expect(log.stored.authSource).toBe('api_key')
    await clock.advance(1000)
    const last = net.calls.filter(call => call.url.endsWith('/key/info')).at(-1)

    expect(last?.headers.authorization).toBe(`Bearer ${GOOD}`)
    expect((await run($, 'auth')).text).toContain('The choice is api_key')
  })

  test('refuses a source the proxy rejects, unless forced', async ($, on) => {
    forgetHelper()
    const { clock, log } = boot(on, nothing)

    await start($, clock)
    const refused = await run($, 'auth use auth_token')

    expect(refused.text).toContain('The proxy does not accept auth_token')
    expect(refused.exitCode).toBe(3)
    expect(log.stored.authSource).toBeUndefined()
    expect((await run($, 'auth use auth_token --force')).text).toContain('forced')
    expect(log.stored.authSource).toBe('auth_token')
  })

  test('refuses a source with no key, and a name that is not a source', async ($, on) => {
    forgetHelper()
    const { clock, log } = boot(on, nothing)

    await start($, clock)
    expect((await run($, 'auth use helper')).text).toContain('helper has no key')
    expect((await run($, 'auth use nope')).text).toContain('"nope" is not a source')
    expect((await run($, 'auth use')).text).toContain('Usage: /litellm auth use')
    expect(log.stored.authSource).toBeUndefined()
  })

  test('auto undoes the choice', async ($, on) => {
    forgetHelper()
    const { clock, log } = boot(on, { ...nothing, store: { authSource: 'api_key' } })

    await start($, clock)
    expect((await run($, 'auth use auto')).text).toContain('auto')
    expect(log.stored.authSource).toBe('auto')
    // Back to the first with a key: the rejected auth_token is the one in use again.
    const line = ((await run($, 'auth')).text ?? '').split('\n').find(found => found.includes(' auth_token '))

    expect(line).toContain('►')
  })

  test('a stored choice wins over the option', async ($, on) => {
    forgetHelper()
    const { clock } = boot(on, { ...nothing, store: { authSource: 'api_key' } })

    await start($, clock)
    const text = (await run($, 'auth')).text ?? ''

    expect(text.split('\n').find(line => line.includes(' api_key '))).toContain('►')
  })
})
