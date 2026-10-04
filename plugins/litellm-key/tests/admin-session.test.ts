import { describe, expect, test } from 'claude-code/testing'

import { boot, run, start } from './boot'
import { BASE, KEY, keyBody, reply, standardRoutes } from './support'

const ADMIN = 'sk-admin-from-option-99999'
const OPTIONS = { litellm_admin_key: ADMIN }
const NEW_SECRET = 'sk-brand-new-secret-123456'

const routes = (limit = 50) => ({
  ...standardRoutes(),
  '/key/info': () => reply(200, keyBody({ max_budget: limit })),
  '/key/update': reply(200, { key: 'sk-raw-echo-of-the-key-000' }),
  '/key/generate': reply(200, { key: NEW_SECRET, token: 'ab'.repeat(32), key_alias: 'ci' }),
  '/key/delete': reply(200, { deleted_keys: ['ab'.repeat(32)] }),
})

describe('which credentials an admin call carries', () => {
  test('the admin key replaces a virtual key that Claude Code sends in x-litellm-api-key', { options: OPTIONS }, async ($, on) => {
    const { net, clock } = boot(on, {
      env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_CUSTOM_HEADERS: `x-litellm-api-key: Bearer ${KEY}` },
      routes: routes(),
    })

    await start($, clock)
    await run($, 'grant 10 --yes')
    const update = net.calls.find(call => call.url.includes('/key/update'))

    expect(update?.headers.authorization).toBe(`Bearer ${ADMIN}`)
    expect(Object.keys(update?.headers ?? {})).not.toContain('x-litellm-api-key')
    expect(net.calls.find(call => call.url.endsWith('/key/info'))?.headers['x-litellm-api-key']).toBe(`Bearer ${KEY}`)
  })

  test('the admin key never follows a proxy the session key was not accepted by', { options: OPTIONS }, async ($, on) => {
    const settingsEnv: Record<string, string> = { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY }
    const { net, clock } = boot(on, {
      env: {},
      settingsEnv,
      routes: { ...routes(), '/key/info': (url: string) => (url.startsWith('https://other.test') ? reply(503, 'down') : reply(200, keyBody())) },
    })

    await start($, clock)
    settingsEnv.ANTHROPIC_BASE_URL = 'https://other.test'
    const { text } = await run($, 'grant 10 --yes')

    expect(text).toContain('Admin commands wait')
    expect(net.calls.some(call => call.headers.authorization === `Bearer ${ADMIN}`)).toBe(false)
    expect(net.calls.some(call => call.method === 'POST')).toBe(false)
  })
})

describe('after a write', () => {
  test('a refresh asked while a read is in flight waits for it and reads again', { options: OPTIONS }, async ($, on) => {
    const state = { limit: 50, release: () => {}, isFirst: true }
    const { log, clock } = boot(on, {
      routes: {
        ...routes(),
        '/key/info': async () => {
          const body = keyBody({ max_budget: state.limit })

          if (state.isFirst) {
            state.isFirst = false
            await new Promise<void>(resolve => {
              state.release = resolve
            })
          }

          return reply(200, body)
        },
      },
    })

    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await clock.advance(300)
    state.limit = 60
    const refreshing = run($, 'refresh')

    state.release()
    await refreshing
    await clock.advance(300)

    expect(log.statuses.at(-1)).toContain('$12.50 of $60.00')
  })

  test('a clipboard that throws deletes the new key again, end to end', { options: OPTIONS }, async ($, on) => {
    const { net, clock } = boot(on, { routes: routes(), copyThrows: true })

    await start($, clock)
    const { text } = await run($, 'key new ci --budget 5 --yes')

    expect(text).toContain('was deleted again')
    expect(net.calls.some(call => call.url.endsWith('/key/delete'))).toBe(true)
    expect(text).not.toContain(NEW_SECRET)
  })
})
