import type { ViewName } from '../types'
import type { AdminCommand } from './admin-commands'
import { GRANT_HELP, KEY_HELP, runAdmin } from './admin-commands'
import type { CommandContext, CommandResult } from './command-context'
import { report } from './command-context'
import {
  checkCommand,
  compareCommand,
  csvCommand,
  dayCommand,
  jsonCommand,
  modelsCommand,
  paceCommand,
  refreshCommand,
  statusCommand,
  usageCommand,
} from './commands-reports'
import { copyCommand, shareCommand } from './commands-share'
import { clock, maskKey, money, redact, truncate, withoutCredentials } from './format'
import { oneLine, summaryText } from './summary'
import { textOf } from './tab-text'
import { closest, splitWords } from './words'

export type { CommandContext, CommandResult } from './command-context'

const PANE_WAIT_MS = 2_500

const HELP = [
  '/litellm                  open the live pane (on the tab you left it)',
  '/litellm tab <name>       open the pane on overview, usage, models, details, ping or admin',
  '/litellm refresh          read the key again now',
  '/litellm info             print the full summary here',
  '/litellm status           print the status line as text',
  '/litellm pace             where the budget is heading, and what it can spend a day',
  '/litellm usage [7|14|30]  print the spend per day, as a table',
  '/litellm compare [7|14]   what changed against the days before, model by model',
  '/litellm day [when]       one day by model: today, yesterday, 2026-10-03, 10-03, mon',
  '/litellm models [text]    list the models this key can call, with their prices',
  '/litellm check [warn%]    OK, WARNING, CRITICAL or UNKNOWN: the exit code of a -p run too',
  '/litellm json             everything as JSON, for scripts',
  '/litellm csv [7|14|30]    the days as CSV',
  '/litellm copy [what]      copy a report: overview, usage, models, details, pace, compare, csv, json',
  '/litellm share [what]     hand a report to Claude, to ask about it',
  '/litellm ping             try every endpoint the plugin reads, with times',
  '/litellm debug            show where the URL and the key come from',
  '/litellm close            close the pane',
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

// What a typo of a subcommand is held against: the names, not their aliases.
const VIEWS: readonly ViewName[] = ['overview', 'usage', 'models', 'details', 'ping', 'admin']

const viewNamed = (word: string): ViewName | null =>
  VIEWS.find((view, at) => view === word.toLowerCase() || String(at + 1) === word) ?? null

const NAMES = [
  'tab',
  'refresh',
  'info',
  'status',
  'pace',
  'usage',
  'compare',
  'day',
  'models',
  'check',
  'json',
  'csv',
  'copy',
  'share',
  'ping',
  'keys',
  'key',
  'grant',
  'org',
  'fallbacks',
  'debug',
  'close',
  'help',
]

const debugText = async (ctx: CommandContext): Promise<string> => {
  const surfaces = await ctx.surfaces()
  const { config, diagnostics, pinnedRoot, latest } = ctx.session.state
  const view = await ctx.view()
  const { snapshot, failure } = latest
  const lines = [
    `Refresh every ${config.refreshSeconds}s · status line ${config.isStatusShown ? 'on' : 'off'} · related ${config.isRelatedShown ? 'on' : 'off'} · usage ${config.isUsageShown ? 'on' : 'off'} · compact pane ${config.isCompact ? 'on' : 'off'}`,
    `Alerts   toasts ${config.isToastShown ? 'on' : 'off'} · warn at ${config.warnPercent}% · daily alert ${config.dailyAlert > 0 ? money(config.dailyAlert) : 'off'}`,
    `Pane     ${view.tab} tab · ${view.range} days`,
    diagnostics
      ? `Proxy    ${diagnostics.host} (tries ${diagnostics.roots.map(withoutCredentials).join(', ')}${pinnedRoot ? `; using ${withoutCredentials(pinnedRoot)}` : ''})`
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

/** Opens the pane, on `tab` when one is given, and answers with what to print: a line, or the tab as text if nothing draws. */
const showPane = async (ctx: CommandContext, tab: ViewName | null): Promise<string> => {
  const reading = ctx.ensureFresh()

  if ((await ctx.surfaces()).length === 0) {
    await reading
    const view = await ctx.view()

    return report(ctx, textOf(tab ?? view.tab, view.range, ctx.session.state.config))
  }
  const opened = await ctx.openPane(tab)

  await Promise.race([reading, ctx.sleep(PANE_WAIT_MS)])
  const line = await report(ctx, (snapshot, now) => oneLine(snapshot, now))

  return opened.isPlaced ? line : `${line}\nThe pane could not be shown (${opened.reason}). Use /litellm info instead.`
}

/** Runs `/litellm <args>` and answers with the text to print. */
export const runCommand = async (ctx: CommandContext, args: string): Promise<CommandResult> => {
  const { config } = ctx.session.state
  const { word, rest } = splitWords(args)

  try {
    switch (word.toLowerCase()) {
      case '':
      case 'pane':
      case 'open':
        return { text: await showPane(ctx, null) }
      case 'tab':
      case 'view': {
        const named = rest[0] ?? ''
        const tab = viewNamed(named)
        const guess = tab === null ? closest(named, VIEWS) : null

        return {
          text:
            tab === null
              ? `Unknown tab "${truncate(named, 30)}".${guess === null ? '' : ` Did you mean "${guess}"?`} The tabs are ${VIEWS.join(', ')}.`
              : await showPane(ctx, tab),
        }
      }
      case 'close':
      case 'hide':
        await ctx.closePane()

        return { text: 'Pane closed.' }
      case 'refresh':
      case 'reload':
      case 'r':
        return refreshCommand(ctx)
      case 'info':
      case 'text':
      case 'summary':
        await ctx.ensureFresh()

        return { text: await report(ctx, (snapshot, now) => summaryText(snapshot, now, config.warnPercent)) }
      case 'status':
      case 'line':
        return statusCommand(ctx)
      case 'pace':
      case 'forecast':
      case 'runway':
        return paceCommand(ctx)
      case 'usage':
        return usageCommand(ctx, rest)
      case 'compare':
      case 'movers':
        return compareCommand(ctx, rest)
      case 'day':
        return dayCommand(ctx, rest[0] ?? '')
      case 'models':
        return modelsCommand(ctx, rest)
      case 'check':
        return checkCommand(ctx, rest[0])
      case 'json':
        return jsonCommand(ctx)
      case 'csv':
        return csvCommand(ctx, rest)
      case 'copy':
        return copyCommand(ctx, rest)
      case 'share':
        return shareCommand(ctx, rest)
      case 'ping':
      case 'health':
        return ctx.ping()
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
      default: {
        const guess = closest(word, NAMES)

        return { text: `Unknown option "${truncate(word, 30)}".${guess === null ? '' : ` Did you mean "${guess}"?`}\n${HELP}` }
      }
    }
  } catch (error) {
    return {
      text: `Unexpected error: ${truncate(redact(error instanceof Error ? error.message : String(error)), 160)}`,
      exitCode: 3,
    }
  }
}
