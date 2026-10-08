import { describe, expect, test } from 'claude-code/testing'

import { readAdminView } from '../hooks/admin-view'
import { adminText } from '../hooks/tab-admin'
import { stepAdmin } from '../hooks/admin-pane'
import { ADMIN_KEY, depsOf, fakeProxy, hashOf } from './fake-proxy'

describe('the Admin tab reads', () => {
  test('the keys by spend, the teams, the spend of each model and how many models there are', async () => {
    const fake = fakeProxy()
    const view = await readAdminView(depsOf(fake).admin, 1)

    expect(view.ok).toBe(true)
    if (!view.ok) {
      return
    }
    expect(view.value.keys.map(key => key.alias)).toEqual(['bob-dev', 'alice-ci'])
    expect(view.value.keyTotal).toBe(2)
    expect(view.value.teams).toEqual([{ id: 'team-1', alias: 'platform-eng', spend: 40, limit: 100 }])
    expect(view.value.models[0]).toEqual({ model: 'cloud/auto-long', spend: 30 })
    expect(view.value.modelCount).toBe(3)
    expect(adminText(view.value)).toContain('platform-eng  $40.00 / $100.00 (40%)')
  })

  test('fails when the token is no admin, and keeps the key out of the message', async () => {
    const fake = fakeProxy({ admin: 'sk-someone-else-9999999' })
    const view = await readAdminView(depsOf(fake).admin, 1)

    expect(view.ok).toBe(false)
    expect(JSON.stringify(view)).not.toContain(ADMIN_KEY)
  })
})

describe('the Admin tab acts', () => {
  const link = (fake: ReturnType<typeof fakeProxy>) => async () => ({ deps: depsOf(fake) })

  test('a block asks first, applies, and the lists show it', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake)
    const { state, isChanged } = await stepAdmin(async () => ({ deps }), null, { command: 'key', input: `block ${hashOf(2)}` })

    expect(deps.asked[0]).toContain('Block key "bob-dev"')
    expect(isChanged).toBe(true)
    expect(state.message).toContain('Blocked key "bob-dev"')
    expect(state.view?.keys.find(key => key.alias === 'bob-dev')?.isBlocked).toBe(true)
  })

  test('a grant to a team asks first and raises the cap by the amount', async () => {
    const fake = fakeProxy()
    const { state } = await stepAdmin(link(fake), null, { command: 'grant', input: '10 --team team-1' })

    expect(state.message).toContain('now has a budget of $110.00')
    expect(state.view?.teams[0]?.limit).toBe(110)
  })

  test('a cancelled dialog says so, not the first line of the preview', async () => {
    const fake = fakeProxy()
    const deps = { ...depsOf(fake), ask: async () => 'Cancel' }
    const { state, isChanged } = await stepAdmin(async () => ({ deps }), null, { command: 'key', input: `block ${hashOf(2)}` })

    expect(isChanged).toBe(false)
    expect(state.message).toBe('Cancelled: nothing changed.')
  })

  test('says why when there is no admin link, and keeps what it had', async () => {
    const { state } = await stepAdmin(async () => ({ text: 'The proxy has not answered yet.' }), null)

    expect(state.failure).toBe('The proxy has not answered yet.')
    expect(state.view).toBeNull()
  })
})
