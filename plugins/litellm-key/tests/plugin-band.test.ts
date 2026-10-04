import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { boot, run, start } from './boot'
import { keyBody, reply, standardRoutes } from './support'

describe('the over-budget band', () => {
  const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, isFocused: false, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const
  const mountBand = ($: Engine, surface: 'terminal' | 'desktop', hasSurvey = false) =>
    $.ui.mount({ plugin: 'litellm-key', surface, component: 'AbovePrompt', props: { ...BAND, hasSurvey } })
  // When the hook yields (next), the test engine has nothing else that draws the band: that is the "not shown" case.
  const isDrawn = async ($: Engine, hasSurvey = false): Promise<boolean> => {
    try {
      return (await (await mountBand($, 'terminal', hasSurvey)).find({ type: 'Text', text: /BUDGET USED UP/ })) !== undefined
    } catch (error) {
      if (error instanceof Error && error.message.includes('no implementation for ui.render')) {
        return false
      }
      throw error
    }
  }
  const routesAt = (state: { spend: number; limit: number }) => ({
    ...standardRoutes(),
    '/key/info': () => reply(200, keyBody({ spend: state.spend, max_budget: state.limit })),
  })

  test('stays above the prompt while the key is over budget, and goes when the budget is normal again', async ($, on) => {
    const state = { spend: 55, limit: 50 }
    const { log, clock } = boot(on, { routes: routesAt(state) })

    await start($, clock)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountBand($, surface)

      expect(await ui.find({ type: 'Text', text: /BUDGET USED UP/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^key prod-claude$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$55\.00 of \$50\.00 · resets in/ })).toBeDefined()
      // a spent-up budget is a full bar in the error color, and its share is bold, in the same color
      expect((await ui.find({ type: 'Text', text: /^█{12}$/ }))?.props.color).toBe('error')
      const share = await ui.find({ type: 'Text', text: /110%/ })

      expect(share?.props.color).toBe('error')
      expect(share?.props.bold).toBe(true)
      await ui.unmount()
    }
    // the toast is a one-off; the band is what keeps saying it
    expect(log.toasts.filter(text => text.includes('over budget'))).toHaveLength(1)

    state.limit = 80
    await run($, 'refresh')
    expect(await isDrawn($)).toBe(false)
  })

  test('names the team budget that is spent, not only the key', async ($, on) => {
    const routes = {
      ...standardRoutes(),
      '/team/info': reply(200, { team_id: 'eng', team_info: { team_alias: 'Eng', spend: 1000, max_budget: 1000, budget_duration: '30d', budget_reset_at: '2026-11-01T00:00:00Z' } }),
    }
    const { clock } = boot(on, { routes })

    await start($, clock)
    const ui = await mountBand($, 'terminal')

    expect(await ui.find({ type: 'Text', text: /^team Eng$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\$1,000\.00 of \$1,000\.00 · resets in/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^key prod-claude$/ })).toBeUndefined()
  })

  test('is not drawn while the budget is fine', async ($, on) => {
    const { clock } = boot(on, { routes: routesAt({ spend: 5, limit: 50 }) })

    await start($, clock)
    expect(await isDrawn($)).toBe(false)
  })

  test('yields to a survey that holds the band', async ($, on) => {
    const { clock } = boot(on, { routes: routesAt({ spend: 55, limit: 50 }) })

    await start($, clock)
    expect(await isDrawn($)).toBe(true)
    expect(await isDrawn($, true)).toBe(false)
  })
})
