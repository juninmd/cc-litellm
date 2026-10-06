import type { Failure, Snapshot, ViewName } from '../types'
import type { Deps } from './admin-commands'
import type { Session } from './session'
import { failureText } from './summary'

/** What `/litellm` answers: the text to print, the exit code of a `claude -p` run, and what to tell Claude unseen. */
export type CommandResult = { text: string; exitCode?: number; context?: readonly string[] }

/** What /litellm needs from the engine; register.tsx builds it from `$`. */
export type CommandContext = {
  session: Session
  now: () => Promise<number>
  surfaces: () => Promise<readonly string[]>
  ensureFresh: () => Promise<void>
  refresh: () => Promise<void>
  reload: () => void
  /** Opens the pane, on `tab` when one is given and on the one it was left on otherwise. */
  openPane: (tab: ViewName | null) => Promise<{ isPlaced: boolean; reason?: string }>
  closePane: () => Promise<void>
  sleep: (ms: number) => Promise<void>
  /** The tab the pane shows and the range of its usage: what `copy` and `share` mean by "this". */
  view: () => Promise<{ tab: ViewName; range: number }>
  copy: (text: string) => Promise<{ isCopied: boolean; reason?: string | undefined }>
  ping: () => Promise<{ text: string; exitCode?: number }>
  admin: () => Promise<{ deps: Deps } | { text: string }>
}

export const NOT_READ = 'Reading the key from the proxy… the answer shows up here and in the pane.'

export type Current = { snapshot: Snapshot; failure: Failure | null; now: number }

/** What the plugin last read, with when it is now; or what to say instead when there is nothing to show. */
export const current = async (ctx: CommandContext): Promise<Current | string> => {
  const now = await ctx.now()
  const { snapshot, failure } = ctx.session.state.latest

  return snapshot ? { snapshot, failure, now } : failure ? failureText(failure) : NOT_READ
}

export const report = async (ctx: CommandContext, view: (snapshot: Snapshot, now: number) => string): Promise<string> => {
  const got = await current(ctx)

  return typeof got === 'string' ? got : `${view(got.snapshot, got.now)}${got.failure ? `\n(stale) ${got.failure.message}` : ''}`
}
