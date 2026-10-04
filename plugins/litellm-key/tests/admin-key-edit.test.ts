import { describe, expect, test } from 'claude-code/testing'

import { runAdmin } from '../hooks/admin-commands'
import { RAW_LEAK, depsOf, fakeProxy, hashOf } from './fake-proxy'

const set = (deps: ReturnType<typeof depsOf>, input: string) => runAdmin(deps, 'key', `set ${input}`)
const reset = (deps: ReturnType<typeof depsOf>, input: string) => runAdmin(deps, 'key', `reset-spend ${input}`)

describe('/litellm key set', () => {
  test('changes models and limits, and reports what the proxy now says', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await set(depsOf(fake), 'alice-ci --models cloud/auto,cloud/auto-long --rpm 120 --tpm 50000 --parallel 4 --yes')

    expect(fake.writes()).toHaveLength(1)
    expect(fake.writes()[0]).toMatchObject({
      path: '/key/update',
      body: { key: hashOf(1), models: ['cloud/auto', 'cloud/auto-long'], rpm_limit: 120, tpm_limit: 50000, max_parallel_requests: 4 },
    })
    expect(text).toContain('Updated key "alice-ci":')
    expect(text).toContain('models   cloud/auto, cloud/auto-long')
    expect(text).toContain('rpm      120')
    expect(text).toContain('tpm      50k')
    expect(isChanged).toBe(true)
  })

  test('previews before → after in the dialog, and applies nothing when cancelled', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)

    deps.ask = async question => {
      deps.asked.push(question)

      return 'Cancel'
    }
    const { text } = await set(deps, 'alice-ci --models cloud/auto-long --rpm none')

    expect(deps.asked[0]).toContain('models   cloud/auto → cloud/auto-long')
    expect(deps.asked[0]).toContain('rpm      60 → none')
    expect(deps.asked[0]).toContain('Apply this change?')
    expect(text).toContain('Cancelled')
    expect(fake.writes()).toHaveLength(0)
  })

  test('--models all means every model in any casing, and is refused beside names or as a stray flag', async () => {
    for (const input of ['alice-ci --models All --yes', 'alice-ci --models ALL --yes']) {
      const fake = fakeProxy()

      await set(depsOf(fake), input)
      expect(fake.writes()[0]?.body).toMatchObject({ models: [] })
    }
    for (const input of ['alice-ci --models all,cloud/auto --yes', 'alice-ci --models --yes']) {
      const fake = fakeProxy()
      const { text } = await set(depsOf(fake), input)

      expect(text).toContain('--models takes model names')
      expect(fake.writes()).toHaveLength(0)
    }
  })

  test('never expires on a key that already never expires changes nothing', async () => {
    const fake = fakeProxy()
    const { text } = await set(depsOf(fake), 'bob-dev --expires never --yes')

    expect(text).toContain('nothing to change')
    expect(fake.writes()).toHaveLength(0)
  })

  test('says so when a limit survives its removal because a linked budget table holds it', async () => {
    const row = { token: hashOf(7), key_alias: 'linked', key_name: 'sk-...7777', spend: 0, max_budget: null, user_id: 'carol', rpm_limit: null, litellm_budget_table: { rpm_limit: 60 } }
    const { text } = await set(depsOf(fakeProxy({ rows: [row] })), 'linked --rpm none --yes')

    expect(text).toContain('Updated key "linked":')
    expect(text).toContain('rpm is still 60')
  })

  test('none removes a limit (null), all models is an empty list, never expires is -1', async () => {
    const fake = fakeProxy()

    await set(depsOf(fake), 'alice-ci --rpm none --models all --expires never --yes')
    expect(fake.writes()[0]?.body).toEqual({ key: hashOf(1), rpm_limit: null, models: [], duration: '-1' })
    expect(fake.keys.get(hashOf(1))?.expires).toBeNull()
  })

  test('an expiry counts from now, and a new alias is what the answer calls the key', async () => {
    const fake = fakeProxy()
    const { text } = await set(depsOf(fake), 'alice-ci --expires 30d --alias alice-ci-v2 --yes')

    expect(fake.writes()[0]?.body).toMatchObject({ duration: '30d', key_alias: 'alice-ci-v2' })
    expect(text).toContain('Updated key "alice-ci-v2":')
    expect(text).toContain('expires  in 30d')
    expect(text).toContain('alias    alice-ci-v2')
  })

  test('warns when it is the key Claude Code is using, and changes nothing on --dry-run', async () => {
    const fake = fakeProxy()
    const { text } = await set(depsOf(fake), 'alice-ci --rpm 5 --dry-run')

    expect(text).toContain('this is the key Claude Code is using right now')
    expect(text).toContain('(dry run: nothing changed)')
    expect(fake.writes()).toHaveLength(0)
  })

  test('says so when nothing would change', async () => {
    const fake = fakeProxy()

    expect((await set(depsOf(fake), 'alice-ci --rpm 60 --models cloud/auto --yes')).text).toContain('nothing to change')
    expect(fake.writes()).toHaveLength(0)
  })

  test('rejects what it cannot read, before any request is written', async () => {
    const fake = fakeProxy()
    const text = async (input: string): Promise<string> => (await set(depsOf(fake), input)).text

    expect(await text('alice-ci --yes')).toContain('Nothing to change')
    expect(await text('alice-ci --rpn 5 --yes')).toContain('Unknown option --rpn')
    expect(await text('alice-ci --rpm 0 --yes')).toContain('--rpm must be a whole number above 0, or none')
    expect(await text('alice-ci --rpm abc --yes')).toContain('--rpm must be')
    expect(await text('alice-ci --models ,, --yes')).toContain('--models takes model names')
    expect(await text('alice-ci --expires 5x --yes')).toContain('--expires must be')
    expect(await text('alice-ci --alias "bad alias" --yes')).toContain('--alias is not a valid')
    expect(await text('--rpm 5 --yes')).toContain('Which key')
    expect(await text('ghost --rpm 5 --yes')).toContain('No key with the alias "ghost"')
    expect(fake.writes()).toHaveLength(0)
  })

  test('never prints the raw key the proxy sends back', async () => {
    const fake = fakeProxy()
    const { text } = await set(depsOf(fake), 'alice-ci --rpm 5 --yes')

    expect(text).not.toContain(RAW_LEAK)
  })
})

describe('/litellm key reset-spend', () => {
  test('sets the counter back to zero and says from what', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await reset(depsOf(fake), 'alice-ci --yes')

    expect(fake.writes()[0]).toMatchObject({ method: 'POST', path: `/key/${hashOf(1)}/reset_spend`, body: { reset_to: 0 } })
    expect(text).toBe('Key "alice-ci": spend $0.09 → $0.00.')
    expect(fake.keys.get(hashOf(1))?.spend).toBe(0)
    expect(isChanged).toBe(true)
  })

  test('previews the room it gives back, and stops on --dry-run', async () => {
    const fake = fakeProxy()
    const { text } = await reset(depsOf(fake), 'alice-ci --dry-run')

    expect(text).toContain('spend    $0.09 → $0.00')
    expect(text).toContain('budget   $5.00 (2% used) → $5.00 would be left')
    expect(text).toContain('(dry run: nothing changed)')
    expect(fake.writes()).toHaveLength(0)
  })

  test('has nothing to do for a key that has spent nothing', async () => {
    const fake = fakeProxy({ rows: [{ token: hashOf(7), key_alias: 'fresh', spend: 0, max_budget: 5 }] })

    expect((await reset(depsOf(fake), 'fresh --yes')).text).toContain('no spend to reset')
    expect(fake.writes()).toHaveLength(0)
  })

  test('asks for a key, and refuses a raw sk- value', async () => {
    const fake = fakeProxy()

    expect((await reset(depsOf(fake), '--yes')).text).toContain('Which key')
    expect((await reset(depsOf(fake), 'sk-abcdefghijklmnop --yes')).text).toContain('Do not paste a key')
    expect(fake.writes()).toHaveLength(0)
  })
})
