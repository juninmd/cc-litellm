import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { details, detailsText } from '../hooks/details'
import { modelList, modelsReport } from '../hooks/report-models'
import { compareReport, dayReport } from '../hooks/report-days'
import { dayDetail, tokensText, usageCsv, usageFacts, usageReport } from '../hooks/report-usage'
import { totalsOf } from '../hooks/history'
import { activity } from './activity-fixtures'
import { near } from './near'
import { NOW, reply, snapshotOf, standardRoutes, withKey } from './support'

const withUsage = (spends: readonly number[], shares?: Parameters<typeof activity>[1]) =>
  snapshotOf({ ...standardRoutes(), '/user/daily/activity': activity(spends, shares) })

describe('dayReport', () => {
  test('says what a day did: its totals, its tokens, and how it compares with the usual day', async () => {
    const lines = dayReport(await snapshotOf(), '2026-10-03').split('\n')

    expect(lines[0]).toBe('Sat Oct 3 (today) · UTC · litellm.test')
    expect(lines[1]).toBe('$8.70 · 90 requests · 1.7M tokens')
    expect(lines[2]).toBe('Tokens     in 1.4M · out 340k · cache read 850k (63% of input)')
    expect(lines[3]).toBe('Usual day  $1.83 · this one was 4.7× that')
  })

  test('ranks the models of the day, with their share', async () => {
    // $8.70 is 87 requests in this fixture, split 75/25 between the models
    expect(dayReport(await withUsage([0, 0, 8.7]), '2026-10-03')).toMatch(
      /\nBy model\nclaude-sonnet-4-5 +\$6\.5\d +75% +65 requests\nclaude-opus-4-1 +\$2\.1\d +25% +22 requests$/,
    )
  })

  test('counts the requests that failed', async () => {
    const snapshot = await snapshotOf()
    const history = (snapshot.usage?.history ?? []).map(item => (item.date === '2026-10-03' ? { ...item, failed: 9 } : item))
    const failing: Snapshot = { ...snapshot, usage: snapshot.usage && { ...snapshot.usage, history } }

    expect(dayReport(failing, '2026-10-03')).toContain('Failed     9 requests (10.0%)')
  })

  test('leaves out the usual day when it is a cent or less', async () => {
    expect(dayReport(await withUsage([0.004, 0.004, 0.004, 5]), '2026-10-03')).not.toContain('Usual day')
  })

  test('is short for a day that did nothing', async () => {
    expect(dayReport(await snapshotOf(), '2026-10-02')).toBe('Fri Oct 2 · UTC · litellm.test\nno activity')
  })

  test('says why there is nothing to say about a day the history does not hold, or without a history', async () => {
    expect(dayReport(await snapshotOf(), '2026-01-01')).toBe('2026-01-01 is not in the history, which holds the last 30 days.')
    expect(dayReport({ ...(await snapshotOf()), usage: null }, '2026-10-03')).toContain('No usage history')
  })
})

describe('compareReport', () => {
  // 15 quiet days, 7 of $10, 7 of $15 and today: the models split the days as the test needs.
  const spends = [...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 15), 99]
  const shares = (at: number): Record<string, number> =>
    at === 29
      ? { 'claude-sonnet-4-5': 1 }
      : at >= 22
        ? { 'claude-sonnet-4-5': 8 / 15, 'claude-opus-4-1': 7 / 15 }
        : { 'claude-sonnet-4-5': 0.8, 'claude-opus-4-1': 0.2 }

  test('sets the stretches side by side, whole', async () => {
    const lines = compareReport(await withUsage(spends, shares), 7).split('\n')

    expect(lines[0]).toBe('Compare · last 7 full days vs the 7 before · UTC, today left out · litellm.test')
    expect(lines[1]).toBe('Sep 19 to Oct 2')
    expect(lines[2]).toMatch(/^ +Now +Before +Change$/)
    expect(lines[3]).toMatch(/^Spend +\$105\.00 +\$70\.00 +▲ 50%$/)
    expect(lines[4]).toMatch(/^Requests +1,050 +700 +▲ 50%$/)
    expect(lines[5]).toMatch(/^Tokens +105k +70k +▲ 50%$/)
    expect(lines[6]).toMatch(/^Per request +\$0\.100 +\$0\.100 +unchanged$/)
    expect(lines[7]).toMatch(/^Active days +7 +7 *$/)
  })

  test('says which model moved, the biggest move first', async () => {
    expect(compareReport(await withUsage(spends, shares), 7)).toMatch(
      /\nBy model +Now +Before +Change\nclaude-opus-4-1 +\$49\.00 +\$14\.00 +▲ 250%\nclaude-sonnet-4-5 +\$56\.00 +\$56\.00 +unchanged$/,
    )
  })

  test('names a model that appeared and one that went away', async () => {
    const text = compareReport(
      await withUsage(spends, (at): Record<string, number> => (at >= 22 ? { 'claude-opus-4-1': 1 } : { 'claude-sonnet-4-5': 1 })),
      7,
    )

    expect(text).toMatch(/claude-opus-4-1 +\$105\.00 +\$0\.00 +new/)
    expect(text).toMatch(/claude-sonnet-4-5 +\$0\.00 +\$70\.00 +gone/)
  })

  test('says why it cannot compare when the history is too short, and that the plugin reads 30 days', async () => {
    const short = await withUsage([5, 5, 5])

    expect(compareReport(short, 14)).toContain('Not enough history to compare 14 days with the 14 before them')
    expect(compareReport(short, 14)).toContain('takes 28 full days')
    expect(compareReport({ ...short, usage: null }, 7)).toContain('No usage history')
  })
})

describe('usageReport', () => {
  test('has a line for each day, the totals under them, and the models', async () => {
    const lines = usageReport(await snapshotOf(), 7).split('\n')

    expect(lines[0]).toBe('Usage · last 7 days · litellm.test')
    expect(lines[1]).toMatch(/^Date +Day +Spend +Requests +Tokens$/)
    expect(lines[2]).toMatch(/^Sep 27 +Sun +\$0\.00 +0 +0$/)
    expect(lines[8]).toMatch(/^Oct 3 +Sat +\$8\.70 +90 +1\.7M$/)
    expect(lines[9]).toMatch(/^Total +\$14\.20 +150 +2\.8M$/)
    expect(lines.join('\n')).toMatch(/\nBy model\nclaude-sonnet-4-5 +\$10\.\d\d +75% +/)
  })

  test('reaches as far back as the range says, over the 30 days the plugin reads', async () => {
    const lines = usageReport(await snapshotOf(), 30).split('\n')

    expect(lines.filter(line => /^[A-Z][a-z]{2} \d+ +[A-Z][a-z]{2} /.test(line))).toHaveLength(30)
  })

  test('says what is missing without a history', async () => {
    expect(usageReport({ ...(await snapshotOf()), usage: null }, 7)).toContain('No usage history')
  })

  test('puts the facts of the range under the days, and leaves out what it has no word for', async () => {
    const rows = usageFacts(await snapshotOf(), 7)

    expect(rows.find(row => row.label === 'Spend')?.text).toBe('$14.20 · $2.03/day')
    expect(rows.find(row => row.label === 'Requests')?.text).toBe('150 · $0.095 each')
    expect(rows.find(row => row.label === 'Peak day')?.text).toBe('$8.70 on Sat Oct 3')
    expect(rows.find(row => row.label === 'Active days')?.text).toBe('3 of 7')
    expect(rows.some(row => row.label === 'Failed')).toBe(false)
    expect(usageFacts({ ...(await snapshotOf()), usage: null }, 7)).toEqual([])
  })

  test('says how the tokens split, with the share of the input that came from the cache', async () => {
    const snapshot = await snapshotOf()
    const totals = totalsOf(snapshot.usage?.history ?? [])

    expect(tokensText(totals)).toBe('in 2.2M · out 560k · cache read 1.4M (63% of input)')
    expect(tokensText({ ...totals, inputTokens: 0, cacheReadTokens: 5 })).toBe('in 0 · out 560k · cache read 5')
  })

  test('has a title and a summary for each day, and none for a day it does not hold', async () => {
    const snapshot = await snapshotOf()

    expect(dayDetail(snapshot, '2026-10-03')).toMatchObject({ title: 'Sat Oct 3 (today)', summary: '$8.70 · 90 requests · 1.7M tokens' })
    expect(dayDetail(snapshot, '2026-10-02')).toMatchObject({ title: 'Fri Oct 2', summary: 'no activity', models: [] })
    expect(dayDetail(snapshot, '2025-01-01')).toBeNull()
  })
})

describe('usageCsv', () => {
  test('is the days of the range, one line each, under a header, for a spreadsheet', async () => {
    const lines = usageCsv(await snapshotOf(), 7).split('\n')

    expect(lines[0]).toBe('date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens')
    expect(lines).toHaveLength(8)
    expect(lines[7]).toBe('2026-10-03,8.700000,90,0,1700000,1360000,340000,850000')
    expect(lines[1]).toBe('2026-09-27,0.000000,0,0,0,0,0,0')
  })

  test('is only the header without a history', async () => {
    expect(usageCsv({ ...(await snapshotOf()), usage: null }, 7).split('\n')).toHaveLength(1)
  })
})

describe('models', () => {
  test('lists what the key can call and what each spent over the range', async () => {
    const snapshot = await snapshotOf(withKey({ model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } } }))
    const lines = modelsReport(snapshot, 7).split('\n')

    expect(lines[0]).toBe('Models (3) · spend over the last 7 days')
    expect(lines[1]).toMatch(/^claude-sonnet-4-5 +\$10\.\d\d +\d+ requests$/)
    expect(lines[2]).toMatch(/^claude-opus-4-1 +\$\d\.\d\d +\d+ requests · cap \$5\.00 per 1d$/)
    expect(lines[3]).toMatch(/^claude-haiku-4-5 +—$/)
  })

  test('orders by spend or by name, filters by what the name holds, and says when the key may call every model', async () => {
    const snapshot = await snapshotOf()

    expect(modelList(snapshot, 7, 'spend', '').rows.map(row => row.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
    expect(modelList(snapshot, 7, 'name', '').rows.map(row => row.model)).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
    expect(modelList(snapshot, 7, 'name', ' OPUS ').rows.map(row => row.model)).toEqual(['claude-opus-4-1'])
    expect(modelList(snapshot, 7, 'name', 'opus')).toMatchObject({ total: 3, isOpen: true, hasUsage: true })
    near(modelList(snapshot, 7, 'spend', '').rows[0]?.share, 0.75)
  })

  test('has no share while nothing was spent, and counts a model that was used but is no longer listed', async () => {
    const quiet = await withUsage([0, 0, 0])
    const gone = await snapshotOf({ ...standardRoutes(), '/v1/models': reply(200, { data: [{ id: 'claude-haiku-4-5' }] }) })

    expect(modelList(quiet, 7, 'spend', '').rows.every(row => row.share === null)).toBe(true)
    expect(modelList(gone, 7, 'spend', '').rows.map(row => row.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
  })

  test('says so when the key lists no model at all', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/v1/models': reply(500, 'x') })

    expect(modelsReport({ ...snapshot, models: null, usage: null }, 7)).toBe('Models: all proxy models')
  })
})

describe('details', () => {
  test('lists what the proxy said of the key, in groups, and how it was read', async () => {
    const snapshot = await snapshotOf()
    const groups = details(snapshot, NOW, 60)

    expect(groups.map(group => group.title)).toEqual(['Key', 'Budget', 'Limits', 'Connection'])
    expect(groups[0]?.rows.find(row => row.label === 'Alias')?.text).toBe('prod-claude')
    expect(groups[0]?.rows.find(row => row.label === 'Role')?.text).toBe('internal_user')
    expect(groups[3]?.rows.find(row => row.label === 'Proxy')?.text).toBe('https://litellm.test')
    expect(groups[3]?.rows.find(row => row.label === 'Read')?.text).toMatch(/^\d\d:\d\d:\d\d \(just now\) · every 60s$/)
  })

  test('shows the hash cut short, and nothing of the key itself', async () => {
    const text = detailsText(await snapshotOf(), NOW, 60)

    expect(text).toMatch(/Hash +01234567… \(sha256\)/)
    expect(text).not.toContain('sk-test-secret')
    // eight characters are what `/litellm keys` shows of a key that has no alias; the rest of the hash stays out
    expect(text).not.toContain('0123456789abcdef')
  })

  test('says the version and database of the proxy when it said them, warning of a database that is down', async () => {
    const up = await snapshotOf({ ...standardRoutes(), '/health/readiness': reply(200, { litellm_version: '1.77.0', db: 'connected' }) })
    const down = await snapshotOf({ ...standardRoutes(), '/health/readiness': reply(200, { litellm_version: '1.77.0', db: 'Not connected' }) })
    const row = (snapshot: Snapshot) => details(snapshot, NOW, 60)[3]?.rows.find(item => item.label === 'LiteLLM')

    expect(row(up)).toMatchObject({ text: 'v1.77.0 · database connected', tone: 'ok' })
    expect(row(down)).toMatchObject({ text: 'v1.77.0 · database not connected', tone: 'warn' })
  })

  test('lists the notes of the reading last', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/team/info': reply(403, { detail: 'nope' }) })

    expect(detailsText(snapshot, NOW, 60).split('\n').slice(-2)).toEqual(['Notes', '  team budget unavailable: /team/info answered 403'])
  })
})
