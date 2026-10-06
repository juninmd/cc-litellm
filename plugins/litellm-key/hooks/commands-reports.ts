import type { CommandContext, CommandResult } from './command-context'
import { current, report } from './command-context'
import { truncate } from './format'
import { modelsText } from './facts'
import { COMPARABLE, RANGES } from './history'
import { modelsTable } from './prices'
import { compareReport, dayReport } from './report-days'
import { jsonReport } from './report-json'
import { checkVerdict, paceReport } from './report-key'
import { NO_HISTORY, usageCsv, usageReport } from './report-usage'
import { oneLine, statusText } from './summary'
import { parseDay, rangeIn, strayNumber } from './words'

const READS = 'the plugin reads: 7, 14 or 30'
const COMPARES = 'to compare: 7 or 14'

/** A line for a number that was asked for and is no range of the command, once the report is shown anyway. */
const strayNote = (stray: string | null, shown: number, takes: string): string =>
  stray === null ? '' : `\n(${stray} is not a range ${takes}. This is ${shown} days.)`

export const refreshCommand = async (ctx: CommandContext): Promise<CommandResult> => {
  await ctx.refresh()

  return { text: await report(ctx, (snapshot, now) => oneLine(snapshot, now)) }
}

export const statusCommand = async (ctx: CommandContext): Promise<CommandResult> => {
  await ctx.ensureFresh()
  const { dailyAlert } = ctx.session.state.config

  return { text: await report(ctx, (snapshot, now) => statusText(snapshot, null, now, dailyAlert) ?? 'no data') }
}

export const paceCommand = async (ctx: CommandContext): Promise<CommandResult> => {
  await ctx.ensureFresh()

  return { text: await report(ctx, paceReport) }
}

export const usageCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  const days = rangeIn(words, RANGES, 7)
  const stray = strayNumber(words, RANGES)

  await ctx.ensureFresh()

  return { text: await report(ctx, snapshot => `${usageReport(snapshot, days)}${strayNote(stray, days, READS)}`) }
}

export const compareCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  const days = rangeIn(words, RANGES, 7)
  const stray = strayNumber(words, RANGES)

  if (!COMPARABLE.includes(days)) {
    return { text: `Comparing ${days} days takes ${days * 2} days of history, and the plugin reads 30. Use 7 or 14.` }
  }
  await ctx.ensureFresh()

  return { text: await report(ctx, snapshot => `${compareReport(snapshot, days)}${strayNote(stray, days, COMPARES)}`) }
}

/** The days of the history that `/litellm day` can name, and what it answers to a name that is none. */
export const dayCommand = async (ctx: CommandContext, word: string): Promise<CommandResult> => {
  await ctx.ensureFresh()

  return {
    text: await report(ctx, snapshot => {
      if (snapshot.usage === null) {
        return NO_HISTORY
      }
      const days = snapshot.usage.history.map(item => item.date)
      const date = parseDay(word, days)
      const latest = days[days.length - 1] ?? '2026-10-03'

      return date === null
        ? `No day "${truncate(word, 20)}" in the history of ${days.length} days. Try today, yesterday, a date such as ${latest} or ${latest.slice(5)}, or a weekday such as mon.`
        : dayReport(snapshot, date)
    }),
  }
}

/** `/litellm check`: the verdict and the exit code a `claude -p` run ends with, so a script can act on it. */
export const checkCommand = async (ctx: CommandContext, word: string | undefined): Promise<CommandResult> => {
  const { config } = ctx.session.state
  const warn = word === undefined ? config.warnPercent : Number.parseInt(word, 10)

  if (!(warn >= 1 && warn <= 99)) {
    return { text: 'Usage: /litellm check [warn%], with the percentage from 1 to 99.', exitCode: 3 }
  }
  await ctx.ensureFresh()
  const { snapshot, failure } = ctx.session.state.latest
  const verdict = checkVerdict(snapshot, failure, await ctx.now(), warn, config.dailyAlert)

  return { text: verdict.text, exitCode: verdict.exitCode }
}

/** `/litellm json`: the reading as JSON and nothing else, even an error, for a script to parse. */
export const jsonCommand = async (ctx: CommandContext): Promise<CommandResult> => {
  await ctx.ensureFresh()
  const got = await current(ctx)
  const { config, latest } = ctx.session.state

  if (typeof got === 'string') {
    const { failure } = latest
    const error = failure ? { kind: failure.kind, message: failure.message, hint: failure.hint } : { kind: 'pending', message: got }

    return { text: JSON.stringify({ schema: 1, error }, null, 2), exitCode: 3 }
  }

  return {
    text: jsonReport(got.snapshot, got.now, {
      warnPercent: config.warnPercent,
      dailyAlert: config.dailyAlert,
      stale: got.failure?.message ?? null,
    }),
  }
}

/** `/litellm csv`: the days as CSV and nothing else, to be redirected into a file. */
export const csvCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  await ctx.ensureFresh()
  const got = await current(ctx)

  if (typeof got === 'string') {
    return { text: got, exitCode: 3 }
  }

  return got.snapshot.usage === null ? { text: NO_HISTORY, exitCode: 3 } : { text: usageCsv(got.snapshot, rangeIn(words, RANGES, 7)) }
}

/** `/litellm models [text]`: the models the key can call, with their prices, or just the ones that hold `text`. */
export const modelsCommand = async (ctx: CommandContext, words: readonly string[]): Promise<CommandResult> => {
  await ctx.ensureFresh()
  const needle = words.join(' ').toLowerCase()

  return {
    text: await report(ctx, snapshot => {
      const names = snapshot.models ?? snapshot.key.models
      const shown = needle === '' ? names : names.filter(name => name.toLowerCase().includes(needle))

      if (names.length === 0) {
        return `Models: ${modelsText(snapshot)}`
      }
      if (shown.length === 0) {
        return `No model of ${names.length} has "${truncate(needle, 30)}" in its name.`
      }

      return modelsTable(snapshot, shown, needle === '' ? undefined : `Models (${shown.length} of ${names.length} have "${truncate(needle, 30)}")`)
    }),
  }
}
