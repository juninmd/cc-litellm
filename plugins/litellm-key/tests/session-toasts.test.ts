import { describe, expect, test } from 'claude-code/testing'

import type { Failure, Snapshot } from '../types'
import type { Ports } from '../hooks/ports'
import { createSession } from '../hooks/session'
import { configOf } from '../hooks/settings'
import { BASE, KEY, NOW, keyBody, reply, router, standardRoutes } from './support'

// The reading cycle with nothing of the engine around it: what it tells, and what it remembers of having told.
const cycle = (options: Record<string, string | number | boolean>, routes = standardRoutes()) => {
  const net = router(routes)
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  let remembered: unknown
  let published: Snapshot | null = null
  let failed: Failure | null = null
  const ports: Ports = {
    now: async () => NOW,
    env: async () => ({ ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY }),
    settings: async () => ({}),
    fetch: (url, init) => net.http(url, init.headers),
    loading: async () => undefined,
    publish: async (snapshot, failure) => {
      published = snapshot
      failed = failure
    },
    status: text => {
      statuses.push(text)
    },
    toast: message => {
      toasts.push(message)
    },
    remembered: async () => remembered,
    remember: async ids => {
      remembered = ids
    },
  }
  const session = createSession()

  session.state.config = configOf(options)

  return {
    ports,
    session,
    toasts,
    statuses,
    remembered: () => remembered,
    published: () => ({ snapshot: published, failure: failed }),
  }
}

const NEAR = { ...standardRoutes(), '/key/info': reply(200, keyBody({ spend: 45 })) }

describe('the toasts of the reading cycle', () => {
  test('tell each warning once and remember it', async () => {
    const run = cycle({ daily_alert: 5 }, NEAR)

    await run.session.load(run.ports, 'force')
    await run.session.load(run.ports, 'force')

    expect(run.toasts).toEqual([
      '90% of the key budget is used ($45.00 of $50.00)',
      "Today's spend is $8.70, over your daily alert of $5.00",
    ])
    expect(run.remembered()).toHaveLength(2)
  })

  test('with show_toasts off tell nothing and remember nothing, so they come back with it', async () => {
    const quiet = cycle({ show_toasts: false, daily_alert: 5 }, NEAR)

    await quiet.session.load(quiet.ports, 'force')

    expect(quiet.toasts).toEqual([])
    expect(quiet.remembered()).toBeUndefined()
    expect(quiet.statuses.at(-1)).toContain('90% of budget')
  })

  test('with show_toasts off keep a failure out of them, and still publish it', async () => {
    const quiet = cycle({ show_toasts: false }, { '/key/info': reply(401, { error: { message: 'bad', type: 'auth_error', code: '401', param: 'None' } }) })

    await quiet.session.load(quiet.ports, 'force')

    expect(quiet.toasts).toEqual([])
    expect(quiet.published().failure?.kind).toBe('auth')
  })

  test('count what the session spent on the snapshot they publish', async () => {
    const run = cycle({})

    await run.session.load(run.ports, 'force')

    expect(run.published().snapshot?.session).toEqual({ since: NOW, spend: 0, last: 12.5 })
  })
})
