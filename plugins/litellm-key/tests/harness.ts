import { mock } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { BASE, KEY, NOW, router, standardRoutes } from './support'
import type { Route } from './support'

export const DAY = 86_400_000
export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

export type Setup = {
  routes?: Record<string, Route>
  env?: Record<string, string>
  settingsEnv?: Record<string, string>
  surfaces?: readonly RenderSurface[]
  store?: Record<string, unknown>
  open?: { isPlaced: boolean; reason?: string }
  /** What the clipboard answers: it takes the text unless this says otherwise. */
  copy?: { isCopied: false; reason: 'no-surface' | 'no-clipboard' | 'refused' }
  /** The store fails on every call, as a disk that cannot be written would. */
  storeFails?: boolean
}

/** The engine's side of a session, played by hooks that log what the plugin did: toasts, status lines, copies, opens. */
export const boot = (on: On, setup: Setup = {}) => {
  const log = {
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    opens: [] as string[],
    escapes: [] as boolean[],
    closes: [] as string[],
    copies: [] as string[],
    commands: [] as string[],
    focuses: [] as string[],
    invalidations: 0,
    stored: {} as Record<string, unknown>,
    /** The panes that are up, as the engine lists them; a test drops one to play the engine closing it by itself. */
    panes: new Set<string>(),
  }
  const net = router(setup.routes ?? standardRoutes())
  const clock = mock.clock(on, { now: NOW })

  // What mock.store keeps, kept here in the open so a test can see what was written.
  Object.assign(log.stored, setup.store)
  const diskFails = () => {
    if (setup.storeFails) {
      throw new Error('disk error')
    }
  }

  on('store.get', (_$, e) => {
    diskFails()

    return { value: log.stored[e.key] }
  })
  on('store.set', (_$, e) => {
    diskFails()
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
    const answer = await net.http(e.url, e.init?.headers ?? {})

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
    log.panes.add(e.id)

    return { value: setup.open ? { isPlaced: setup.open.isPlaced, reason: setup.open.reason ?? '' } : { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    log.closes.push(e.id)
    log.panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...log.panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.copy', (_$, e) => {
    log.copies.push(e.text)

    return { value: setup.copy ?? { isCopied: true } }
  })
  on('ui.focus', (_$, e) => {
    log.focuses.push(`${e.requestId}:${e.element ?? ''}`)

    return {}
  })
  on('ui.invalidate', () => {
    log.invalidations += 1

    return { value: undefined }
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


const PANE = {
  title: 'LiteLLM key',
  isFocused: false,
  bodyColumns: 76,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

/** Draws the pane on a surface, as the engine would, with props to say where and how wide. */
export const mount = <P extends (typeof SURFACES)[number]>($: Engine, surface: P, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: 'litellm-key', surface, component: 'Pane', requestId: 'litellm-key', props: { ...PANE, ...props } as typeof PANE })

export type Reads = { findAll: (query: ElementQuery) => Promise<FoundElement[]> }

export const keysOf = async (ui: Reads) => (await ui.findAll({ type: 'Button' })).map(button => button.key)

export const texts = async (ui: Reads, pattern: RegExp) =>
  (await ui.findAll({ type: 'Text', text: pattern })).map(item => item.text)
