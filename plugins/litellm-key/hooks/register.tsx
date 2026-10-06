import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ViewName } from '../types'

import { adminLink } from './admin-link'
import { overBudgetBand } from './band'
import type { CommandContext } from './commands'
import { runCommand } from './commands'
import { exceededItems } from './exceeded'
import type { Reply } from './litellm'
import type { Init, Ports } from './ports'
import { parsePrefs } from './prefs'
import { ping } from './probe'
import type { Session } from './session'
import { createSession } from './session'
import { configOf } from './settings'
import { dashboard } from './view'

const PANE = 'litellm-key'
const REQUEST_MS = 4_000

const snapshotState = atom({ plugin: 'litellm-key', key: 'snapshot' } as const, null)
const failureState = atom({ plugin: 'litellm-key', key: 'failure' } as const, null)
const loadingState = atom({ plugin: 'litellm-key', key: 'isLoading' } as const, false)
const viewState = atom({ plugin: 'litellm-key', key: 'view' } as const, 'overview')
const rangeState = atom({ plugin: 'litellm-key', key: 'range' } as const, 7)
const sortState = atom({ plugin: 'litellm-key', key: 'sort' } as const, 'spend')
const metricState = atom({ plugin: 'litellm-key', key: 'metric' } as const, 'spend')
const filterState = atom({ plugin: 'litellm-key', key: 'filter' } as const, '')
const dayState = atom({ plugin: 'litellm-key', key: 'day' } as const, null)

/**
 * Esc closes the pane at an empty prompt, as the person's close does, and so it would when pressed to leave the filter
 * field: the Models tab, the only one with a field, leaves Esc to the field alone and is closed by q or the button.
 */
const paneArgs = (tab: ViewName) =>
  ({ id: PANE, title: 'LiteLLM key', ...(tab === 'models' ? {} : { closeOnEscape: true as const }), rows: 22, columns: 76 }) as const

/** What the person chose is kept for next time; a store that fails only loses that. */
const savePrefs = async ($: EngineInterface): Promise<void> => {
  await $.store
    .set('prefs', { range: await read($, rangeState), sort: await read($, sortState), metric: await read($, metricState) })
    .catch(() => undefined)
}

const loadPrefs = async ($: EngineInterface): Promise<void> => {
  const { range, sort, metric } = parsePrefs(await $.store.get('prefs').catch(() => undefined))

  if (range !== undefined) {
    await update($, rangeState, () => range)
  }
  if (sort !== undefined) {
    await update($, sortState, () => sort)
  }
  if (metric !== undefined) {
    await update($, metricState, () => metric)
  }
}

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
    openPane: async tab => {
      if (tab !== null) {
        await update($, viewState, () => tab)
      }

      return $.ui.open(paneArgs(tab ?? (await read($, viewState))))
    },
    closePane: async () => {
      await $.ui.close({ id: PANE })
    },
    sleep: ms => $.clock.sleep(ms),
    view: async () => ({ tab: await read($, viewState), range: await read($, rangeState) }),
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
    await loadPrefs($)

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
    const tab = await read($, viewState)
    const range = await read($, rangeState)
    const sort = await read($, sortState)
    const metric = await read($, metricState)
    const filter = await read($, filterState)
    const day = await read($, dayState)
    const now = await $.clock.now()
    const { config } = state

    return dashboard(ui, {
      snapshot,
      failure,
      isLoading,
      now,
      columns: e.props.bodyColumns,
      placement: e.props.placement,
      hasField: e.surface !== 'mobile',
      isCompact: config.isCompact,
      isUsageShown: config.isUsageShown,
      warnPercent: config.warnPercent,
      refreshSeconds: config.refreshSeconds,
      tab,
      range,
      sort,
      metric,
      filter,
      day,
      onRefresh: () => {
        session.reload(portsOf($), 'force')
      },
      onClose: () => {
        void $.ui.close({ id: PANE })
      },
      onCopy: (text, what, press) => {
        $.ui
          .copy({ text, surface: press.surface })
          .then(result => {
            $.ui.toast(result.isCopied ? `Copied ${what}` : `Could not copy ${what} (${result.reason})`, { timeoutMs: 2500 })
          })
          .catch(() => undefined)
      },
      onTab: next => {
        void update($, viewState, () => next).then(() => {
          // Open again to change what Esc does, only when going to or from the one tab that has a field.
          if ((next === 'models') !== (tab === 'models')) {
            $.ui.open(paneArgs(next)).catch(() => undefined)
          }
        })
      },
      onRange: next => {
        void update($, rangeState, () => next).then(() => savePrefs($))
      },
      onSort: next => {
        void update($, sortState, () => next).then(() => savePrefs($))
      },
      onMetric: next => {
        void update($, metricState, () => next).then(() => savePrefs($))
      },
      onFilter: text => {
        void update($, filterState, () => text)
      },
      onDay: date => {
        void update($, dayState, () => date)
      },
      onFocusFilter: () => {
        $.ui.focus({ requestId: PANE, key: 'filter' }).catch(() => undefined)
      },
    })
  })
}
