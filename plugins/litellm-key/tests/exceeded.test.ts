import { describe, expect, test } from 'claude-code/testing'

import { exceededBudgets } from '../hooks/exceeded'
import { NOW, snapshotOf, standardRoutes, withKey } from './support'

describe('exceededBudgets', () => {
  test('is empty until a budget is actually spent up', async () => {
    expect(exceededBudgets(await snapshotOf(withKey({ spend: 49.99 })), NOW)).toEqual([])
    expect(exceededBudgets(await snapshotOf(), NOW)).toEqual([])
  })

  test('lists the key budget with its reset, then each window and model budget that is spent', async () => {
    const snapshot = await snapshotOf(
      withKey({
        spend: 50,
        budget_limits: [{ budget_duration: '1h', max_budget: 5, reset_at: new Date(NOW + 1_800_000).toISOString() }],
        budget_limits_usage: { '1h': { current_spend: 5.2 } },
        model_max_budget: { 'claude-opus-4-1': { budget_limit: 5, time_period: '1d' } },
        model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 5, budget_limit: 5, time_period: '1d' } },
      }),
    )
    const lines = exceededBudgets(snapshot, NOW)

    expect(lines[0]).toMatch(/^key prod-claude: \$50\.00 of \$50\.00 · resets in /)
    expect(lines).toContain('window 1h: $5.20 of $5.00 · resets in 30m')
    expect(lines).toContain('model claude-opus-4-1: $5.00 of $5.00')
  })

  test('a key with no cap is never over', async () => {
    expect(exceededBudgets(await snapshotOf({ ...standardRoutes(), ...withKey({ max_budget: null, spend: 900 }) }), NOW)).toEqual([])
  })
})
