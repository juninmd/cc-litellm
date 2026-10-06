import type { Snapshot } from '../types'
import type { AdminCommand, Deps } from './admin-commands'
import { GRANT_HELP, KEY_HELP, runAdmin } from './admin-commands'
import { clock, maskKey, redact, truncate } from './format'
import type { Session } from './session'
import { modelsText } from './facts'
import { modelsTable } from './prices'
import { failureText, oneLine, summaryText } from './summary'

const PANE_WAIT_MS = 2_500

const HELP = [
  '/litellm            open the live pane',
  '/litellm refresh    read the key again now',
  '/litellm info       print the full summary here',
  '/litellm models     list the models this key can call, with their prices',
  '/litellm debug      show where the URL and the key come from',
  '/litellm close      close the pane',
  '',
  'Admin commands (need litellm_admin_key, or a key that may manage keys):',
  '/litellm keys [--user ID | --team ID | --all]',
  KEY_HELP,
  GRANT_HELP,
  '/litellm org [id|alias]',
  '/litellm fallbacks [model]',
  'Every change shows a preview first; --dry-run stops there, --yes skips the confirmation.',
  'A new key goes to the clipboard, never to the transcript.',
].join('\n')

/** What /litellm needs from the engine; register.tsx builds it from `$`. */
export type CommandContext = {
  session: Session
  now: () => Promise<number>
  surfaces: () => Promise<readonly string[]>
  ensureFresh: () => Promise<void>
  refresh: () => Promise<void>
  reload: () => void
  openPane: () => Promise<{ isPlaced: boolean; reason?: string }>
  closePane: () => Promise<void>
  sleep: (ms: number) => Promise<void>
  admin: () => Promise<{ deps: Deps } | { text: string }>
}

const report = async (ctx: CommandContext, view: (snapshot: Snapshot, now: number) => string): Promise<string> => {
  const now = await ctx.now()
  const { snapshot, failure } = ctx.session.state.latest

  if (!snapshot) {
    return failure ? failureText(failure) : 'Reading the key from the proxy… the answer shows up here and in the pane.'
  }

  return `${view(snapshot, now)}${failure ? `\n(stale) ${failure.message}` : ''}`
}

const debugText = async (ctx: CommandContext): Promise<string> => {
  const surfaces = await ctx.surfaces()
  const { config, diagnostics, pinnedRoot, latest } = ctx.session.state
  const { snapshot, failure } = latest
  const lines = [
    `Refresh every ${config.refreshSeconds}s · status line ${config.isStatusShown ? 'on' : 'off'} · related ${config.isRelatedShown ? 'on' : 'off'} · usage ${config.isUsageShown ? 'on' : 'off'} · compact pane ${config.isCompact ? 'on' : 'off'}`,
    diagnostics
      ? `Proxy    ${diagnostics.host} (tries ${diagnostics.roots.join(', ')}${pinnedRoot ? `; using ${pinnedRoot}` : ''})`
      : 'Proxy    not resolved',
    diagnostics ? `Key      ${diagnostics.keyHint} from ${diagnostics.keySource}` : 'Key      not resolved',
    config.adminKey
      ? `Admin    ${maskKey(config.adminKey)} from plugin option litellm_admin_key`
      : 'Admin    not set (admin commands use the virtual key, which the proxy may refuse)',
    failure
      ? `Result   failed (${failure.kind}${failure.status === null ? '' : ` ${failure.status}`}): ${failure.message}`
      : snapshot
        ? `Result   ok at ${clock(snapshot.fetchedAt)}`
        : 'Result   nothing fetched yet',
    `Surfaces ${surfaces.length === 0 ? 'none (headless)' : surfaces.join(', ')}`,
    ...(failure?.hint ? [`Hint     ${failure.hint}`] : []),
    ...(snapshot ? snapshot.notes.map(note => `Note     ${note}`) : []),
  ]

  return lines.join('\n')
}

/** Runs `/litellm <args>` and answers with the text to print. */
export const runCommand = async (ctx: CommandContext, args: string): Promise<{ text: string }> => {
  const { config } = ctx.session.state
  const [word = ''] = args.trim().split(/\s+/)

  try {
    switch (word.toLowerCase()) {
      case '':
      case 'pane':
      case 'open': {
        const reading = ctx.ensureFresh()

        if ((await ctx.surfaces()).length === 0) {
          await reading

          return { text: await report(ctx, (snapshot, now) => summaryText(snapshot, now, config.warnPercent)) }
        }
        const opened = await ctx.openPane()

        await Promise.race([reading, ctx.sleep(PANE_WAIT_MS)])
        const line = await report(ctx, (snapshot, now) => oneLine(snapshot, now))

        return {
          text: opened.isPlaced
            ? line
            : `${line}\nThe pane could not be shown (${opened.reason}). Use /litellm info instead.`,
        }
      }
      case 'close':
      case 'hide':
        await ctx.closePane()

        return { text: 'Pane closed.' }
      case 'refresh':
      case 'reload':
      case 'r':
        await ctx.refresh()

        return { text: await report(ctx, (snapshot, now) => oneLine(snapshot, now)) }
      case 'info':
      case 'text':
      case 'summary':
        await ctx.ensureFresh()

        return { text: await report(ctx, (snapshot, now) => summaryText(snapshot, now, config.warnPercent)) }
      case 'models':
        await ctx.ensureFresh()

        return {
          text: await report(ctx, snapshot => {
            const names = snapshot.models ?? snapshot.key.models

            return names.length === 0 ? `Models: ${modelsText(snapshot)}` : modelsTable(snapshot, names)
          }),
        }
      case 'keys':
      case 'key':
      case 'grant':
      case 'org':
      case 'fallbacks': {
        const ready = await ctx.admin()

        if (!('deps' in ready)) {
          return { text: ready.text }
        }
        const outcome = await runAdmin(ready.deps, word.toLowerCase() as AdminCommand, args.trim().slice(word.length))

        if (outcome.isChanged) {
          ctx.reload()
        }

        return { text: outcome.text }
      }
      case 'debug':
      case 'diag':
      case 'doctor':
        await ctx.ensureFresh()

        return { text: await debugText(ctx) }
      case 'help':
      case '-h':
      case '--help':
        return { text: HELP }
      default:
        return { text: `Unknown option "${truncate(word, 30)}".\n${HELP}` }
    }
  } catch (error) {
    return { text: `Unexpected error: ${truncate(redact(error instanceof Error ? error.message : String(error)), 160)}` }
  }
}
