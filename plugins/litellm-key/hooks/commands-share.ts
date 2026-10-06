import type { Snapshot, ViewName } from '../types'
import type { CommandContext, CommandResult } from './command-context'
import { current } from './command-context'
import { detailsText } from './details'
import { clock, plural, truncate } from './format'
import { COMPARABLE, RANGES } from './history'
import { modelsReport } from './report-models'
import { compareReport } from './report-days'
import { jsonReport } from './report-json'
import { paceReport } from './report-key'
import { NO_HISTORY, usageCsv, usageReport } from './report-usage'
import type { Config } from './settings'
import { summaryText } from './summary'
import { rangeIn } from './words'

const TAB_WHAT: Record<ViewName, string> = {
  overview: 'the summary',
  usage: 'the usage report',
  models: 'the model list',
  details: 'the key details',
}

const REPORTS = 'overview, usage, models, details, pace, compare, csv, json'

/**
 * A report the person can name, to copy it or hand it to Claude: how it is made, what to call it, and whether it is
 * nothing but a table of the usage history (with no history there is nothing to copy, not a sentence about it).
 */
type Named = { build: (snapshot: Snapshot, now: number) => string; what: string; needsUsage: boolean }

/** What a tab says as text: what `/litellm` prints where nothing can draw a pane. */
export const textOf = (tab: ViewName, range: number, config: Config): ((snapshot: Snapshot, now: number) => string) => {
  switch (tab) {
    case 'usage':
      return snapshot => usageReport(snapshot, range)
    case 'models':
      return snapshot => modelsReport(snapshot, range)
    case 'details':
      return (snapshot, now) => detailsText(snapshot, now, config.refreshSeconds)
    default:
      return (snapshot, now) => summaryText(snapshot, now, config.warnPercent)
  }
}

/** `name` as a report (none given: the tab that is showing); null for a name that is no report. */
const namedReport = (name: string, tab: ViewName, range: number, config: Config): Named | null => {
  switch (name.toLowerCase()) {
    case '':
      return { build: textOf(tab, range, config), what: TAB_WHAT[tab], needsUsage: tab === 'usage' }
    case 'overview':
    case 'info':
    case 'summary':
      return { build: textOf('overview', range, config), what: TAB_WHAT.overview, needsUsage: false }
    case 'usage':
      return { build: textOf('usage', range, config), what: TAB_WHAT.usage, needsUsage: true }
    case 'models':
      return { build: textOf('models', range, config), what: TAB_WHAT.models, needsUsage: false }
    case 'details':
      return { build: textOf('details', range, config), what: TAB_WHAT.details, needsUsage: false }
    case 'pace':
      return { build: paceReport, what: 'the pace report', needsUsage: false }
    case 'compare':
      return { build: snapshot => compareReport(snapshot, COMPARABLE.includes(range) ? range : 7), what: 'the comparison', needsUsage: true }
    case 'csv':
      return { build: snapshot => usageCsv(snapshot, range), what: `${range} days as CSV`, needsUsage: true }
    case 'json':
      return {
        build: (snapshot, now) => jsonReport(snapshot, now, { warnPercent: config.warnPercent, dailyAlert: config.dailyAlert }),
        what: 'the JSON',
        needsUsage: false,
      }
    default:
      return null
  }
}

/** The report a person named with `/litellm copy` or `/litellm share`, made from what was last read. */
const requested = async (
  ctx: CommandContext,
  words: readonly string[],
  fallback: ViewName | null,
): Promise<{ named: Named; text: string; snapshot: Snapshot } | string> => {
  const name = words[0] ?? ''
  const { config } = ctx.session.state
  const view = await ctx.view()
  const range = rangeIn(words.slice(1), RANGES, view.range)
  const named = namedReport(name, fallback ?? 'overview', range, config)

  if (named === null) {
    return `Unknown report "${truncate(name, 30)}". The reports are ${REPORTS}.`
  }
  await ctx.ensureFresh()
  const got = await current(ctx)

  if (typeof got === 'string') {
    return got
  }

  return named.needsUsage && got.snapshot.usage === null
    ? NO_HISTORY
    : { named, snapshot: got.snapshot, text: named.build(got.snapshot, got.now) }
}

/** The command that prints what `copy` could not put on the clipboard: the report's own, or the nearest to it. */
const printing = (name: string, tab: ViewName): string => {
  const word = name.toLowerCase() || tab

  switch (word) {
    case 'overview':
    case 'summary':
      return 'info'
    case 'details':
      return 'tab details'
    default:
      return word
  }
}

export const copyCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  const { tab } = await ctx.view()
  const found = await requested(ctx, words, tab)

  if (typeof found === 'string') {
    return { text: found }
  }
  const result = await ctx.copy(found.text)
  const lines = plural(found.text.split('\n').length, 'line')

  return {
    text: result.isCopied
      ? `Copied ${found.named.what} (${lines}).`
      : `Could not copy ${found.named.what} (${result.reason}). Use /litellm ${printing(words[0] ?? '', tab)} to print it instead.`,
  }
}

/** Puts a report in front of Claude, out of the person's sight, so that what comes next can be asked about it. */
export const shareCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  const found = await requested(ctx, words, null)

  if (typeof found === 'string') {
    return { text: found }
  }
  const { named, snapshot, text } = found

  return {
    text: `Shared ${named.what} with Claude. Ask it about your spend, budget or usage.`,
    context: [
      `The user ran /litellm share. Below is ${named.what} for their LiteLLM virtual key, read from ${snapshot.host} at ${clock(snapshot.fetchedAt)}. It never holds the key itself. Use it when they ask about their spend, budget or usage.\n\n${text}`,
    ],
  }
}
