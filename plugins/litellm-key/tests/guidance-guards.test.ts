import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { parseUsage } from '../hooks/activity'
import { alertsOf } from '../hooks/alerts'
import { dailyOver, headroomText, recentDaily, todayOf, todayRow } from '../hooks/guidance'
import { history } from './history-fixtures'
import { near } from './near'
import { NOW, snapshotOf, withKey } from './support'

const DAY = 86_400_000

describe('recentDaily', () => {
  test('averages the last seven full days, never counting today', () => {
    // ten full days, then today: only the last seven of the ten are the usual day
    expect(recentDaily(history([100, 100, 100, 2, 4, 6, 8, 10, 12, 14, 500]))).toBe(8)
  })

  test('starts counting at the first day with spend, so a young key is not diluted', () => {
    expect(recentDaily(history([0, 0, 0, 0, 3, 5, 7, 99]))).toBe(5)
  })

  test('has nothing to say while no full day has spent anything', () => {
    expect(recentDaily(history([0, 0, 0, 0]))).toBeNull()
    expect(recentDaily(history([0, 0, 0, 40]))).toBeNull()
    expect(recentDaily(null)).toBeNull()
  })

  test('takes the day that is still going as the last one only while it is the day it is', () => {
    const usage = history([1, 2, 3])

    expect(todayOf(usage, NOW)?.spend).toBe(3)
    expect(todayOf(usage, NOW + DAY)).toBeNull()
  })
})

describe('what is said of today and the daily alert', () => {
  const unhashed = async (): Promise<Snapshot> => {
    const base = await snapshotOf(withKey({ spend: 12.5 }))

    // the usage of a key the proxy named by something that is no hash covers every key of the user
    return { ...base, key: { ...base.key, keyHash: null } }
  }

  test('is left out when the usage is the user\'s and not the key\'s: it would be said of this key', async () => {
    const snapshot = await unhashed()

    expect(todayRow(snapshot, NOW)).toBeNull()
    expect(dailyOver(snapshot, NOW, 5)).toBeNull()
  })

  test('is said when the usage is the key\'s', async () => {
    const snapshot = await snapshotOf()

    expect(todayRow(snapshot, NOW)?.label).toBe('Today')
    near(dailyOver(snapshot, NOW, 5) ?? 0, 8.7)
  })
})

describe('headroom of absurd amounts', () => {
  test('says nothing when the quotient is no number, instead of "about Infinity more requests"', async () => {
    const base = await snapshotOf()
    const absurd: Snapshot = { ...base, usage: base.usage && { ...base.usage, spend: 1e-300, requests: 150 } }

    expect(headroomText(absurd)).toBeNull()
    expect(headroomText(base)).toContain('about 396 more requests')
  })
})

describe('the usage of absurd amounts', () => {
  const day = (spend: unknown) => ({ date: '2026-10-03', metrics: { spend, api_requests: spend, total_tokens: spend } })

  test('counts a day that spent more than money or tokens can as one that spent nothing, so no sum reaches Infinity', () => {
    const usage = parseUsage({ results: [day(1e308), { ...day(1e308), date: '2026-10-02' }, { ...day(4), date: '2026-10-01' }] }, ['2026-10-01', '2026-10-02', '2026-10-03'])

    expect(usage?.spend).toBe(4)
    expect(usage?.requests).toBe(4)
    expect(usage?.history.map(item => item.spend)).toEqual([4, 0, 0])
    expect(usage?.history.map(item => item.requests)).toEqual([4, 0, 0])
    expect(usage?.history.map(item => item.tokens)).toEqual([4, 0, 0])
    expect(usage?.tokens).toBe(4)
  })

  test('keeps what is within reach', () => {
    expect(parseUsage({ results: [day(1e15)] }, ['2026-10-03'])?.spend).toBe(1e15)
    expect(parseUsage({ results: [day(1e15 + 1e9)] }, ['2026-10-03'])?.spend).toBe(0)
  })
})

describe('a cap of $0', () => {
  test('is a toast like any other cap that is spent up: the banner and the status line say so already', async () => {
    const spent = await snapshotOf(withKey({ max_budget: 0, spend: 0.5 }))
    const fresh = await snapshotOf(withKey({ max_budget: 0, spend: 0 }))

    expect(alertsOf(spent, NOW, 80).map(alert => alert.message)).toEqual(['The key is over budget ($0.50 of $0.00)'])
    expect(alertsOf(fresh, NOW, 80).map(alert => alert.message)).toEqual(['The key is over budget ($0.00 of $0.00)'])
  })

  test('is no alert when there is no cap at all', async () => {
    expect(alertsOf(await snapshotOf(withKey({ max_budget: null, spend: 40 })), NOW, 80)).toEqual([])
  })
})
