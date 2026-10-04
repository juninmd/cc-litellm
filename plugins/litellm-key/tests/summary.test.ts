import { describe, expect, test } from 'claude-code/testing'

import type { Failure } from '../types'
import {
  budgetBrief,
  budgetText,
  failureText,
  facts,
  meters,
  modelsText,
  oneLine,
  statusText,
  summaryText,
} from '../hooks/summary'
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

    expect(statusText(ok, null, NOW)).toBe('██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect(statusText(warn, null, NOW)).toContain('██████▊░ 84% of budget')
    expect(statusText(over, null, NOW)).toContain('████████ 104% of budget')
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
    expect(text).toMatch(/Last 7 days\s+[·▁-█]{7} · \$14\.20 · 150 requests · 2\.8M tokens/)
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

  test('error means spent up: 99.6% rounds to 100% on screen, but the proxy still answers, so it is a warning', async () => {
    const [almost] = meters(await snapshotOf(withKey({ spend: 49.8 })), NOW, 80)
    const [spent] = meters(await snapshotOf(withKey({ spend: 50 })), NOW, 80)

    expect(almost?.tone).toBe('warn')
    expect(almost?.text).toContain('(100%)')
    expect(spent?.tone).toBe('error')
  })

  test('a cap of $0 is used up everywhere the banner says so: tone, share and status, and never "(null%)"', async () => {
    const snapshot = await snapshotOf(withKey({ max_budget: 0, spend: 0 }))
    const [budget] = meters(snapshot, NOW, 80)

    expect(budget?.tone).toBe('error')
    expect(budget?.text).not.toContain('null')
    expect(statusText(snapshot, null, NOW)).toContain('████████ 100% of budget · $0.00 of $0.00 · over budget')
  })

  test('flags an expired key and an expiry that is near', async () => {
    const expired = await snapshotOf(withKey({ status: 'expired', expires: new Date(NOW - DAY).toISOString() }))
    const soon = await snapshotOf(withKey({ expires: new Date(NOW + DAY).toISOString() }))

    expect(facts(expired, NOW).find(row => row.label === 'Expired')?.tone).toBe('error')
    expect(facts(soon, NOW).find(row => row.label === 'Expires')?.tone).toBe('warn')
  })

  test('shows the user role, and nothing when the proxy gave none', async () => {
    const known = await snapshotOf(withKey({}))
    const unknown = { ...known, userRole: null }

    expect(facts(known, NOW).find(row => row.label === 'Role')?.text).toBe('internal_user')
    expect(facts(unknown, NOW).some(row => row.label === 'Role')).toBe(false)
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
    expect(oneLine(await snapshotOf(), NOW)).toBe('██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)')
    expect(failureText({ ...failure('auth', 401), hint: 'check it' })).toBe('boom\ncheck it')
  })
})
