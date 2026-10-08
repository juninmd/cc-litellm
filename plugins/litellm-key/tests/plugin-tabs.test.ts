import { describe, expect, test } from 'claude-code/testing'

import { boot, run as runCommand, start } from './boot'
import { SURFACES, keysOf, mount } from './pane-kit'
import { KEY, keyBody, reply, standardRoutes } from './support'

type Engine = Parameters<typeof start>[0]

const run = async ($: Engine, args: string) => {
  const result = await runCommand($, args)

  return { ...result, text: result.text ?? '' }
}

describe('tabs', () => {
  test('switch with a press on a tab, and the active one is no button', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await ui.find({ type: 'Text', text: / 1: Overview / })).toBeDefined()
    await ui.press({ key: 'tab-usage' })
    expect(await ui.find({ type: 'Text', text: / 2: Usage / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / 1: Overview / })).toBeUndefined()
    expect(await keysOf(ui)).toContain('tab-overview')
    expect(await keysOf(ui)).not.toContain('tab-usage')
    await ui.press({ key: 'tab-overview' })
    expect(await ui.find({ type: 'Text', text: / 1: Overview / })).toBeDefined()
  })

  test('the Ping tab measures by itself the first time, and again on its button', async ($, on) => {
    const { clock, net } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-ping' })
    await clock.advance(50)
    expect(await ui.find({ type: 'Text', text: / 5: Ping / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\/v1\/models/ })).toBeDefined()
    const before = net.calls.length

    await ui.press({ key: 'ping' })
    await clock.advance(50)
    expect(net.calls.length).toBeGreaterThan(before)
  })

  test('give every tab its hotkey, which the button draws itself', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')
    const buttons = await ui.findAll({ type: 'Button' })
    const hotkeys = Object.fromEntries(buttons.map(button => [button.key, button.props.hotkey]))

    expect(hotkeys).toMatchObject({ 'tab-usage': '2', 'tab-models': '3', 'tab-details': '4', 'tab-ping': '5', refresh: 'r', copy: 'c', close: 'q' })
    expect(buttons.filter(button => button.key?.startsWith('tab-')).map(button => button.props.label)).toEqual(['Usage', 'Models', 'Details', 'Ping'])
  })

  test('keep the one that was open when the pane is drawn again, on any surface', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const first = await mount($, 'terminal')

    await first.press({ key: 'tab-models' })
    const second = await mount($, 'desktop')

    expect(await second.find({ type: 'Text', text: / 3: Models / })).toBeDefined()
  })

  test('copy the tab that is showing, and say what was copied', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'copy' })
    await ui.press({ key: 'tab-usage' })
    await ui.press({ key: 'copy' })
    await ui.press({ key: 'tab-models' })
    await ui.press({ key: 'copy' })
    await ui.press({ key: 'tab-details' })
    await ui.press({ key: 'copy' })

    expect(log.copies[0]).toContain('prod-claude')
    expect(log.copies[1]).toContain('Usage · last 7 days · litellm.test')
    expect(log.copies[2]).toContain('Models (3) · spend over the last 7 days')
    expect(log.copies[3]).toContain('Connection')
    expect(JSON.stringify(log.copies)).not.toContain(KEY)
    expect(log.toasts).toEqual(['Copied the summary', 'Copied the usage report', 'Copied the model list', 'Copied the key details'])
  })

  test('say when the clipboard would not take it', async ($, on) => {
    const { log, clock } = boot(on, { copy: { isCopied: false, reason: 'no-clipboard' } })

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'copy' })

    expect(log.toasts).toEqual(['Could not copy the summary (no-clipboard)'])
  })

  test('survive a proxy that sends escape sequences and absurd dates, on every surface and tab', async ($, on) => {
    const esc = '\u001b[31m'
    const routes = {
      ...standardRoutes(),
      '/key/info': reply(200, keyBody({ key_alias: `${esc}prod\u0000-claude`, created_at: 1e16, expires: 1e16, models: [`${esc}claude\u0007`] })),
      '/v1/models': reply(200, { data: [{ id: `${esc}gpt\u007f-5` }, { id: 'claude-sonnet-4-5' }] }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)

      for (const tab of ['usage', 'models', 'details', 'overview']) {
        await ui.press({ key: `tab-${tab}` })
        expect(await ui.find({ type: 'Text', text: /prod-claude/ })).toBeDefined()
      }
      await ui.unmount()
    }
  })

  test('say the same words on every surface, whatever the tab', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    for (const tab of ['usage', 'details', 'overview']) {
      const said: string[][] = []
      const first = await mount($, 'terminal')

      // the tab is the plugin's, not a surface's: one press moves every pane
      await first.press({ key: `tab-${tab}` })
      for (const surface of SURFACES) {
        const ui = surface === 'terminal' ? first : await mount($, surface)

        said.push((await ui.findAll({ type: 'Text' })).map(item => item.text))
        await ui.unmount()
      }
      expect(said[1]).toEqual(said[0])
      expect(said[2]).toEqual(said[0])
      expect(said[3]).toEqual(said[0])
      expect(said[0]?.length).toBeGreaterThan(10)
    }
  })

  test('have no Copy where there is nothing to copy: the usage tab of a key with no history', async ($, on) => {
    const { clock } = boot(on, { routes: { ...standardRoutes(), '/user/daily/activity': reply(404, 'x') } })

    await start($, clock)
    const ui = await mount($, 'terminal')

    expect(await keysOf(ui)).toContain('copy')
    await ui.press({ key: 'tab-usage' })
    expect(await keysOf(ui)).toEqual(['tab-overview', 'tab-models', 'tab-details', 'tab-ping', 'refresh', 'close'])
    await ui.press({ key: 'tab-models' })
    expect(await keysOf(ui)).toContain('copy')
  })

  test('the failure state has no tabs: there is nothing to look at', async ($, on) => {
    const { clock } = boot(on, { env: {} })

    await start($, clock)

    expect(await keysOf(await mount($, 'terminal'))).toEqual(['refresh', 'close'])
  })
})

describe('/litellm tab', () => {
  test('opens the pane on that tab, by name or number', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await run($, 'tab usage')
    expect(log.opens).toEqual(['litellm-key'])
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: / 2: Usage / })).toBeDefined()
    await run($, 'tab 3')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: / 3: Models / })).toBeDefined()
    await run($, 'view details')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: / 4: Details / })).toBeDefined()
  })

  test('Esc closes the pane, except on the models tab, where it is for leaving the filter', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    await run($, '')
    expect(log.escapes).toEqual([true])
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-models' })
    expect(log.escapes).toEqual([true, false])
    await ui.press({ key: 'tab-usage' })
    expect(log.escapes).toEqual([true, false, true])
    await ui.press({ key: 'tab-details' })
    await ui.press({ key: 'tab-overview' })
    expect(log.escapes).toEqual([true, false, true])
  })

  test('follows the tab that is showing for Esc, even when two presses land before the pane is drawn again', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    await run($, 'tab usage')
    const ui = await mount($, 'terminal')

    await Promise.all([ui.press({ key: 'tab-models' }), ui.press({ key: 'tab-details' })])

    // however the two interleave, the pane ends up told what Esc does on the tab it ends on: it closes the pane
    expect(log.escapes.at(-1)).toBe(true)
    expect(await ui.find({ type: 'Text', text: / 4: Details / })).toBeDefined()
  })

  test('opens straight on the models tab without Esc closing it', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)
    await run($, 'tab models')
    await run($, 'tab usage')

    expect(log.escapes).toEqual([false, true])
  })

  test('says which tabs there are when it is given a wrong one, and guesses', async ($, on) => {
    const { log, clock } = boot(on)

    await start($, clock)

    expect((await run($, 'tab nope')).text).toBe('Unknown tab "nope". The tabs are overview, usage, models, details, ping, admin.')
    expect((await run($, 'tab usgae')).text).toBe('Unknown tab "usgae". Did you mean "usage"? The tabs are overview, usage, models, details, ping, admin.')
    expect((await run($, 'tab')).text).toContain('The tabs are')
    expect(log.opens).toEqual([])
  })

  test('is what plain /litellm opens again: the tab it was left on', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)
    const ui = await mount($, 'terminal')

    await ui.press({ key: 'tab-details' })
    await ui.unmount()
    await run($, '')

    expect(await (await mount($, 'terminal')).find({ type: 'Text', text: / 4: Details / })).toBeDefined()
  })

  test('prints that tab as text where nothing can draw a pane', async ($, on) => {
    const { log, clock } = boot(on, { surfaces: [] })

    await start($, clock)

    expect((await run($, 'tab usage')).text).toContain('Usage · last 7 days')
    expect((await run($, 'tab models')).text).toContain('Models (3) · spend over the last 7 days')
    expect((await run($, 'tab details')).text).toContain('Connection')
    expect((await run($, '')).text).toContain('prod-claude')
    expect(log.opens).toEqual([])
  })

  test('is told by debug, with the range', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'debug')).text).toContain('Pane     overview tab · 7 days')
  })

  test('is in the help', async ($, on) => {
    const { clock } = boot(on)

    await start($, clock)

    expect((await run($, 'help')).text).toContain('/litellm tab <name>')
  })
})
