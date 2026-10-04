import { describe, expect, test } from 'claude-code/testing'
import { boot, run, start } from './boot'
import { HASH, KEY, keyBody, reply, standardRoutes } from './support'

describe('admin commands', () => {
  const ADMIN = 'sk-admin-from-option-99999'
  const NEW_SECRET = 'sk-brand-new-secret-123456'
  const only = reply(401, { error: { message: 'Authentication Error, Only proxy admin can be used to generate, delete, update info for new keys/users/teams.', type: 'auth_error', param: 'None', code: '401' } })
  const adminRoutes = (state = { limit: 50 }) => ({
    ...standardRoutes(),
    '/key/info': () => reply(200, keyBody({ max_budget: state.limit })),
    '/key/update': (_url: string, _headers: Record<string, string>, init?: { body?: string }) => {
      state.limit = (JSON.parse(init?.body ?? '{}') as { max_budget: number }).max_budget

      return reply(200, { key: 'sk-raw-echo-of-the-key-000', max_budget: state.limit })
    },
    '/key/generate': reply(200, { key: NEW_SECRET, token: 'ab'.repeat(32), key_name: 'sk-...3456', key_alias: 'ci' }),
  })
  const OPTIONS = { litellm_admin_key: ADMIN }

  test('a grant goes out with the admin key, not the virtual one, and the status line catches up', { options: OPTIONS }, async ($, on) => {
    const { log, net, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const { text } = await run($, 'grant 10 --yes')

    await clock.advance(300)
    const update = net.calls.find(call => call.url.includes('/key/update'))

    expect(update?.method).toBe('POST')
    expect(update?.headers.authorization).toBe(`Bearer ${ADMIN}`)
    expect(JSON.parse(update?.body ?? '{}')).toEqual({ key: HASH, max_budget: 60 })
    expect(text).toContain('now has a budget of $60.00')
    expect(text).not.toContain('sk-raw-echo')
    expect(log.statuses.at(-1)).toContain('$12.50 of $60.00')
    expect(net.calls.filter(call => call.url.endsWith('/key/info')).every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('key new puts the secret on the clipboard and keeps it out of the answer and the logs', async ($, on) => {
    const { log, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const { text } = await run($, 'key new ci --budget 5 --yes')

    expect(log.copies).toEqual([NEW_SECRET])
    expect(text).toContain('Copied to the clipboard')
    expect(text).not.toContain(NEW_SECRET)
    expect(JSON.stringify(log.statuses) + JSON.stringify(log.toasts)).not.toContain(NEW_SECRET)
  })

  test('key new without a screen to copy to refuses, unless --reveal is given', async ($, on) => {
    const { net, clock } = boot(on, { routes: adminRoutes(), surfaces: [] })

    await start($, clock)
    const { text } = await run($, 'key new ci --yes')

    expect(text).toContain('--reveal')
    expect(net.calls.some(call => call.method === 'POST')).toBe(false)
  })

  test('without litellm_admin_key the virtual key is what asks, and a refusal names the fix', async ($, on) => {
    const { net, clock } = boot(on, { routes: { ...adminRoutes(), '/key/list': only } })

    await start($, clock)
    const { text } = await run($, 'keys')
    const call = net.calls.find(item => item.url.includes('/key/list'))

    expect(call?.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(text).toContain('litellm_admin_key')
  })

  test('a rejected session key explains why the admin key stays unused', { options: OPTIONS }, async ($, on) => {
    const expired = reply(401, { error: { message: 'Authentication Error - Expired Key. Key Expiry time 2026-10-01 and current time 2026-10-03', type: 'expired_key', param: 'None', code: '401' } })
    const { net, clock } = boot(on, { routes: { ...adminRoutes(), '/key/info': expired } })

    await start($, clock)
    const { text } = await run($, 'keys --all')

    expect(text).toContain('expired')
    expect(text).toContain('Admin commands wait until the proxy accepts this session')
    expect(net.calls.some(call => call.headers.authorization === `Bearer ${ADMIN}`)).toBe(false)
  })

  test('says why it cannot run when Claude Code is not behind a proxy', async ($, on) => {
    const { net, clock } = boot(on, { env: {} })

    await start($, clock)
    const { text } = await run($, 'grant 10 --yes')

    expect(text).toContain('not routed through a LiteLLM proxy')
    expect(net.calls).toHaveLength(0)
  })

  test('debug shows the admin key masked, help lists the new commands', { options: OPTIONS }, async ($, on) => {
    const { log, clock } = boot(on, { routes: adminRoutes() })

    await start($, clock)
    const debug = (await run($, 'debug')).text
    const help = (await run($, 'help')).text

    expect(debug).toContain('Admin    sk-…9999')
    expect(debug).not.toContain(ADMIN)
    for (const word of ['keys', 'key new', 'grant', 'fallbacks']) {
      expect(help).toContain(`/litellm ${word}`)
    }
    expect(JSON.stringify(log)).not.toContain(ADMIN)
  })

  test('fallbacks reads the router settings', async ($, on) => {
    const routes = {
      ...adminRoutes(),
      '/router/settings': reply(200, { current_values: { fallbacks: [{ 'cloud/auto': ['cloud/auto-long'] }] } }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)

    expect((await run($, 'fallbacks')).text).toContain('cloud/auto  → cloud/auto-long')
  })
})
