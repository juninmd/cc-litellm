import type { AdminState } from '../types'
import type { AdminCommand } from './admin-commands'
import { runAdmin } from './admin-commands'
import type { Deps } from './admin-flow'
import { readAdminView } from './admin-view'
import { truncate } from './format'

export type AdminLink = () => Promise<{ deps: Deps } | { text: string }>

/** What the tab shows while it works: what it had stays, so the lists do not blink away. */
export const adminBusy = (before: AdminState | null): AdminState => ({ view: before?.view ?? null, failure: null, message: before?.message ?? null, isLoading: true })

/**
 * One round of the Admin tab: an action first, when there is one (it goes through the same preview and confirmation as
 * the slash command), then the lists read again so they show what is there. Never throws.
 */
export const stepAdmin = async (link: AdminLink, before: AdminState | null, action?: { command: AdminCommand; input: string }): Promise<{ state: AdminState; isChanged: boolean }> => {
  const had = before?.view ?? null

  try {
    const ready = await link()

    if (!('deps' in ready)) {
      return { state: { view: had, isLoading: false, failure: ready.text, message: null }, isChanged: false }
    }
    const outcome = action ? await runAdmin(ready.deps, action.command, action.input) : null
    const lines = outcome?.text.split('\n') ?? []
    // A change says what it did first; a stop (cancelled, dry run, an error) says why on its last line, after the preview.
    const message = outcome === null ? null : truncate((outcome.isChanged ? lines[0] : lines[lines.length - 1]) ?? '', 120)
    const view = await readAdminView(ready.deps.admin, ready.deps.now)

    return {
      state: { view: view.ok ? view.value : had, isLoading: false, failure: view.ok ? null : view.message, message },
      isChanged: outcome?.isChanged === true,
    }
  } catch {
    return { state: { view: had, isLoading: false, failure: 'The admin read failed unexpectedly.', message: null }, isChanged: false }
  }
}
