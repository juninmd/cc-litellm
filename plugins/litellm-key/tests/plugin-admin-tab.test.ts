import { describe, expect, test } from 'claude-code/testing'

import { boot, start } from './boot'
import { keysOf, mount } from './pane-kit'
import { reply, standardRoutes } from './support'

describe('the Admin tab', () => {
  test('the Admin tab is there for a proxy admin only', async ($, on) => {
    const plain = boot(on)

    await start($, plain.clock)
    expect(await keysOf(await mount($, 'terminal'))).not.toContain('tab-admin')
  })

  test('the Admin tab shows for a proxy admin, and reads the lists', async ($, on) => {
    const routes = standardRoutes()
    const user = routes['/user/info']

    routes['/user/info'] = reply(200, { user_id: 'jane', user_info: { user_id: 'jane', user_role: 'proxy_admin', spend: 1 }, keys: [], teams: [] })
    expect(user).toBeDefined()
    const { clock } = boot(on, { routes })

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await keysOf(ui)).toContain('tab-admin')
    await ui.press({ key: 'tab-admin' })
    await clock.advance(50)
    expect(await ui.find({ type: 'Text', text: / 6: Admin / })).toBeDefined()
  })
})
