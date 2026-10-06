import { describe, expect, test } from 'claude-code/testing'
import { date } from '../hooks/json'
import { parseKey, parseModels, parseTeam, parseUsage, parseUser, parseUserRole } from '../hooks/parsers'
import { standardUsage } from './factories'
import { HASH, NOW, keyBody } from './support'

describe('date', () => {
  test('reads a naive timestamp as UTC, as LiteLLM writes them', () => {
    expect(date('2026-10-10T00:00:00')).toBe(Date.parse('2026-10-10T00:00:00Z'))
    expect(date('2026-10-10 00:00:00')).toBe(Date.parse('2026-10-10T00:00:00Z'))
    expect(date('2026-10-10T00:00:00+02:00')).toBe(Date.parse('2026-10-09T22:00:00Z'))
    expect(date('nope')).toBeNull()
    expect(date(null)).toBeNull()
  })
})

describe('parseKey', () => {
  test('reads the budget, limits and identity', () => {
    const { info } = keyBody()
    const key = parseKey(keyBody(), info, NOW)

    expect(key.alias).toBe('prod-claude')
    expect(key.keyName).toBe('sk-...7890')
    expect(key.keyHash).toBe(HASH)
    expect(key.status).toBe('active')
    expect(key.budget).toEqual({
      spend: 12.5,
      limit: 50,
      softLimit: null,
      duration: '30d',
      resetAt: Date.parse('2026-10-10T00:00:00Z'),
    })
    expect(key.limits).toEqual({ rpm: 60, tpm: 100000, tpd: null, parallel: 5 })
    expect(key.userId).toBe('jane')
    expect(key.teamId).toBe('eng')
    expect(key.expiresAt).toBe(Date.parse('2026-11-13T00:00:00Z'))
  })

  test('falls back to the linked budget table', () => {
    const info = {
      spend: 3,
      litellm_budget_table: {
        max_budget: 10,
        soft_budget: 8,
        budget_duration: '7d',
        rpm_limit: 30,
        model_max_budget: { 'gpt-4': { budget_limit: 2, time_period: '1d' } },
      },
    }
    const key = parseKey({}, info, NOW)

    expect(key.budget.limit).toBe(10)
    expect(key.budget.softLimit).toBe(8)
    expect(key.budget.duration).toBe('7d')
    expect(key.limits.rpm).toBe(30)
    expect(key.modelBudgets).toEqual([{ model: 'gpt-4', spend: 0, limit: 2, period: '1d' }])
  })

  test('derives the status when the proxy does not send one', () => {
    expect(parseKey({}, { blocked: true }, NOW).status).toBe('revoked')
    expect(parseKey({}, { expires: '2026-10-01T00:00:00Z' }, NOW).status).toBe('expired')
    expect(parseKey({}, { expires: '2026-12-01T00:00:00Z' }, NOW).status).toBe('active')
    expect(parseKey({}, {}, NOW).status).toBe('active')
  })

  test('reads concurrent budget windows and per-model usage', () => {
    const key = parseKey(
      {},
      {
        budget_limits: [
          { budget_duration: '1h', max_budget: 1, reset_at: '2026-10-03T13:00:00Z' },
          { budget_duration: '1d', max_budget: 5 },
        ],
        budget_limits_usage: { '1h': { current_spend: 0.25 } },
        model_max_budget: { 'claude-opus-4-1': 5, 'claude-sonnet-4-5': { budget_limit: 20, time_period: '30d' } },
        model_max_budget_usage: { 'claude-opus-4-1': { current_spend: 1.5, budget_limit: 5, time_period: '1d' } },
        model_spend: { 'claude-sonnet-4-5': 7 },
      },
      NOW,
    )

    expect(key.windows).toEqual([
      { duration: '1h', limit: 1, spend: 0.25, resetAt: Date.parse('2026-10-03T13:00:00Z') },
      { duration: '1d', limit: 5, spend: null, resetAt: null },
    ])
    expect(key.modelBudgets).toEqual([
      { model: 'claude-opus-4-1', spend: 1.5, limit: 5, period: '1d' },
      { model: 'claude-sonnet-4-5', spend: 7, limit: 20, period: '30d' },
    ])
  })

  test('survives odd shapes', () => {
    const key = parseKey(
      { key: 'sk-not-a-hash' },
      { spend: 'x', max_budget: '12.5', models: 'oops', budget_limits: 'oops', model_max_budget: [] },
      NOW,
    )

    expect(key.keyHash).toBeNull()
    expect(key.budget.spend).toBe(0)
    expect(key.budget.limit).toBe(12.5)
    expect(key.models).toEqual([])
    expect(key.windows).toEqual([])
    expect(key.modelBudgets).toEqual([])
  })
})

describe('related budgets, models and usage', () => {
  test('user and team are only worth showing with a cap', () => {
    const user = parseUser({ user_id: 'jane', user_info: { user_email: 'j@x.test', spend: 1, max_budget: 5 } })
    const team = parseTeam({ team_id: 'eng', team_info: { team_alias: 'Eng', spend: 9, max_budget: 10 } })

    expect(user?.label).toBe('j@x.test')
    expect(user?.budget.limit).toBe(5)
    expect(team?.label).toBe('Eng')
    expect(parseUser({ user_id: 'u', user_info: { spend: 1 } })).toBeNull()
    expect(parseTeam({ team_id: 't', team_info: { spend: 1 } })).toBeNull()
    expect(parseUser('nope')).toBeNull()
  })

  test('the role is read even when the user has no budget cap', () => {
    const uncapped = { user_id: 'root', user_info: { user_role: 'proxy_admin', spend: 3 } }

    expect(parseUser(uncapped)).toBeNull()
    expect(parseUserRole(uncapped)).toBe('proxy_admin')
    expect(parseUserRole({ user_id: 'x', user_info: {} })).toBeNull()
    expect(parseUserRole(null)).toBeNull()
  })

  test('models are unique and sorted', () => {
    expect(parseModels({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { nope: 1 }] })).toEqual(['a', 'b'])
    expect(parseModels({})).toBeNull()
  })

  test('usage fills the quiet days with zero and ranks models', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03']
    const usage = parseUsage(standardUsage(), days)

    expect(usage?.days).toEqual([
      { date: '2026-10-01', spend: 4 },
      { date: '2026-10-02', spend: 0 },
      { date: '2026-10-03', spend: 8.7 },
    ])
    expect(usage?.requests).toBe(130)
    expect(usage?.tokens).toBe(2500000)
    expect(usage?.topModels[0]?.model).toBe('claude-sonnet-4-5')
    expect(parseUsage({}, days)).toBeNull()
  })

  test('usage keeps the five biggest models of the week, biggest first, and drops those that spent nothing', () => {
    const spends: Record<string, number> = { a: 1, b: 7, c: 3, d: 6, e: 2, f: 5, g: 4, idle: 0 }
    const body = {
      results: [
        {
          date: '2026-10-03',
          metrics: { spend: 28 },
          breakdown: { models: Object.fromEntries(Object.entries(spends).map(([name, spend]) => [name, { metrics: { spend } }])) },
        },
      ],
    }

    expect(parseUsage(body, ['2026-10-03'])?.topModels.map(item => item.model)).toEqual(['b', 'd', 'f', 'g', 'c'])
  })
})
