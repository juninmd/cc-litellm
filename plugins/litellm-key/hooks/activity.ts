import type { ActivityDay, Usage } from '../types'
import { clean } from './format'
import { isObject, num } from './json'

// The pane lists this many models of the week; past that the long tail is noise.
const TOP_MODELS = 5
/** The totals of the pane are the last week of the history. */
export const WEEK = 7
/** How many days of history the proxy is asked for. */
export const HISTORY_DAYS = 30

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
    const spend = num(metrics.spend) ?? 0

    day.spend += spend
    day.requests += num(metrics.api_requests) ?? 0
    day.failed += num(metrics.failed_requests) ?? 0
    day.tokens += num(metrics.total_tokens) ?? 0
    day.inputTokens += num(metrics.prompt_tokens) ?? 0
    day.outputTokens += num(metrics.completion_tokens) ?? 0
    day.cacheReadTokens += num(metrics.cache_read_input_tokens) ?? 0
    if (week.has(date)) {
      total.spend += spend
      total.requests += num(metrics.api_requests) ?? 0
      total.tokens += num(metrics.total_tokens) ?? 0
      total.input += num(metrics.prompt_tokens) ?? 0
      total.output += num(metrics.completion_tokens) ?? 0
      total.cacheRead += num(metrics.cache_read_input_tokens) ?? 0
    }
    const models = isObject(result.breakdown) && isObject(result.breakdown.models) ? result.breakdown.models : {}

    for (const [name, entry] of Object.entries(models)) {
      const model = clean(name)
      const own = isObject(entry) && isObject(entry.metrics) ? entry.metrics : {}
      const modelSpend = num(own.spend) ?? 0
      const requests = num(own.api_requests) ?? 0

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
        held.tokens += num(own.total_tokens) ?? 0
      } else {
        day.models.push({ model, spend: modelSpend, requests, tokens: num(own.total_tokens) ?? 0 })
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
