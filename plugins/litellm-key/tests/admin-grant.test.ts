import { describe, expect, test } from 'claude-code/testing'

import { runAdmin } from '../hooks/admin-commands'
import { ADMIN_KEY, OWN_KEY, RAW_LEAK, depsOf, fakeProxy, hashOf } from './fake-proxy'

const run = (deps: ReturnType<typeof depsOf>, command: 'keys' | 'key' | 'grant' | 'fallbacks', input: string) =>
  runAdmin(deps, command, input)

describe('/litellm grant', () => {
  test('adds to a key found by alias and reads the new budget back', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await run(depsOf(fake), 'grant', '10 --key alice-ci --yes')

    expect(fake.writes()).toHaveLength(1)
    expect(fake.writes()[0]).toMatchObject({ path: '/key/update', body: { key: hashOf(1), max_budget: 15 } })
    expect(text).toContain('now has a budget of $15.00')
    expect(isChanged).toBe(true)
  })

  test('previews the change before asking, in the dialog and in the answer', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)

    deps.ask = async question => {
      deps.asked.push(question)

      return 'Cancel'
    }
    const { text } = await run(deps, 'grant', '10 --key alice-ci')

    expect(deps.asked[0]).toContain('$5.00 → $15.00 (+$10.00) per 30d')
    expect(deps.asked[0]).toContain('Apply this budget?')
    expect(text).toContain('Cancelled')
    expect(fake.writes()).toHaveLength(0)
  })

  test('--set writes the absolute budget', async () => {
    const fake = fakeProxy()

    await run(depsOf(fake), 'grant', '50 --key alice-ci --set --yes')
    expect(fake.writes()[0]?.body).toMatchObject({ max_budget: 50 })
  })

  test('without a target it tops up the key Claude Code uses', async () => {
    const fake = fakeProxy()

    await run(depsOf(fake), 'grant', '$2.50 --yes')
    expect(fake.writes()[0]?.body).toMatchObject({ key: hashOf(1), max_budget: 7.5 })
  })

  test('adds to a user: someone else gets extra budget, for every key they own', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'grant', '5 --user alice --yes')

    expect(fake.writes()[0]).toMatchObject({ path: '/user/update', body: { user_id: 'alice', max_budget: 25 } })
    expect(text).toContain('user "alice@acme.test" now has a budget of $25.00')
    expect((await run(depsOf(fake), 'grant', '5 --user alice --dry-run')).text).toContain('applies to every key it owns')
  })

  test('the preview names the role of the user who would get the budget', async () => {
    const { text } = await run(depsOf(fakeProxy()), 'grant', '5 --user alice --dry-run')

    expect(text).toContain('role     internal_user')
  })

  test('a user the proxy does not know needs --set, and the preview says it would be created', async () => {
    const fake = fakeProxy()

    expect((await run(depsOf(fake), 'grant', '5 --user carol --yes')).text).toContain('no budget cap')
    const { text } = await run(depsOf(fake), 'grant', '5 --user carol --set --dry-run')

    expect(text).toContain('creates one')
    expect(fake.writes()).toHaveLength(0)
  })

  test('adds to a team by id or by alias', async () => {
    const fake = fakeProxy()

    await run(depsOf(fake), 'grant', '25 --team team-1 --yes')
    expect(fake.writes()[0]).toMatchObject({ path: '/team/update', body: { team_id: 'team-1', max_budget: 125 } })
    await run(depsOf(fake), 'grant', '25 --team platform-eng --yes')
    expect(fake.writes()[1]).toMatchObject({ path: '/team/update', body: { team_id: 'team-1', max_budget: 150 } })
    expect((await run(depsOf(fake), 'grant', '1 --team nope --yes')).text).toContain('No team "nope"')
  })

  test('a key without a cap has nothing to add to: it says to use --set', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'grant', '10 --key bob-dev --yes')

    expect(text).toContain('--set 10')
    expect(fake.writes()).toHaveLength(0)
  })

  test('refuses nonsense amounts and several targets before any request', async () => {
    const fake = fakeProxy()

    for (const input of ['', 'abc --yes', '-5 --yes', '0 --yes', '1e9 --yes', '10 --key a --user b --yes', '10 11 --yes', '10 --bogus --yes']) {
      expect((await run(depsOf(fake), 'grant', input)).isChanged).toBe(false)
    }
    expect(fake.calls).toHaveLength(0)
  })

  test('says so when the budget is already what was asked', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'grant', '5 --key alice-ci --set --yes')

    expect(text).toContain('nothing to change')
    expect(fake.writes()).toHaveLength(0)
  })

  test('warns when the new budget is still below what was spent', async () => {
    const fake = fakeProxy({ rows: [{ token: hashOf(1), key_alias: 'alice-ci', spend: 9, max_budget: 5, user_id: 'alice' }] })
    const { text } = await run(depsOf(fake), 'grant', '2 --key alice-ci --dry-run')

    expect(text).toContain('over, so requests stay blocked')
  })

  test('never prints the raw key that /key/update echoes back', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'grant', '10 --key alice-ci --yes')

    expect(text).not.toContain(RAW_LEAK)
    expect(JSON.stringify(fake.calls)).toContain(hashOf(1))
  })

  test('a key that may not manage budgets is told to set litellm_admin_key', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake, {}, { headers: { authorization: `Bearer ${OWN_KEY}` }, isOwnKey: true }), 'grant', '10 --yes')

    expect(text).toContain('litellm_admin_key')
    expect(fake.writes().every(call => call.auth === `Bearer ${OWN_KEY}`)).toBe(true)
  })
})

describe('/litellm fallbacks', () => {
  test('shows every chain, the context window chains and the router policy', async () => {
    const { text } = await run(depsOf(fakeProxy()), 'fallbacks', '')

    expect(text).toContain('cloud/auto       → cloud/auto-long → cloud/openrouter-zdr')
    expect(text).toContain('cloud/auto-long  → cloud/openrouter-zdr')
    expect(text).toContain('Context window fallbacks')
    expect(text).toContain('cloud/deepseek-v4-flash')
    expect(text).toContain('Router: simple-shuffle · 2 fails before cooldown · 30s cooldown · 0 retries')
  })

  test('a model name narrows the chains, so a long router config stays readable', async () => {
    const { text } = await run(depsOf(fakeProxy()), 'fallbacks', 'AUTO-LONG')

    expect(text).toContain('cloud/auto-long  → cloud/openrouter-zdr')
    expect(text).not.toContain('Context window fallbacks')
    expect(text).not.toContain('cloud/deepseek-v4-flash')
    expect(text).toContain('Router: simple-shuffle')
  })

  test('a filter that matches nothing says so instead of printing every chain', async () => {
    const { text } = await run(depsOf(fakeProxy()), 'fallbacks', 'nope')

    expect(text).toContain('No fallback chain for a model matching "nope"')
    expect(text).not.toContain('→ cloud/openrouter-zdr')
  })

  test('says so when no fallbacks are configured', async () => {
    const fake = fakeProxy({ fallbacks: { routing_strategy: 'least-busy' } })

    expect((await run(depsOf(fake), 'fallbacks', '')).text).toContain('No fallbacks are configured')
  })

  test('a non-admin key is told to set litellm_admin_key', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake, {}, { headers: { authorization: `Bearer ${OWN_KEY}` }, isOwnKey: true }), 'fallbacks', '')

    expect(text).toContain('litellm_admin_key')
  })
})

describe('secrets', () => {
  test('a network error never echoes the keys in the headers', async () => {
    const send = () => Promise.reject(new Error(`fetch failed for Bearer ${ADMIN_KEY} and ${OWN_KEY}`))
    const deps = depsOf(fakeProxy(), {}, { send })
    const { text } = await run(deps, 'keys', '')

    expect(text).toContain('Could not reach the proxy')
    expect(text).not.toContain(ADMIN_KEY)
    expect(text).not.toContain(OWN_KEY)
  })

  test('a proxy error that echoes the key is masked', async () => {
    const send = () => Promise.resolve({ status: 400, text: JSON.stringify({ error: { message: `bad request for ${ADMIN_KEY}` } }) })
    const { text } = await run(depsOf(fakeProxy(), {}, { send }), 'keys', '')

    expect(text).not.toContain(ADMIN_KEY)
  })
})
