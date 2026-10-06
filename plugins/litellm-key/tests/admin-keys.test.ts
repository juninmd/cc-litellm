import { describe, expect, test } from 'claude-code/testing'

import { runAdmin } from '../hooks/admin-commands'
import { ADMIN_KEY, OWN_KEY, depsOf, fakeProxy, hashOf } from './fake-proxy'

const run = (deps: ReturnType<typeof depsOf>, command: 'keys' | 'key' | 'grant' | 'fallbacks', input: string) =>
  runAdmin(deps, command, input)

describe('/litellm keys', () => {
  test('lists the keys of the key owner by default, with spend, budget, status and a short hash', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'keys', '')

    expect(text).toContain('1 key · user alice')
    expect(text).toContain('alice-ci')
    expect(text).toContain('$0.09 / $5.00 (2%)')
    expect(text).toContain('active')
    expect(text).toContain(hashOf(1).slice(0, 8))
    expect(text).not.toContain('bob-dev')
  })

  test('--all drops the owner filter and --team filters by team', async () => {
    const fake = fakeProxy()
    const all = await run(depsOf(fake), 'keys', '--all')
    const team = await run(depsOf(fake), 'keys', '--team team-1')

    expect(all.text).toContain('2 keys · all keys')
    expect(all.text).toContain('no cap')
    expect(team.text).toContain('team team-1')
    expect(team.text).toContain('bob-dev')
    expect(team.text).not.toContain('alice-ci')
  })

  test('shows blocked keys as blocked', async () => {
    const fake = fakeProxy()

    fake.keys.get(hashOf(2))!.blocked = true
    expect((await run(depsOf(fake), 'keys', '--all')).text).toContain('blocked')
  })

  test('a key that may not manage keys is told to set litellm_admin_key', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake, {}, { headers: { authorization: `Bearer ${OWN_KEY}` }, isOwnKey: true }), 'keys', '')

    expect(text).toContain('proxy admin key')
    expect(text).toContain('litellm_admin_key')
    expect(text).not.toContain(OWN_KEY)
  })

  test('a refused admin key says so instead of suggesting the same fix', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake, {}, { headers: { authorization: `Bearer ${OWN_KEY}` } }), 'keys', '')

    expect(text).toContain('admin key was refused')
  })

  test('rejects an unknown option instead of ignoring it', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'keys', '--usr alice')

    expect(text).toContain('Unknown option --usr')
    expect(fake.calls).toHaveLength(0)
  })
})

describe('/litellm key new', () => {
  const NEW = 'new ci-bot --budget 10 --every 30d --models cloud/auto,cloud/auto-long --rpm 60 --tpm 100000 --expires 30d --user alice --yes'

  test('creates the key with every requested field and hands it over through the clipboard only', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)
    const { text, isChanged } = await run(deps, 'key', NEW)
    const [write] = fake.writes()

    expect(write?.path).toBe('/key/generate')
    expect(write?.body).toEqual({
      key_alias: 'ci-bot',
      max_budget: 10,
      budget_duration: '30d',
      models: ['cloud/auto', 'cloud/auto-long'],
      rpm_limit: 60,
      tpm_limit: 100000,
      duration: '30d',
      user_id: 'alice',
    })
    expect(write?.auth).toBe(`Bearer ${ADMIN_KEY}`)
    expect(deps.copied).toEqual(['sk-generated-secret-101'])
    expect(text).toContain('Created key "ci-bot" · sk-…-101')
    expect(text).toContain('Copied to the clipboard')
    expect(text).not.toContain('sk-generated-secret-101')
    expect(isChanged).toBe(true)
  })

  test('--reveal prints the key, and says it is now in the transcript', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)
    const { text } = await run(deps, 'key', 'new ci-bot --yes --reveal')

    expect(text).toContain('Key: sk-generated-secret-101')
    expect(text).toContain('transcript')
    expect(deps.copied).toEqual([])
  })

  test('without a clipboard (headless) it refuses before creating anything', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await run(depsOf(fake, { surfaces: [] }), 'key', 'new ci-bot --yes')

    expect(text).toContain('--reveal')
    expect(fake.writes()).toHaveLength(0)
    expect(isChanged).toBe(false)
  })

  test('a clipboard that fails rolls the key back instead of keeping one nobody can read', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake, { copy: async () => false })
    const { text } = await run(deps, 'key', 'new ci-bot --yes')

    expect(fake.writes().map(call => call.path)).toEqual(['/key/generate', '/key/delete'])
    expect(fake.writes()[1]?.body).toEqual({ keys: [hashOf(101)] })
    expect(fake.keys.has(hashOf(101))).toBe(false)
    expect(text).toContain('deleted again')
    expect(text).not.toContain('sk-generated-secret')
  })

  test('when the rollback fails too, it says how to block the orphan', async () => {
    const fake = fakeProxy()
    const send: typeof fake.send = (url, init) =>
      url.endsWith('/key/delete') ? Promise.resolve({ status: 500, text: '{"error":{"message":"db down"}}' }) : fake.send(url, init)
    const { text } = await run({ ...depsOf(fake, { copy: async () => false }), admin: { ...depsOf(fake).admin, send } }, 'key', 'new ci-bot --yes')

    expect(text).toContain('/litellm key block ci-bot')
    expect(text).not.toContain('sk-generated-secret')
  })

  test('asks first through the dialog and creates nothing when it is cancelled', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake, { ask: async () => 'Cancel' })
    const { text } = await run(deps, 'key', 'new ci-bot --budget 5')

    expect(text).toContain('Create key "ci-bot"')
    expect(text).toContain('Cancelled')
    expect(fake.writes()).toHaveLength(0)
  })

  test('a dismissed dialog falls back to the preview and asks for --yes', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake, {
      ask: async () => {
        throw new Error('dismissed')
      },
    })
    const { text } = await run(deps, 'key', 'new ci-bot --budget 5')

    expect(text).toContain('Run it again with --yes')
    expect(fake.writes()).toHaveLength(0)
  })

  test('--dry-run only previews, with no dialog', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)
    const { text } = await run(deps, 'key', 'new ci-bot --budget 5 --dry-run')

    expect(text).toContain('dry run')
    expect(deps.asked).toEqual([])
    expect(fake.writes()).toHaveLength(0)
  })

  test('--yes skips the dialog', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)

    await run(deps, 'key', 'new ci-bot --budget 5 --yes')
    expect(deps.asked).toEqual([])
  })

  test('the preview spells out what is NOT limited, so a missing --budget is visible', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'key', 'new ci-bot --dry-run')

    expect(text).toContain('no cap (unlimited spend)')
    expect(text).toContain('all models')
    expect(text).toContain('expires  never')
  })

  test('a mistyped option stops everything, because it would silently drop a limit', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'key', 'new ci-bot --budjet 10 --yes')

    expect(text).toContain('Unknown option --budjet')
    expect(fake.calls).toHaveLength(0)
  })

  test('validates every value before any request', async () => {
    const fake = fakeProxy()
    const bad = [
      'new',
      'new ci-bot extra --yes',
      'new ci-bot --budget -5 --yes',
      'new ci-bot --budget abc --yes',
      'new ci-bot --every 30d --yes',
      'new ci-bot --budget 10 --every 30x --yes',
      'new ci-bot --budget 10 --soft 10 --yes',
      'new ci-bot --rpm 0 --yes',
      'new ci-bot --expires soon --yes',
      'new ci-bot --models "a b" --yes',
      'new "bad alias!" --yes',
      'new ci-bot --user "a;b" --yes',
    ]

    for (const input of bad) {
      expect((await run(depsOf(fake), 'key', input)).isChanged).toBe(false)
    }
    expect(fake.calls).toHaveLength(0)
  })

  test('a taken alias comes back as the proxy words it, and nothing is copied', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)
    const { text } = await run(deps, 'key', 'new alice-ci --yes')

    expect(text).toContain("already exists")
    expect(deps.copied).toEqual([])
  })

  test('shows usage for a bare /litellm key', async () => {
    expect((await run(depsOf(fakeProxy()), 'key', '')).text).toContain('/litellm key new <alias>')
  })
})

describe('/litellm key block and unblock', () => {
  test('blocks by alias, sending the hash, never a raw key', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await run(depsOf(fake), 'key', 'block bob-dev --yes')

    expect(fake.writes()).toHaveLength(1)
    expect(fake.writes()[0]).toMatchObject({ path: '/key/block', body: { key: hashOf(2) } })
    expect(text).toContain('Blocked key "bob-dev"')
    expect(isChanged).toBe(true)
  })

  test('unblocks', async () => {
    const fake = fakeProxy()

    fake.keys.get(hashOf(2))!.blocked = true
    await run(depsOf(fake), 'key', 'unblock bob-dev --yes')
    expect(fake.writes()[0]?.path).toBe('/key/unblock')
    expect(fake.keys.get(hashOf(2))?.blocked).toBe(false)
  })

  test('warns when the key to block is the one Claude Code is using', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'key', `block ${hashOf(1)} --dry-run`)

    expect(text).toContain('the key Claude Code is using right now')
  })

  test('refuses a pasted secret key without calling the proxy', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'key', `block ${OWN_KEY} --yes`)

    expect(text).toContain('Do not paste a key')
    expect(text).not.toContain(OWN_KEY)
    expect(fake.calls).toHaveLength(0)
  })

  test('an unknown alias is not found, and a missing alias asks which key', async () => {
    const fake = fakeProxy()

    expect((await run(depsOf(fake), 'key', 'block ghost --yes')).text).toContain('No key with the alias "ghost"')
    expect((await run(depsOf(fake), 'key', 'block --yes')).text).toContain('Which key?')
    expect(fake.writes()).toHaveLength(0)
  })

  test('waits for confirmation', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake, { ask: async () => 'Cancel' })

    await run(deps, 'key', 'block bob-dev')
    expect(fake.writes()).toHaveLength(0)
  })
})
