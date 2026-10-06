import { describe, expect, test } from 'claude-code/testing'

import { HISTORY_DAYS, WEEK, hasMoreRows, parseUsage } from '../hooks/activity'
import { utcDay } from '../hooks/format'
import { activity } from './activity-fixtures'
import { standardUsage } from './factories'
import { near } from './near'
import { NOW, snapshotOf, standardRoutes } from './support'

const month = Array.from({ length: HISTORY_DAYS }, (_, at) => utcDay(NOW, HISTORY_DAYS - 1 - at))
const body = (spends: readonly number[]) => JSON.parse((activity(spends) as { text: string }).text)

describe('parseUsage: the history', () => {
  test('keeps the last 30 days, a quiet day as zeros, and the last week in totals', () => {
    const usage = parseUsage(standardUsage(), month)

    expect(usage?.history).toHaveLength(30)
    expect(usage?.history.at(-1)).toMatchObject({ date: '2026-10-03', spend: 8.7, requests: 90, tokens: 1700000 })
    expect(usage?.history.at(-2)).toMatchObject({ date: '2026-10-02', spend: 0, requests: 0, tokens: 0, models: [] })
    expect(usage?.days).toHaveLength(WEEK)
    expect(usage?.days.map(day => day.date)).toEqual(month.slice(-WEEK))
    near(usage?.spend, 14.2)
    expect(usage?.requests).toBe(150)
  })

  test('counts the week only, though the history goes further back', () => {
    const usage = parseUsage(body([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7]), month)

    expect(usage?.history.reduce((sum, day) => sum + day.spend, 0)).toBe(33)
    expect(usage?.spend).toBe(28)
    expect(usage?.topModels.map(item => item.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1'])
  })

  test('keeps what each day did: tokens split, failures and the models', () => {
    const rows = {
      results: [
        {
          date: '2026-10-03',
          metrics: { spend: 3, api_requests: 8, failed_requests: 2, total_tokens: 100, prompt_tokens: 80, completion_tokens: 20, cache_read_input_tokens: 50 },
          breakdown: { models: { a: { metrics: { spend: 2, api_requests: 5, total_tokens: 60 } }, b: { metrics: { spend: 1, api_requests: 3, total_tokens: 40 } } } },
        },
      ],
    }
    const day = parseUsage(rows, ['2026-10-03'])?.history[0]

    expect(day).toMatchObject({ spend: 3, requests: 8, failed: 2, tokens: 100, inputTokens: 80, outputTokens: 20, cacheReadTokens: 50 })
    expect(day?.models).toEqual([
      { model: 'a', spend: 2, requests: 5, tokens: 60 },
      { model: 'b', spend: 1, requests: 3, tokens: 40 },
    ])
  })

  test('adds up rows of one day, and skips models that did nothing', () => {
    const row = (spend: number, models: Record<string, unknown>) => ({
      date: '2026-10-03',
      metrics: { spend, api_requests: 4, failed_requests: 1, total_tokens: 10 },
      breakdown: { models },
    })
    const usage = parseUsage(
      {
        results: [
          row(1, { a: { metrics: { spend: 1, api_requests: 4, total_tokens: 10 } }, idle: { metrics: { spend: 0 } } }),
          row(2, { a: { metrics: { spend: 2, api_requests: 4, total_tokens: 10 } } }),
          { date: '2026-09-01', metrics: { spend: 99 } },
        ],
      },
      ['2026-10-03'],
    )

    expect(usage?.history).toHaveLength(1)
    expect(usage?.history[0]).toMatchObject({ spend: 3, requests: 8, failed: 2, tokens: 20 })
    expect(usage?.history[0]?.models).toEqual([{ model: 'a', spend: 3, requests: 8, tokens: 20 }])
  })

  test('survives rows that are not objects and models that carry no metrics', () => {
    const usage = parseUsage({ results: ['x', null, { date: '2026-10-03', breakdown: { models: { a: 5, b: {} } } }] }, ['2026-10-03'])

    expect(usage?.history[0]).toMatchObject({ spend: 0, requests: 0, models: [] })
  })

  test('cleans the model names of control characters', () => {
    const rows = { results: [{ date: '2026-10-03', metrics: { spend: 1 }, breakdown: { models: { '\u001b[31msonnet\u0000': { metrics: { spend: 1, api_requests: 1 } } } } }] }

    expect(parseUsage(rows, ['2026-10-03'])?.history[0]?.models.map(item => item.model)).toEqual(['sonnet'])
    expect(parseUsage(rows, ['2026-10-03'])?.topModels.map(item => item.model)).toEqual(['sonnet'])
  })

  test('has nothing for an answer without results', () => {
    expect(parseUsage({}, month)).toBeNull()
    expect(parseUsage('nope', month)).toBeNull()
  })

  test('says when the answer has more rows than a page', () => {
    expect(hasMoreRows({ results: [], metadata: { has_more: true } })).toBe(true)
    expect(hasMoreRows({ results: [], metadata: { has_more: false } })).toBe(false)
    expect(hasMoreRows({ results: [] })).toBe(false)
  })
})

describe('the snapshot carries the history', () => {
  test('30 days of it, with the week in totals beside it', async () => {
    const { usage } = await snapshotOf()

    expect(usage?.history).toHaveLength(30)
    expect(usage?.history.at(-1)?.date).toBe('2026-10-03')
    expect(usage?.days).toHaveLength(7)
  })

  test('is the same history for another list of rows', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/user/daily/activity': activity([0, 0, 2, 4]) })

    expect(snapshot.usage?.history.slice(-4).map(day => day.spend)).toEqual([0, 0, 2, 4])
  })
})
