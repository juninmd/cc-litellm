import type { ActivityDay, Usage, UsageModel } from '../types'
import { utcDay } from '../hooks/format'
import { NOW } from './support'

export const model = (name: string, spend: number, requests = 1, tokens = 1000): UsageModel => ({ model: name, spend, requests, tokens })

export const day = (date: string, spend: number, models: UsageModel[] = []): ActivityDay => ({
  date,
  spend,
  requests: spend > 0 ? Math.round(spend * 10) : 0,
  failed: 0,
  tokens: spend * 1000,
  inputTokens: spend * 800,
  outputTokens: spend * 200,
  cacheReadTokens: spend * 500,
  models,
})

/** A usage whose history is `days`, with the week's totals of its last seven; what the proxy would have summed. */
export const usageOf = (days: readonly ActivityDay[]): Usage => {
  const week = days.slice(-7)
  const sum = (pick: (item: ActivityDay) => number): number => week.reduce((total, item) => total + pick(item), 0)

  return {
    days: week.map(item => ({ date: item.date, spend: item.spend })),
    spend: sum(item => item.spend),
    requests: sum(item => item.requests),
    tokens: sum(item => item.tokens),
    inputTokens: sum(item => item.inputTokens),
    outputTokens: sum(item => item.outputTokens),
    cacheReadTokens: sum(item => item.cacheReadTokens),
    topModels: [],
    history: [...days],
  }
}

/** The days ending today, one value each, oldest first. */
export const history = (spends: readonly number[]): Usage =>
  usageOf(spends.map((spend, at) => day(utcDay(NOW, spends.length - 1 - at), spend)))
