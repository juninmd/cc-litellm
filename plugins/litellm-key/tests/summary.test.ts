import { describe, expect, test } from 'claude-code/testing'

import type { Failure } from '../types'
import {
  alerts,
  budgetBrief,
  budgetText,
  dayDetail,
  details,
  detailsText,
  failureText,
  facts,
  meters,
  modelList,
  modelsReport,
  modelsText,
  oneLine,
  statusText,
  summaryText,
  timeMeter,
  tokensText,
  usageCsv,
  usageFacts,
  usageReport,
} from '../hooks/summary'
import { usageOver } from '../hooks/usage'
import { KEY, NOW, reply, snapshotOf, standardRoutes, withKey } from './support'

const DAY = 86_400_000

const failure = (kind: Failure['kind'], status: number | null = null): Failure => ({
  kind,
  message: 'boom',
  hint: null,
  status,
  at: NOW,
})

describe('budgetText', () => {
  const budget = { spend: 12.5, limit: 50, softLimit: null, duration: '30d', resetAt: NOW + 6 * DAY }

  test('shows used, left and the reset', () => {
    expect(budgetText(budget, NOW)).toBe('$12.50 / $50.00 (25%) · $37.50 left · resets in 6d (30d)')
  })

  test('says over when the cap is passed', () => {
    expect(budgetText({ ...budget, spend: 55 }, NOW)).toContain('$5.00 over')
  })

  test('has no percentage without a cap', () => {
    expect(budgetText({ ...budget, limit: null, resetAt: null, duration: null }, NOW)).toBe('$12.50 spent · no budget cap')
  })

  test('says when a reset is overdue', () => {
    expect(budgetText({ ...budget, resetAt: NOW - 1000 }, NOW)).toContain('reset pending')
  })
})

describe('budgetBrief', () => {
  const budget = { spend: 12.5, limit: 50, softLimit: null, duration: '30d', resetAt: NOW + 6 * DAY }

  test('keeps the amounts and the reset, and drops the percentage, the rest and the period', () => {
    expect(budgetBrief(budget, NOW)).toBe('$12.50 / $50.00 · resets in 6d')
  })

  test('leaves out how far over the cap it is: the amounts and the bar say it', () => {
    expect(budgetBrief({ ...budget, spend: 55 }, NOW)).toBe('$55.00 / $50.00 · resets in 6d')
  })

  test('says spent without a cap, and keeps an overdue or periodic reset', () => {
    expect(budgetBrief({ ...budget, limit: null }, NOW)).toBe('$12.50 spent · resets in 6d')
    expect(budgetBrief({ ...budget, resetAt: NOW - 1000 }, NOW)).toBe('$12.50 / $50.00 · reset pending')
    expect(budgetBrief({ ...budget, resetAt: null }, NOW)).toBe('$12.50 / $50.00 · resets every 30d')
  })
})

describe('statusText', () => {
  test('stays quiet while healthy and warns past the threshold', async () => {
    const ok = await snapshotOf()
    const warn = await snapshotOf(withKey({ spend: 42 }))
    const over = await snapshotOf(withKey({ spend: 52 }))

    expect(statusText(ok, null, NOW)).toBe('25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect(statusText(warn, null, NOW)).toContain('84%')
    expect(statusText(over, null, NOW)).toContain('over budget')
  })

  test('handles a key without a cap, a blocked key and an expiring key', async () => {
    const free = await snapshotOf(withKey({ max_budget: null, budget_duration: null, budget_reset_at: null }))
    const blocked = await snapshotOf(withKey({ status: 'revoked' }))
    const soon = await snapshotOf(withKey({ expires: new Date(NOW + 2 * DAY).toISOString() }))

    expect(statusText(free, null, NOW)).toBe('$12.50 spent · no cap')
    expect(statusText(blocked, null, NOW)).toBe('key revoked')
    expect(statusText(soon, null, NOW)).toContain('expires in 2d')
  })

  test('shows a failure, marks stale data, and hides when not configured', async () => {
    const ok = await snapshotOf()

    expect(statusText(null, failure('auth', 401), NOW)).toBe('key rejected (401)')
    expect(statusText(null, failure('network'), NOW)).toBe('proxy unreachable')
    expect(statusText(ok, failure('network'), NOW)).toContain('stale: proxy unreachable')
    expect(statusText(null, failure('not-configured'), NOW)).toBeUndefined()
    expect(statusText(null, null, NOW)).toBeUndefined()
  })
})

describe('summaryText', () => {
  test('lays out budget, related budgets, facts and usage', async () => {
    const text = summaryText(await snapshotOf(), NOW, 80)

    expect(text).toContain('prod-claude · sk-...7890 · litellm.test')
    expect(text).toMatch(/Budget\s+\$12\.50 \/ \$50\.00 \(25%\)/)
    expect(text).toMatch(/Team eng-platform\s+\$412\.00 \/ \$1,000\.00 \(41%\)/)
    expect(text).toMatch(/User jane@acme\.test\s+\$26\.10 \/ \$100\.00 \(26%\)/)
    expect(text).toMatch(/Limits\s+60 rpm · 100k tpm · 5 parallel/)
    expect(text).toMatch(/Expires\s+in 40d/)
    expect(text).toMatch(/Models\s+claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5 \(3\)/)
    expect(text).toMatch(/Last 7 days\s+[▁-█]{7} · \$14\.20 · 150 requests · 2\.8M tokens/)
    expect(text).toMatch(/Updated\s+\d\d:\d\d:\d\d · via ANTHROPIC_AUTH_TOKEN/)
  })

  test('aligns every value in one column', async () => {
    const lines = summaryText(await snapshotOf(), NOW, 80).split('\n').slice(1)
    const columns = new Set(lines.map(line => line.search(/ {2}\S/)))

    expect(columns.size).toBe(1)
  })

  test('never contains the key', async () => {
    const text = summaryText(await snapshotOf(), NOW, 80)

    expect(text).not.toContain(KEY)
    expect(text).not.toContain('secret')
  })
})

describe('meters and facts', () => {
  test('lists concurrent windows and capped model budgets as meters', async () => {
    const snapshot = await snapshotOf(
      withKey({
        budget_limits: [{ budget_duration: '1h', max_budget: 1, reset_at: new Date(NOW + 1800_000).toISOString() }],
        budget_limits_usage: { '1h': { current_spend: 0.9 } },
        model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 1.5, budget_limit: 5, time_period: '1d' } },
        model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } },
      }),
    )
    const list = meters(snapshot, NOW, 80)

    expect(list.map(item => item.label)).toEqual([
      'Budget',
      'Window 1h',
      'Model claude-opus-4-1',
      'Team eng-platform',
      'User jane@acme.test',
    ])
    expect(list[1]?.tone).toBe('warn')
    expect(list[2]?.text).toBe('$1.50 / $5.00 per 1d')
  })

  test('gives every meter a brief line, shorter than its text only where there is more to cut', async () => {
    const snapshot = await snapshotOf(
      withKey({
        budget_limits: [{ budget_duration: '1h', max_budget: 1, reset_at: new Date(NOW + 1800_000).toISOString() }],
        budget_limits_usage: { '1h': { current_spend: 0.9 } },
      }),
    )
    const [budget, window, team, user] = meters(snapshot, NOW, 80)

    expect(budget?.brief).toBe('$12.50 / $50.00 · resets in 6d 12h')
    expect(window?.brief).toBe(window?.text)
    expect(team?.brief).toBe('$412.00 / $1,000.00 · resets in 11d')
    expect(user?.brief).toBe('$26.10 / $100.00 · resets in 28d')
    for (const meter of meters(snapshot, NOW, 80)) {
      expect(meter.brief.length).toBeLessThanOrEqual(meter.text.length)
    }
  })

  test('flags an expired key and an expiry that is near', async () => {
    const expired = await snapshotOf(withKey({ status: 'expired', expires: new Date(NOW - DAY).toISOString() }))
    const soon = await snapshotOf(withKey({ expires: new Date(NOW + DAY).toISOString() }))

    expect(facts(expired, NOW).find(row => row.label === 'Expired')?.tone).toBe('error')
    expect(facts(soon, NOW).find(row => row.label === 'Expires')?.tone).toBe('warn')
  })

  test('notes the lifetime spend only when a reset hid some of it', async () => {
    const hidden = await snapshotOf(withKey({ total_spend: 312.8 }))
    const same = await snapshotOf(withKey({ total_spend: 12.5 }))

    expect(facts(hidden, NOW).some(row => row.label === 'Lifetime')).toBe(true)
    expect(facts(same, NOW).some(row => row.label === 'Lifetime')).toBe(false)
  })

  test('modelsText shortens long lists and names the open case', async () => {
    const many = await snapshotOf({
      ...standardRoutes(),
      '/v1/models': reply(200, { data: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id })) }),
    })
    const open = await snapshotOf({ ...standardRoutes(), '/v1/models': reply(500, 'x') })

    expect(modelsText(many)).toBe('a, b, c, d, +2')
    expect(modelsText(open)).toBe('all proxy models')
  })

  test('oneLine and failureText', async () => {
    expect(oneLine(await snapshotOf(), NOW)).toBe('25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect(failureText({ ...failure('auth', 401), hint: 'check it' })).toBe('boom\ncheck it')
  })
})

describe('pace', () => {
  test('a meter on course to pass its cap carries the forecast, for the view to draw', async () => {
    const [budget, team] = meters(await snapshotOf(withKey({ spend: 42 })), NOW, 80)

    expect(budget?.text).toBe('$42.00 / $50.00 (84%) · $8.00 left · resets in 6d 12h (30d)')
    expect(budget?.brief).toBe('$42.00 / $50.00 · resets in 6d 12h')
    expect(budget?.forecast?.projectedPct).toBe(107)
    expect(budget?.forecast?.beforeReset).toBe(true)
    expect(team?.forecast?.beforeReset).toBe(false)
  })

  test('a meter that will last stays as it was, still with its forecast', async () => {
    const [budget, team, user] = meters(await snapshotOf(), NOW, 80)

    expect(budget?.text).toBe('$12.50 / $50.00 (25%) · $37.50 left · resets in 6d 12h (30d)')
    expect(budget?.forecast?.projectedPct).toBe(32)
    expect(team?.forecast?.projectedPct).toBe(67)
    expect(user?.forecast).toBeNull()
  })

  test('the pace can be turned off', async () => {
    const [budget] = meters(await snapshotOf(withKey({ spend: 42 })), NOW, 80, false)

    expect(budget?.forecast).toBeNull()
  })

  test('facts give the pace, and when the cap is reached once that comes before the reset', async () => {
    const healthy = facts(await snapshotOf(), NOW)
    const fast = facts(await snapshotOf(withKey({ spend: 42 })), NOW)

    expect(healthy.find(row => row.label === 'Pace')).toEqual({
      label: 'Pace',
      text: '$0.53/day · on pace for $15.96 (32%) at the reset',
      tone: 'ok',
    })
    expect(healthy.some(row => row.label === 'Runs out')).toBe(false)
    expect(fast.find(row => row.label === 'Pace')?.tone).toBe('warn')
    expect(fast.find(row => row.label === 'Runs out')).toEqual({
      label: 'Runs out',
      text: 'in 4d 11h · 2d before the reset',
      tone: 'warn',
    })
  })

  test('without a window to measure, the recent daily spend stands in', async () => {
    const rows = facts(await snapshotOf(withKey({ spend: 40, budget_duration: null, budget_reset_at: null })), NOW)

    expect(rows.find(row => row.label === 'Pace')?.text).toBe('$1.83/day lately')
    expect(rows.find(row => row.label === 'Runs out')?.text).toBe('in 5d 10h at the recent daily average')
  })

  test('says nothing about the pace of a key already over its cap, or with the pace off', async () => {
    const over = facts(await snapshotOf(withKey({ spend: 55 })), NOW)
    const off = facts(await snapshotOf(withKey({ spend: 42 })), NOW, { isForecast: false })

    expect(over.some(row => row.label === 'Runs out')).toBe(false)
    expect(off.some(row => row.label === 'Pace' || row.label === 'Runs out')).toBe(false)
  })

  test('says what was spent since Claude Code started', async () => {
    const snapshot = await snapshotOf()
    const some = facts(snapshot, NOW, { session: { since: NOW - 720_000, spend: 0.84, last: 13.34 } })
    const none = facts(snapshot, NOW, { session: { since: NOW - 30_000, spend: 0, last: 12.5 } })

    expect(some.find(row => row.label === 'Session')?.text).toBe('+$0.84 since 11:48 (12m ago)')
    expect(none.find(row => row.label === 'Session')?.text).toBe('nothing spent since 11:59 (30s ago)')
    expect(facts(snapshot, NOW).some(row => row.label === 'Session')).toBe(false)
  })

  test('the written summary has the pace and the session too', async () => {
    const text = summaryText(await snapshotOf(withKey({ spend: 42 })), NOW, 80, { session: { since: NOW - 720_000, spend: 1.2, last: 42 } })

    expect(text).toMatch(/Pace\s+\$1\.79\/day · on pace for \$53\.62 \(107%\)/)
    expect(text).toMatch(/Runs out\s+in 4d 11h/)
    expect(text).toMatch(/Session\s+\+\$1\.20 since 11:48/)
  })
})

describe('alerts', () => {
  test('are none while everything is fine', async () => {
    expect(alerts(await snapshotOf(), NOW, 80)).toEqual([])
  })

  test('say a budget is close, and that the pace will not last to the reset', async () => {
    expect(alerts(await snapshotOf(withKey({ spend: 42 })), NOW, 80)).toEqual([
      { tone: 'warn', text: 'Key budget is at 84%: $42.00 of $50.00' },
      { tone: 'warn', text: 'At this pace the key budget runs out in 4d 11h, before it resets' },
    ])
  })

  test('say a budget is over, without guessing when it runs out', async () => {
    expect(alerts(await snapshotOf(withKey({ spend: 52 })), NOW, 80)).toEqual([
      { tone: 'error', text: 'Key budget is over its cap: $52.00 of $50.00' },
    ])
  })

  test('put what is broken before what is close', async () => {
    const snapshot = await snapshotOf(withKey({ spend: 42, status: 'revoked' }))
    const list = alerts(snapshot, NOW, 80)

    expect(list[0]).toEqual({ tone: 'error', text: 'The key is revoked' })
    expect(list.map(item => item.tone)).toEqual(['error', 'warn', 'warn'])
  })

  test('warn about a key that expires soon, and name an expired one', async () => {
    const soon = alerts(await snapshotOf(withKey({ expires: new Date(NOW + 2 * DAY).toISOString() })), NOW, 80)
    const gone = alerts(await snapshotOf(withKey({ status: 'expired', expires: new Date(NOW - DAY).toISOString() })), NOW, 80)
    const late = alerts(await snapshotOf(withKey({ expires: new Date(NOW - DAY).toISOString() })), NOW, 80)

    expect(soon).toEqual([{ tone: 'warn', text: 'The key expires in 2d' }])
    expect(gone[0]).toEqual({ tone: 'error', text: 'The key is expired' })
    // The proxy still calls it active, though its date has passed.
    expect(late[0]).toEqual({ tone: 'error', text: 'The key expired 1d ago' })
  })

  test('watch the team, the user, the windows and the models too', async () => {
    const snapshot = await snapshotOf({
      ...withKey({
        budget_limits: [{ budget_duration: '1h', max_budget: 1, reset_at: new Date(NOW + 1800_000).toISOString() }],
        budget_limits_usage: { '1h': { current_spend: 0.9 } },
        model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 5.2, budget_limit: 5, time_period: '1d' } },
        model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } },
      }),
      '/team/info': reply(200, { team_id: 'eng', team_info: { team_alias: 'eng-platform', spend: 910, max_budget: 1000, budget_duration: '30d', budget_reset_at: new Date(NOW + 20 * DAY).toISOString() } }),
    })
    const texts = alerts(snapshot, NOW, 80).map(item => item.text)

    expect(texts).toContain('Model claude-opus-4-1 is over its cap: $5.20 of $5.00')
    expect(texts).toContain('Window 1h is at 90%: $0.90 of $1.00')
    expect(texts).toContain('Team eng-platform is at 91%: $910.00 of $1,000.00')
  })

  test('leave the pace out when it is turned off', async () => {
    const list = alerts(await snapshotOf(withKey({ spend: 42 })), NOW, 80, false)

    expect(list.map(item => item.text)).toEqual(['Key budget is at 84%: $42.00 of $50.00'])
  })
})

describe('statusText options', () => {
  test('draws a small meter before the percentage', async () => {
    expect(statusText(await snapshotOf(), null, NOW, { bar: true })).toBe(
      '▰▰▱▱▱▱ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)',
    )
    expect(statusText(await snapshotOf(withKey({ spend: 52 })), null, NOW, { bar: true })).toMatch(/^▰{6} 104% of budget/)
    expect(statusText(await snapshotOf(withKey({ spend: 49.9 })), null, NOW, { bar: true })).toMatch(/^▰{5}▱ 100% of budget/)
  })

  test('has no meter without a cap, and none by default', async () => {
    const free = await snapshotOf(withKey({ max_budget: null, budget_duration: null, budget_reset_at: null }))

    expect(statusText(free, null, NOW, { bar: true })).toBe('$12.50 spent · no cap')
    expect(statusText(await snapshotOf(), null, NOW)).not.toContain('▰')
  })

  test('says when the budget runs out, only while that is before the reset and it is not over already', async () => {
    const fast = await snapshotOf(withKey({ spend: 42 }))

    expect(statusText(fast, null, NOW, { forecast: true })).toBe(
      '84% of budget · $42.00 of $50.00 · resets in 6d 12h (30d) · empty in 4d 11h',
    )
    expect(statusText(fast, null, NOW)).not.toContain('empty in')
    expect(statusText(await snapshotOf(), null, NOW, { forecast: true })).not.toContain('empty in')
    expect(statusText(await snapshotOf(withKey({ spend: 52 })), null, NOW, { forecast: true })).not.toContain('empty in')
  })

  test('keeps the order of the rest: reset, empty in, expiry, stale', async () => {
    const snapshot = await snapshotOf(withKey({ spend: 42, expires: new Date(NOW + 2 * DAY).toISOString() }))
    const text = statusText(snapshot, failure('network'), NOW, { bar: true, forecast: true })

    expect(text).toBe(
      '▰▰▰▰▰▱ 84% of budget · $42.00 of $50.00 · resets in 6d 12h (30d) · empty in 4d 11h · expires in 2d · stale: proxy unreachable',
    )
  })
})

describe('modelList', () => {
  test('lists the models the key can call, the one that spent most first', async () => {
    const list = modelList(await snapshotOf(), 7, 'spend', '')

    expect(list.rows.map(row => row.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])
    expect(list.rows.map(row => Math.round((row.share ?? 0) * 100))).toEqual([75, 25, 0])
    expect(list.rows[0]).toMatchObject({ requests: 113, tokens: 2_100_000 })
    expect(list).toMatchObject({ total: 3, isOpen: true, hasUsage: true })
  })

  test('sorts by name when asked', async () => {
    expect(modelList(await snapshotOf(), 7, 'name', '').rows.map(row => row.model)).toEqual([
      'claude-haiku-4-5',
      'claude-opus-4-1',
      'claude-sonnet-4-5',
    ])
  })

  test('filters by what was typed, ignoring case and padding, and still counts them all', async () => {
    const snapshot = await snapshotOf()
    const some = modelList(snapshot, 7, 'spend', '  OPUS ')

    expect(some.rows.map(row => row.model)).toEqual(['claude-opus-4-1'])
    expect(some.total).toBe(3)
    expect(modelList(snapshot, 7, 'spend', 'zzz').rows).toEqual([])
  })

  test('counts only the days of the range', async () => {
    const snapshot = await snapshotOf()
    const day = modelList(snapshot, 1, 'spend', '')

    expect(day.rows[0]?.spend).toBeGreaterThan(6)
    expect(day.rows[0]?.spend).toBeLessThan(7)
  })

  test('shows the cap a model has on this key', async () => {
    const snapshot = await snapshotOf(
      withKey({ model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } } }),
    )
    const opus = modelList(snapshot, 7, 'spend', '').rows.find(row => row.model === 'claude-opus-4-1')

    expect(opus?.budget).toEqual({ model: 'claude-opus-4-1', spend: 0, limit: 5, period: '1d' })
  })

  test('has no shares without a history, and adds the models it saw that the proxy did not list', async () => {
    const quiet = await snapshotOf({ ...standardRoutes(), '/user/daily/activity': reply(500, 'x') })
    const hidden = await snapshotOf({ ...standardRoutes(), '/v1/models': reply(500, 'x') })

    expect(modelList(quiet, 7, 'spend', '')).toMatchObject({ hasUsage: false })
    expect(modelList(quiet, 7, 'spend', '').rows.every(row => row.share === null)).toBe(true)
    expect(modelList(hidden, 7, 'spend', '').rows.map(row => row.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1'])
  })

  test('takes the names off the key when it is restricted and the proxy did not list them', async () => {
    const snapshot = await snapshotOf({
      ...withKey({ models: ['gpt-5', 'all-proxy-models'] }),
      '/v1/models': reply(500, 'x'),
      '/user/daily/activity': reply(500, 'x'),
    })

    expect(modelList(snapshot, 7, 'name', '')).toMatchObject({ isOpen: true })
    expect(modelList(snapshot, 7, 'name', '').rows.map(row => row.model)).toEqual(['gpt-5'])
  })
})

describe('usage text', () => {
  test('usageFacts sums a range up', async () => {
    const rows = usageFacts(await snapshotOf(), 7)

    expect(rows.map(row => [row.label, row.text])).toEqual([
      ['Spend', '$14.20 · $2.03/day'],
      ['Requests', '150 · $0.095 each'],
      ['Tokens', '2.8M · in 2.2M · out 560k · cache read 1.4M (63% of input)'],
      ['Peak day', '$8.70 on Sat Oct 3'],
      ['Active days', '3 of 7'],
    ])
  })

  test('usageFacts counts failures, and compares with the days before when there is a past', async () => {
    const snapshot = await snapshotOf()
    const usage = snapshot.usage

    if (!usage) {
      throw new Error('no usage')
    }
    const days = usage.days.map((item, at) => ({
      ...item,
      spend: at >= 15 && at < 22 ? 10 : at >= 22 && at < 29 ? 20 : 0,
      requests: at === 28 ? 10 : item.requests,
      failed: at === 28 ? 2 : 0,
    }))
    const rows = usageFacts({ ...snapshot, usage: { days } }, 7)

    expect(rows.find(row => row.label === 'Failed')).toEqual({ label: 'Failed', text: '2 requests (1.3%)', tone: 'warn' })
    expect(rows.find(row => row.label === 'Trend')).toEqual({
      label: 'Trend',
      text: '▲ 100% vs the 7 days before (full days)',
      tone: 'warn',
    })
  })

  test('usageFacts has nothing without a history', async () => {
    expect(usageFacts({ ...(await snapshotOf()), usage: null }, 7)).toEqual([])
  })

  test('tokensText gives the split, and the cache share only when it makes sense', async () => {
    const totals = usageOver((await snapshotOf()).usage ?? { days: [] }, 7)

    expect(tokensText(totals)).toBe('in 2.2M · out 560k · cache read 1.4M (63% of input)')
    expect(tokensText({ ...totals, cacheReadTokens: totals.inputTokens + 1 })).not.toContain('% of input')
    expect(tokensText({ ...totals, inputTokens: 0, cacheReadTokens: 0 })).toBe('in 0 · out 560k · cache read 0')
  })

  test('usageReport is a table of the days, the totals and the models', async () => {
    const lines = usageReport(await snapshotOf(), 7).split('\n')

    expect(lines[0]).toBe('Usage · last 7 days · litellm.test')
    expect(lines[1]).toMatch(/^Date\s+Day\s+Spend\s+Requests\s+Tokens$/)
    expect(lines).toContain('Oct 3   Sat       $8.70        90     1.7M')
    expect(lines).toContain('Total            $14.20       150     2.8M')
    expect(lines.some(line => /^claude-sonnet-4-5\s+\$10\.65\s+75%\s+113 requests$/.test(line))).toBe(true)
    expect(lines.filter(line => /^Oct 3|^Total/.test(line)).every(line => line.length === 'Total            $14.20       150     2.8M'.length)).toBe(true)
  })

  test('usageReport says why there is no table', async () => {
    expect(usageReport({ ...(await snapshotOf()), usage: null }, 7)).toContain('No usage history')
  })

  test('usageCsv is one row per day of the range, ready for a spreadsheet', async () => {
    expect(usageCsv(await snapshotOf(), 3).split('\n')).toEqual([
      'date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens',
      '2026-10-01,4.000000,40,0,800000,640000,160000,400000',
      '2026-10-02,0.000000,0,0,0,0,0,0',
      '2026-10-03,8.700000,90,0,1700000,1360000,340000,850000',
    ])
    expect(usageCsv({ ...(await snapshotOf()), usage: null }, 3)).toBe(
      'date,spend,requests,failed_requests,total_tokens,input_tokens,output_tokens,cache_read_tokens',
    )
  })

  test('modelsReport lists the models with what each spent', async () => {
    const lines = modelsReport(await snapshotOf(), 7).split('\n')

    expect(lines[0]).toBe('Models (3) · spend over the last 7 days')
    expect(lines[1]).toMatch(/^claude-sonnet-4-5\s+\$10\.65\s+113 requests$/)
    expect(lines[3]).toMatch(/^claude-haiku-4-5\s+—$/)
  })

  test('modelsReport names the caps, and falls back to the plain list when there is nothing to table', async () => {
    const capped = await snapshotOf(withKey({ model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } } }))
    const bare = await snapshotOf({
      ...standardRoutes(),
      '/v1/models': reply(500, 'x'),
      '/user/daily/activity': reply(500, 'x'),
    })

    expect(modelsReport(capped, 7)).toContain('cap $5.00 per 1d')
    expect(modelsReport(bare, 7)).toBe('Models: all proxy models')
  })
})

describe('details', () => {
  test('groups what the proxy said about the key and how it was read', async () => {
    const groups = details(await snapshotOf(), NOW, 60)
    const rows = (title: string) => Object.fromEntries((groups.find(item => item.title === title)?.rows ?? []).map(row => [row.label, row.text]))

    expect(groups.map(item => item.title)).toEqual(['Key', 'Budget', 'Limits', 'Connection'])
    expect(rows('Key')).toMatchObject({
      Alias: 'prod-claude',
      Name: 'sk-...7890',
      Hash: '01234567…cdef (sha256)',
      User: 'jane',
      Team: 'eng',
      Expires: 'Nov 13 · in 40d',
    })
    expect(rows('Budget')).toMatchObject({ Spent: '$12.50', Cap: '$50.00', Period: '30d', Resets: 'Oct 10 · in 6d 12h' })
    expect(rows('Limits')).toEqual({ 'Requests/min': '60', 'Tokens/min': '100k', Parallel: '5' })
    expect(rows('Connection')).toMatchObject({
      Proxy: 'https://litellm.test',
      Auth: 'via ANTHROPIC_AUTH_TOKEN (sk-…7890)',
      Read: '12:00:00 (just now) · every 60s',
      Models: '3 models',
      Related: 'user budget · team budget',
    })
  })

  test('leaves out what the proxy did not say, and marks a key that is about to expire', async () => {
    const snapshot = await snapshotOf(
      withKey({ rpm_limit: null, tpm_limit: null, max_parallel_requests: null, expires: null, models: [] }),
    )
    const groups = details(snapshot, NOW, 60)

    expect(groups.some(item => item.title === 'Limits')).toBe(false)
    expect(groups[0]?.rows.find(row => row.label === 'Expires')?.text).toBe('never')
    const soon = details(await snapshotOf(withKey({ expires: new Date(NOW + DAY).toISOString() })), NOW, 60)

    expect(soon[0]?.rows.find(row => row.label === 'Expires')?.tone).toBe('warn')
  })

  test('detailsText lines it up in one column, notes included, and never shows the key', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/team/info': reply(403, { detail: 'nope' }) })
    const text = detailsText(snapshot, NOW, 60)

    expect(text.split('\n')[0]).toBe('prod-claude · sk-...7890 · litellm.test')
    expect(text).toMatch(/\n {2}Alias {9}prod-claude/)
    expect(text).toContain('Notes\n  team budget unavailable: /team/info answered 403')
    expect(text).not.toContain(KEY)
  })
})

describe('timeMeter', () => {
  test('says how far into its period the budget is, to be read beside the budget', async () => {
    const meter = timeMeter(await snapshotOf(), NOW)

    expect(meter).toMatchObject({ label: 'Time', tone: 'ok', forecast: null, text: 'day 24 of 30 (78%) · 6d 12h left' })
    expect(meter?.used).toBe(23.5 * DAY)
    expect(meter?.limit).toBe(30 * DAY)
    expect(meter?.brief).toBe(meter?.text)
  })

  test('counts a short period in the units it is made of', async () => {
    const hour = await snapshotOf(withKey({ budget_duration: '1h', budget_reset_at: new Date(NOW + 1800_000).toISOString() }))

    expect(timeMeter(hour, NOW)?.text).toBe('30m of 1h (50%) · 30m left')
  })

  test('has no time to show without a cap, a period or a reset still to come', async () => {
    const free = await snapshotOf(withKey({ max_budget: null }))
    const open = await snapshotOf(withKey({ budget_duration: null }))
    const late = await snapshotOf(withKey({ budget_reset_at: new Date(NOW - 1000).toISOString() }))
    const never = await snapshotOf(withKey({ budget_reset_at: null }))

    for (const snapshot of [free, open, late, never]) {
      expect(timeMeter(snapshot, NOW)).toBeNull()
    }
  })

  test('starts at the first day when the reset is further off than the period is long', async () => {
    const far = await snapshotOf(withKey({ budget_reset_at: new Date(NOW + 40 * DAY).toISOString() }))

    expect(timeMeter(far, NOW)?.text).toBe('day 1 of 30 (0%) · 40d left')
  })
})

describe('dayDetail', () => {
  test('says what a day came to, and which models did it', async () => {
    const detail = dayDetail(await snapshotOf(), '2026-10-03')

    expect(detail?.title).toBe('Sat Oct 3 (today)')
    expect(detail?.summary).toBe('$8.70 · 90 requests · 1.7M tokens')
    expect(detail?.models.map(item => item.model)).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1'])
    expect(detail?.models.map(item => Math.round(item.share * 100))).toEqual([75, 25])
  })

  test('marks only the last day of the history as today', async () => {
    expect(dayDetail(await snapshotOf(), '2026-10-01')?.title).toBe('Thu Oct 1')
  })

  test('says a quiet day had no activity, with no models', async () => {
    expect(dayDetail(await snapshotOf(), '2026-10-02')).toEqual({ title: 'Fri Oct 2', summary: 'no activity', models: [] })
  })

  test('has nothing for a day outside the history, or without a history', async () => {
    expect(dayDetail(await snapshotOf(), '2026-01-01')).toBeNull()
    expect(dayDetail({ ...(await snapshotOf()), usage: null }, '2026-10-03')).toBeNull()
  })
})
