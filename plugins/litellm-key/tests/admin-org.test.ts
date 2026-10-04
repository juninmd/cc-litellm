import { describe, expect, test } from 'claude-code/testing'

import { runAdmin } from '../hooks/admin-commands'
import { reply } from './support'
import { depsOf, fakeProxy } from './fake-proxy'

const noCap = [{ organization_id: 'org-2', organization_alias: 'bare', spend: 1, litellm_budget_table: { max_budget: null }, members: [], teams: [] }]

describe('/litellm org', () => {
  test('shows the budget, the models and who is in it, found by alias', async () => {
    const { text, isChanged } = await runAdmin(depsOf(fakeProxy()), 'org', 'acme')

    expect(text).toContain('Organization "acme" · org-1')
    expect(text).toContain('$2.00 / $10.00 (20%) · $8.00 left · resets every 30d')
    expect(text).toContain('all models')
    expect(text).toContain('2 members · 1 team')
    expect(isChanged).toBe(false)
  })

  test('without a name it takes the organization of the key Claude Code uses, else lists them', async () => {
    const own = await runAdmin(depsOf(fakeProxy(), { ownOrgId: 'org-1' }), 'org', '')
    const all = await runAdmin(depsOf(fakeProxy()), 'org', '')

    expect(own.text).toContain('Organization "acme"')
    expect(all.text).toMatch(/^1 organization\n\s+acme\s+\$2\.00 \/ \$10\.00\s+org-1$/)
  })

  test('says so when there is no such organization, and refuses a stray option', async () => {
    expect((await runAdmin(depsOf(fakeProxy()), 'org', 'nope')).text).toContain('No organization "nope"')
    expect((await runAdmin(depsOf(fakeProxy()), 'org', 'acme --budjet 5')).text).toContain('Unknown option --budjet')
  })

  test('names the license when the proxy keeps organizations for enterprise (LiteLLM 1.102 and later)', async () => {
    const fake = fakeProxy()
    const gated = depsOf(fake, {}, {
      send: async () =>
        reply(403, { error: { message: 'Organization management is an enterprise feature. You must be a LiteLLM Enterprise user to use this feature.', code: '403' } }),
    })
    const { text } = await runAdmin(gated, 'org', 'acme')

    expect(text).toContain('enterprise license')
    expect(text).not.toContain('needs a proxy admin key')
  })
})

describe('/litellm org when the lookup by alias fails', () => {
  test('says why instead of claiming the organization does not exist', async () => {
    const fake = fakeProxy()
    const broken = depsOf(fake, {}, { send: async (url, init) => (url.includes('/organization/list') ? reply(500, { error: { message: 'db is down' } }) : fake.send(url, init)) })
    const { text } = await runAdmin(broken, 'org', 'acme')

    expect(text).not.toContain('No organization')
    expect(text).toMatch(/500|db is down/)
  })
})

describe('/litellm grant --org', () => {
  test('is not a grant when the proxy answers 200 and the budget does not move', async () => {
    const fake = fakeProxy()
    const ignoring = depsOf(fake, {}, { send: async (url, init) => (init.method === 'PATCH' ? reply(200, {}) : fake.send(url, init)) })
    const { text, isChanged } = await runAdmin(ignoring, 'grant', '5 --org acme --yes')

    expect(text).toContain('the change did not take')
    expect(text).toContain('$10.00')
    expect(isChanged).toBe(false)
  })

  test('adds to the organization budget and reads the new one back', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await runAdmin(depsOf(fake), 'grant', '5 --org acme --yes')

    expect(fake.writes()).toHaveLength(1)
    expect(fake.writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/organization/update',
      body: { organization_id: 'org-1', litellm_budget_table: { max_budget: 15 } },
    })
    expect(text).toContain('"acme" now has a budget of $15.00')
    expect(isChanged).toBe(true)
  })

  test('previews first, and says whose budget it moves', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)

    deps.ask = async question => {
      deps.asked.push(question)

      return 'Cancel'
    }
    const { text } = await runAdmin(deps, 'grant', '5 --org org-1')

    expect(deps.asked[0]).toContain('$10.00 → $15.00 (+$5.00) per 30d')
    expect(deps.asked[0]).toContain('organization budget applies to every key and team in it')
    expect(text).toContain('Cancelled')
    expect(fake.writes()).toHaveLength(0)
  })

  test('--set caps an organization that has no cap, and a plain amount asks for --set', async () => {
    const fake = fakeProxy({ orgs: noCap })

    expect((await runAdmin(depsOf(fake), 'grant', '5 --org bare --yes')).text).toContain('Use --set 5')
    await runAdmin(depsOf(fake), 'grant', '40 --org bare --set --yes')
    expect(fake.writes()[0]?.body).toMatchObject({ litellm_budget_table: { max_budget: 40 } })
  })

  test('one target at a time, and never a write to an organization that was not found', async () => {
    const fake = fakeProxy()

    expect((await runAdmin(depsOf(fake), 'grant', '5 --org acme --team platform-eng --yes')).text).toContain('Pick one target')
    expect((await runAdmin(depsOf(fake), 'grant', '5 --org ghost --yes')).text).toContain('No organization "ghost"')
    expect(fake.writes()).toHaveLength(0)
  })
})
