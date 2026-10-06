import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { BASE, KEY, NOW, router, standardRoutes } from './support'
import type { Route } from './support'

export type Setup = {
  routes?: Record<string, Route>
  env?: Record<string, string>
  settingsEnv?: Record<string, string>
  surfaces?: readonly RenderSurface[]
  store?: Record<string, unknown>
  open?: { isPlaced: boolean; reason?: string }
  /** The clipboard call itself fails (no OSC 52, no helper), instead of answering isCopied. */
  copyThrows?: boolean
  /** What the clipboard answers when it takes nothing: it takes the text unless this says otherwise. */
  copy?: { isCopied: false; reason: 'no-surface' | 'no-clipboard' | 'refused' }
}

export const boot = (on: On, setup: Setup = {}) => {
  const log = {
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    opens: [] as string[],
    /** What each `ui.open` said about Esc: whether it closes the pane. */
    escapes: [] as boolean[],
    /** What the store holds, kept in the open so a test can see what was written. */
    stored: {} as Record<string, unknown>,
    closes: [] as string[],
    copies: [] as string[],
    commands: [] as string[],
  }
  const net = router(setup.routes ?? standardRoutes())
  const clock = mock.clock(on, { now: NOW })

  Object.assign(log.stored, setup.store)
  on('store.get', (_$, e) => ({ value: log.stored[e.key] }))
  on('store.set', (_$, e) => {
    log.stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete log.stored[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(log.stored) }))
  mock.env(on, setup.env ?? { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('settings.read', () => ({ value: setup.settingsEnv ? { env: setup.settingsEnv } : {} }))
  on('session.surfaces', () => ({ value: setup.surfaces ?? ['terminal'] }))
  on('command.register', (_$, e) => {
    log.commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('http.fetch', async (_$, e) => {
    const answer = await net.http(e.url, e.init?.headers ?? {}, {
      method: e.init?.method ?? 'GET',
      ...(e.init?.body === undefined ? {} : { body: e.init.body }),
    })

    return { value: { status: answer.status, ok: answer.status < 300, headers: {}, text: answer.text } }
  })
  on('ui.status', (_$, e) => {
    log.statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    log.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    log.opens.push(e.id)
    log.escapes.push(e.closeOnEscape === true)

    return { value: setup.open ? { isPlaced: setup.open.isPlaced, reason: setup.open.reason ?? '' } : { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    log.closes.push(e.id)

    return { value: undefined }
  })
  on('ui.focus', () => ({}))
  on('ui.copy', (_$, e) => {
    if (setup.copyThrows) {
      throw new Error('clipboard unavailable')
    }
    if (setup.copy) {
      return { value: setup.copy }
    }
    log.copies.push(e.text)

    return { value: { isCopied: true } }
  })

  return { log, net, clock }
}

export const run = ($: Engine, args: string) =>
  $.command.run({
    command: 'litellm',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 100 },
  })

export const start = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await clock.advance(300)
}

export const urls = (net: { calls: { url: string }[] }) => net.calls.map(call => call.url.replace(BASE, '').split('?')[0] ?? '')
