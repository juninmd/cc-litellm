import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { adminLink } from './admin-link'
import { overBudgetBand } from './band'
import type { CommandContext } from './commands'
import { runCommand } from './commands'
import { exceededItems } from './exceeded'
import type { Reply } from './litellm'
import type { Init, Ports } from './ports'
import { ping } from './probe'
import type { Session } from './session'
import { createSession } from './session'
import { configOf } from './settings'
import { summaryText } from './summary'
import { dashboard } from './view'

const PANE = 'litellm-key'
const REQUEST_MS = 4_000

const snapshotState = atom({ plugin: 'litellm-key', key: 'snapshot' } as const, null)
const failureState = atom({ plugin: 'litellm-key', key: 'failure' } as const, null)
const loadingState = atom({ plugin: 'litellm-key', key: 'isLoading' } as const, false)

/** One request, timed, and given up on after `ms`. */
const fetchWithin = async ($: EngineInterface, url: string, init: Init, ms: number): Promise<Reply> => {
  const started = await $.clock.now()
  let timer: { cancel: () => void } | undefined
  const late = new Promise<never>((_, reject) => {
    timer = $.clock.after(ms, () => reject(new Error(`no answer within ${ms / 1000}s`)))
  })

  try {
    const { status, text } = await Promise.race([$.http.fetch(url, init), late])

    return { status, text, ms: (await $.clock.now()) - started }
  } finally {
    timer?.cancel()
  }
}

// `$` stays in this file: the runtime follows it only here, so everything else gets these closures.
const portsOf = ($: EngineInterface): Ports => ({
  now: () => $.clock.now(),
  env: async () => ({
    ANTHROPIC_BASE_URL: await $.env.get('ANTHROPIC_BASE_URL'),
    ANTHROPIC_AUTH_TOKEN: await $.env.get('ANTHROPIC_AUTH_TOKEN'),
    ANTHROPIC_API_KEY: await $.env.get('ANTHROPIC_API_KEY'),
    ANTHROPIC_CUSTOM_HEADERS: await $.env.get('ANTHROPIC_CUSTOM_HEADERS'),
    LITELLM_PROXY_API_BASE: await $.env.get('LITELLM_PROXY_API_BASE'),
    LITELLM_PROXY_API_KEY: await $.env.get('LITELLM_PROXY_API_KEY'),
  }),
  settings: () => $.settings.read(),
  fetch: (url, init, ms = REQUEST_MS) => fetchWithin($, url, init, ms),
  loading: async isLoading => {
    await update($, loadingState, () => isLoading)
  },
  publish: async (snapshot, failure) => {
    await update($, snapshotState, () => snapshot)
    await update($, failureState, () => failure)
  },
  status: text => {
    $.ui.status(text)
  },
  toast: message => {
    $.ui.toast(message, { timeoutMs: 8000 })
  },
  remembered: () => $.store.get('notified'),
  remember: async ids => {
    await $.store.set('notified', ids)
  },
})

const contextOf = ($: EngineInterface, session: Session): CommandContext => {
  const ports = portsOf($)

  return {
    session,
    now: () => $.clock.now(),
    surfaces: () => $.session.surfaces(),
    ensureFresh: () => session.ensureFresh(ports),
    refresh: () => session.load(ports, 'force'),
    reload: () => session.reload(ports, 'force'),
    openPane: () => $.ui.open({ id: PANE, title: 'LiteLLM key', closeOnEscape: true, rows: 20, columns: 76 }),
    closePane: async () => {
      await $.ui.close({ id: PANE })
    },
    sleep: ms => $.clock.sleep(ms),
    view: async () => ({ tab: 'overview', range: 7 }),
    copy: async text => {
      try {
        return await $.ui.copy({ text })
      } catch {
        return { isCopied: false, reason: 'refused' } // a clipboard that throws is one that refuses
      }
    },
    ping: () => ping(session, ports),
    admin: () =>
      adminLink(session, ports, {
        surfaces: () => $.session.surfaces(),
        ask: (question, options) => $.ui.ask(question, options),
        copy: async value => (await $.ui.copy({ text: value })).isCopied,
      }),
  }
}

export const register: Register = (on, options) => {
  const session = createSession()
  const { state } = session

  state.config = configOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'litellm',
      description: 'Show your LiteLLM virtual key: budget, limits, models and usage',
      argumentHint: '[refresh|info|status|pace|usage|compare|day|models|check|json|csv|copy|share|ping|keys|key|grant|org|fallbacks|debug|close|help]',
    })
    state.ticker?.cancel()
    state.ticker = $.clock.every(state.config.refreshSeconds * 1000, () => {
      session.reload(portsOf($), 'tick')
    })
    $.clock.after(250, () => {
      session.reload(portsOf($), 'force')
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    $.clock.after(1500, () => {
      session.reload(portsOf($), 'turn')
    })

    return next(e)
  })

  on('command.run', { command: 'litellm' }, ($, e) => runCommand(contextOf($, session), e.args))

  // Unlike a toast, this stays for as long as a budget is spent up, and goes only when the next reading is normal.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snapshot = await read($, snapshotState)
    const items = snapshot && !e.props.hasSurvey ? exceededItems(snapshot, await $.clock.now()) : []

    return items.length === 0 ? next(e) : overBudgetBand($.ui.resolve(e), items)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const snapshot = await read($, snapshotState)
    const failure = await read($, failureState)
    const isLoading = await read($, loadingState)
    const now = await $.clock.now()
    const { config } = state

    return dashboard(ui, {
      snapshot,
      failure,
      isLoading,
      now,
      columns: e.props.bodyColumns,
      placement: e.props.placement,
      isCompact: config.isCompact,
      warnPercent: config.warnPercent,
      refreshSeconds: config.refreshSeconds,
      onRefresh: () => {
        session.reload(portsOf($), 'force')
      },
      onCopy: press => {
        if (snapshot) {
          void $.ui.copy({ text: summaryText(snapshot, now, config.warnPercent), surface: press.surface })
        }
      },
      onClose: () => {
        void $.ui.close({ id: PANE })
      },
    })
  })
}
