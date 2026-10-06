import type { ActivityDay, KeyInfo, Usage } from '../types'
import { clean, utcDay } from './format'
import { isObject, num } from './json'

// The pane lists this many models of the week; past that the long tail is noise.
const TOP_MODELS = 5
/** The totals of the pane are the last week of the history. */
export const WEEK = 7
/** How many days of history the proxy is asked for. */
export const HISTORY_DAYS = 30

/** The days the history covers, up to the one `now` falls on (UTC, as the proxy counts), the oldest first. */
export const historyDays = (now: number): string[] =>
  Array.from({ length: HISTORY_DAYS }, (_, at) => utcDay(now, HISTORY_DAYS - 1 - at))

/** What to ask /user/daily/activity: the days, this key's user and, when it is known, this key alone by its hash. */
export const usageQuery = (key: Pick<KeyInfo, 'userId' | 'keyHash'>, days: readonly string[]): string =>
  [
    `start_date=${days[0] ?? ''}`,
    `end_date=${days[days.length - 1] ?? ''}`,
    `user_id=${encodeURIComponent(key.userId ?? '')}`,
    key.keyHash ? `api_key=${key.keyHash}` : '',
    'page_size=1000',
  ]
    .filter(Boolean)
    .join('&')

// No day of a key spends or counts past this: a figure beyond it is noise, and sums of such would reach Infinity.
const MOST = 1e15

const amount = (value: unknown): number => {
  const found = num(value) ?? 0

  return Math.abs(found) <= MOST ? found : 0
}

const quiet = (date: string): ActivityDay => ({
  date,
  spend: 0,
  requests: 0,
  failed: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  models: [],
})

/**
 * The activity endpoint as the last `days` of history, day by day with the models of each, and the last week of it in
 * totals. `days` runs from the oldest to today; a day the proxy did not list is a quiet one.
 */
export const parseUsage = (body: unknown, days: readonly string[]): Usage | null => {
  if (!isObject(body) || !Array.isArray(body.results)) {
    return null
  }
  const week = new Set(days.slice(-WEEK))
  const perDay = new Map<string, ActivityDay>(days.map(day => [day, quiet(day)]))
  const perModel = new Map<string, number>()
  const total = { spend: 0, requests: 0, tokens: 0, input: 0, output: 0, cacheRead: 0 }

  for (const result of body.results) {
    const date = isObject(result) ? String(result.date ?? '').slice(0, 10) : ''
    const day = perDay.get(date)

    if (!isObject(result) || !day) {
      continue
    }
    const metrics = isObject(result.metrics) ? result.metrics : {}
    const spend = amount(metrics.spend)

    day.spend += spend
    day.requests += amount(metrics.api_requests)
    day.failed += amount(metrics.failed_requests)
    day.tokens += amount(metrics.total_tokens)
    day.inputTokens += amount(metrics.prompt_tokens)
    day.outputTokens += amount(metrics.completion_tokens)
    day.cacheReadTokens += amount(metrics.cache_read_input_tokens)
    if (week.has(date)) {
      total.spend += spend
      total.requests += amount(metrics.api_requests)
      total.tokens += amount(metrics.total_tokens)
      total.input += amount(metrics.prompt_tokens)
      total.output += amount(metrics.completion_tokens)
      total.cacheRead += amount(metrics.cache_read_input_tokens)
    }
    const models = isObject(result.breakdown) && isObject(result.breakdown.models) ? result.breakdown.models : {}

    for (const [name, entry] of Object.entries(models)) {
      const model = clean(name)
      const own = isObject(entry) && isObject(entry.metrics) ? entry.metrics : {}
      const modelSpend = amount(own.spend)
      const requests = amount(own.api_requests)

      if (week.has(date)) {
        perModel.set(model, (perModel.get(model) ?? 0) + modelSpend)
      }
      if (modelSpend <= 0 && requests <= 0) {
        continue
      }
      const held = day.models.find(item => item.model === model)

      if (held) {
        held.spend += modelSpend
        held.requests += requests
        held.tokens += amount(own.total_tokens)
      } else {
        day.models.push({ model, spend: modelSpend, requests, tokens: amount(own.total_tokens) })
      }
    }
  }
  const history = days.map(day => perDay.get(day) ?? quiet(day))

  return {
    days: history.slice(-WEEK).map(({ date, spend }) => ({ date, spend })),
    spend: total.spend,
    requests: total.requests,
    tokens: total.tokens,
    inputTokens: total.input,
    outputTokens: total.output,
    cacheReadTokens: total.cacheRead,
    topModels: [...perModel.entries()]
      .filter(([, spend]) => spend > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_MODELS)
      .map(([model, spend]) => ({ model, spend })),
    history,
  }
}

/** The activity endpoint pages its rows: more than one page means the history is not all in the answer. */
export const hasMoreRows = (body: unknown): boolean =>
  isObject(body) && isObject(body.metadata) && body.metadata.has_more === true
