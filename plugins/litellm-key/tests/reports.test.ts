import { describe, expect, test } from 'claude-code/testing'

import type { Failure } from '../types'
import type { Probe } from '../hooks/litellm'
import { checkVerdict, compareReport, dayReport, jsonReport, levelOf, paceReport, pingReport } from '../hooks/reports'
import { HASH, KEY, NOW, activity, near, reply, snapshotOf, standardRoutes, withKey } from './support'

const DAY = 86_400_000

const failure = (kind: Failure['kind'] = 'network', hint: string | null = null): Failure => ({
  kind,
  message: 'The proxy is down',
  hint,
  status: null,
  at: NOW,
})

describe('paceReport', () => {
  test('names the key and lays out where its budget is heading', async () => {
    const lines = paceReport(await snapshotOf(), NOW).split('\n')

    expect(lines[0]).toBe('Pace · prod-claude · litellm.test')
    expect(lines[1]).toBe('Budget     $12.50 / $50.00 (25%) · $37.50 left · resets in 6d 12h (30d)')
    expect(lines[2]).toBe('Time       day 24 of 30 (78%) · 6d 12h left')
    expect(lines[3]).toBe('Pace       $0.53/day · on pace for $15.96 (32%) at the reset')
    expect(lines[4]).toBe('Allowance  $5.77/day to last · now $0.53/day')
    expect(lines[5]).toBe('Headroom   about 396 more requests at $0.095 each (7-day average)')
    expect(lines[6]).toBe('Today      $8.70 · 90 requests · 4.7× the usual day ($1.83)')
  })

  test('says when the budget runs out, once that comes before the reset', async () => {
    const text = paceReport(await snapshotOf(withKey({ spend: 42 })), NOW)

    expect(text).toContain('Runs out   in 4d 11h · 2d before the reset')
    expect(text).toContain('Allowance  $1.23/day to last · now $1.79/day (cut 31%)')
  })

  test('does the same for the team and the user, each under its name', async () => {
    const text = paceReport(await snapshotOf(), NOW)

    expect(text).toContain('\nTeam eng-platform\n  Budget     $412.00 / $1,000.00 (41%)')
    expect(text).toMatch(/\n {2}Pace {7}\$22\.27\/day · on pace for \$668\.\d\d \(67%\) at the reset/)
    expect(text).toMatch(/\n {2}Allowance {2}\$51\.13\/day to last · now \$22\.27\/day/)
    expect(text).toContain('\nUser jane@acme.test\n  Budget     $26.10 / $100.00 (26%)')
  })

  test('says what is missing when the budget has no pace yet', async () => {
    const early = await snapshotOf({ ...withKey({ spend: 3, budget_reset_at: new Date(NOW + 29.9 * DAY).toISOString() }), '/user/daily/activity': reply(404, 'x') })

    expect(paceReport(early, NOW)).toContain('Pace       not enough history yet')
  })

  test('has no pace to wait for on a budget with no cap, and one that is spent', async () => {
    expect(paceReport(await snapshotOf(withKey({ max_budget: null })), NOW)).not.toContain('not enough history')
    expect(paceReport(await snapshotOf(withKey({ spend: 52 })), NOW)).not.toContain('not enough history')
  })

  test('adds the session, with its rate once it has one', async () => {
    const text = paceReport(await snapshotOf(), NOW, { session: { since: NOW - 3_600_000, spend: 2, last: 12.5 } })

    expect(text).toContain('Session    +$2.00 since 11:00 (1h ago) · $2.00/h')
  })

  test('never holds the key', async () => {
    expect(paceReport(await snapshotOf(), NOW)).not.toContain(KEY)
  })
})

describe('dayReport', () => {
  test('says what a day did: its totals, its tokens, and how it compares with the usual day', async () => {
    const lines = dayReport(await snapshotOf(), '2026-10-03').split('\n')

    expect(lines[0]).toBe('Sat Oct 3 (today) · UTC · litellm.test')
    expect(lines[1]).toBe('$8.70 · 90 requests · 1.7M tokens')
    expect(lines[2]).toBe('Tokens     in 1.4M · out 340k · cache read 850k (63% of input)')
    expect(lines[3]).toBe('Usual day  $1.83 · this one was 4.7× that')
  })

  test('ranks the models of the day, with their share', async () => {
    const text = dayReport(await snapshotOf(), '2026-10-03')

    expect(text).toMatch(/\nBy model\nclaude-sonnet-4-5 +\$6\.5\d +75% +68 requests\nclaude-opus-4-1 +\$2\.1\d +25% +23 requests$/)
  })

  test('counts the requests that failed', async () => {
    const snapshot = await snapshotOf()
    const usage = snapshot.usage
    const days = (usage?.days ?? []).map(item => (item.date === '2026-10-03' ? { ...item, failed: 9 } : item))

    expect(dayReport({ ...snapshot, usage: { days } }, '2026-10-03')).toContain('Failed     9 requests (10.0%)')
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
  const moved = () => snapshotOf({ ...standardRoutes(), '/user/daily/activity': activity(spends, shares) })

  test('sets the stretches side by side, whole', async () => {
    const lines = compareReport(await moved(), 7).split('\n')

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
    const text = compareReport(await moved(), 7)

    expect(text).toMatch(/\nBy model +Now +Before +Change\nclaude-opus-4-1 +\$49\.00 +\$14\.00 +▲ 250%\nclaude-sonnet-4-5 +\$56\.00 +\$56\.00 +unchanged$/)
  })

  test('names a model that appeared and one that went away', async () => {
    const swapped = await snapshotOf({
      ...standardRoutes(),
      '/user/daily/activity': activity(spends, (at): Record<string, number> => (at >= 22 ? { 'claude-opus-4-1': 1 } : { 'claude-sonnet-4-5': 1 })),
    })
    const text = compareReport(swapped, 7)

    expect(text).toMatch(/claude-opus-4-1 +\$105\.00 +\$0\.00 +new/)
    expect(text).toMatch(/claude-sonnet-4-5 +\$0\.00 +\$70\.00 +gone/)
  })

  test('says why it cannot compare when the history is too short, and that the plugin reads 30 days', async () => {
    const short = await snapshotOf({ ...standardRoutes(), '/user/daily/activity': activity([5, 5, 5]) })

    expect(compareReport(short, 14)).toContain('Not enough history to compare 14 days with the 14 before them')
    expect(compareReport(short, 14)).toContain('takes 28 full days')
    expect(compareReport({ ...short, usage: null }, 7)).toContain('No usage history')
  })
})

describe('checkVerdict', () => {
  test('is OK, with the exit code 0, while nothing needs a look', async () => {
    expect(checkVerdict(await snapshotOf(), null, NOW, 80)).toEqual({
      level: 'ok',
      exitCode: 0,
      text: 'OK · 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)',
    })
  })

  test('is a WARNING, with 1, and lists what is near', async () => {
    const verdict = checkVerdict(await snapshotOf(withKey({ spend: 42 })), null, NOW, 80)

    expect(verdict.level).toBe('warning')
    expect(verdict.exitCode).toBe(1)
    expect(verdict.text.split('\n')).toEqual([
      'WARNING · 84% of budget · $42.00 of $50.00 · resets in 6d 12h (30d)',
      '  ▲ Key budget is at 84%: $42.00 of $50.00',
      '  ▲ At this pace the key budget runs out in 4d 11h, before it resets',
    ])
  })

  test('is CRITICAL, with 2, for what is broken, however much else is only near', async () => {
    const over = checkVerdict(await snapshotOf(withKey({ spend: 52 })), null, NOW, 80)
    const dead = checkVerdict(await snapshotOf(withKey({ status: 'revoked', spend: 42 })), null, NOW, 80)

    expect(over).toMatchObject({ level: 'critical', exitCode: 2 })
    expect(over.text).toContain('  ✗ Key budget is over its cap: $52.00 of $50.00')
    expect(dead).toMatchObject({ level: 'critical', exitCode: 2 })
    expect(dead.text.split('\n')[1]).toBe('  ✗ The key is revoked')
  })

  test('takes the threshold it is given', async () => {
    // The key is at 25%, the team at 41%: a threshold of 20 catches both, 50 neither.
    expect(checkVerdict(await snapshotOf(), null, NOW, 20).level).toBe('warning')
    expect(checkVerdict(await snapshotOf(), null, NOW, 50).level).toBe('ok')
  })

  test('takes the daily alert it is given', async () => {
    const verdict = checkVerdict(await snapshotOf(), null, NOW, 80, { dailyAlert: 5 })

    expect(verdict.level).toBe('warning')
    expect(verdict.text).toContain("▲ Today's spend is $8.70, over your daily alert of $5.00")
  })

  test('leaves the pace out when it is off', async () => {
    const verdict = checkVerdict(await snapshotOf(withKey({ spend: 42 })), null, NOW, 80, { isForecast: false })

    expect(verdict.text).not.toContain('At this pace')
  })

  test('is UNKNOWN, with 3, when there is nothing read', () => {
    expect(checkVerdict(null, failure('auth', 'Check the key.'), NOW, 80)).toEqual({
      level: 'unknown',
      exitCode: 3,
      text: 'UNKNOWN · The proxy is down\nCheck the key.',
    })
    expect(checkVerdict(null, null, NOW, 80).text).toBe('UNKNOWN · nothing was read yet')
  })

  test('is UNKNOWN too when the reading is old, and says what it last saw', async () => {
    const verdict = checkVerdict(await snapshotOf(), failure(), NOW + 300_000, 80)

    expect(verdict.exitCode).toBe(3)
    expect(verdict.text).toBe(
      'UNKNOWN · The proxy is down (last good reading 5m ago: 25% of budget · $12.50 of $50.00 · resets in 6d 11h (30d))',
    )
  })

  test('levelOf is the worst of what it is given', () => {
    expect(levelOf([])).toBe('ok')
    expect(levelOf([{ tone: 'warn', text: 'a' }])).toBe('warning')
    expect(levelOf([{ tone: 'warn', text: 'a' }, { tone: 'error', text: 'b' }])).toBe('critical')
  })
})

describe('jsonReport', () => {
  const parsed = async (options = {}, snapshot?: Awaited<ReturnType<typeof snapshotOf>>) =>
    JSON.parse(jsonReport(snapshot ?? (await snapshotOf()), NOW, 80, options)) as Record<string, any>

  test('is JSON, of a version, with who the key is and where it stands', async () => {
    const json = await parsed()

    expect(json.schema).toBe(1)
    expect(json.readAt).toBe('2026-10-03T12:00:00.000Z')
    expect(json.level).toBe('ok')
    expect(json.proxy).toBe('litellm.test')
    expect(json.key).toMatchObject({ alias: 'prod-claude', name: 'sk-...7890', status: 'active', user: 'jane', team: 'eng', expiresAt: '2026-11-13T00:00:00.000Z' })
    expect(json.budget).toMatchObject({ spend: 12.5, limit: 50, percent: 25, left: 37.5, period: '30d', resetAt: '2026-10-10T00:00:00.000Z' })
  })

  test('has the pace, the allowance and the usage', async () => {
    const json = await parsed()

    expect(json.pace.basis).toBe('window')
    near(json.pace.perDay, 12.5 / 23.5)
    expect(json.pace.projectedPercent).toBe(32)
    expect(json.pace.beforeReset).toBe(false)
    near(json.allowance.perDay, 37.5 / 6.5)
    expect(json.usage.today).toEqual({ date: '2026-10-03', spend: 8.7, requests: 90, tokens: 1700000 })
    expect(json.usage.last7).toMatchObject({ spend: 14.2, requests: 150 })
    expect(json.usage.last30.spend).toBe(14.2)
  })

  test('has the related budgets, the limits and the models', async () => {
    const json = await parsed()

    expect(json.related.team).toMatchObject({ id: 'eng', label: 'eng-platform', spend: 412, limit: 1000, percent: 41 })
    expect(json.related.user).toMatchObject({ id: 'jane', label: 'jane@acme.test', percent: 26 })
    expect(json.limits).toEqual({ rpm: 60, tpm: 100000, tpd: null, parallel: 5 })
    expect(json.models).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
  })

  test('says the level and lists the alerts', async () => {
    const json = await parsed({}, await snapshotOf(withKey({ spend: 52 })))

    expect(json.level).toBe('critical')
    expect(json.alerts).toEqual([{ tone: 'error', text: 'Key budget is over its cap: $52.00 of $50.00' }])
  })

  test('leaves out the pace and the allowance when it is told to', async () => {
    const json = await parsed({ isForecast: false })

    expect(json.pace).toBeNull()
    expect(json.allowance).toBeNull()
  })

  test('carries the session and why the reading is old', async () => {
    const json = await parsed({ session: { since: NOW - 3_600_000, spend: 2, last: 12.5 }, stale: 'The proxy is down' })

    expect(json.session).toEqual({ since: '2026-10-03T11:00:00.000Z', spend: 2 })
    expect(json.stale).toBe('The proxy is down')
    expect((await parsed()).stale).toBeNull()
  })

  test('has no usage, no pace and no related budgets where the proxy had none', async () => {
    const bare = await snapshotOf({
      '/key/info': reply(200, { key: HASH, info: { spend: 3, max_budget: null, user_id: null, models: [] } }),
    })
    const json = await parsed({}, bare)

    expect(json.usage).toBeNull()
    expect(json.pace).toBeNull()
    expect(json.related).toEqual({ user: null, team: null })
    expect(json.budget).toMatchObject({ limit: null, percent: null, left: null })
  })

  test('never holds the key, nor its hash', async () => {
    const text = jsonReport(await snapshotOf(), NOW, 80)

    expect(text).not.toContain(KEY)
    expect(text).not.toContain(HASH)
    expect(text).not.toContain(HASH.slice(0, 8))
  })
})

describe('pingReport', () => {
  const probes: Probe[] = [
    { path: '/key/info', status: 200, ms: 142, ok: true, detail: 'active' },
    { path: '/user/daily/activity', status: 404, ms: 40, ok: false, detail: 'Not Found · beta' },
    { path: '/health/readiness', status: null, ms: null, ok: false, detail: 'connection refused' },
  ]

  test('has one line for each endpoint, with its mark, its status and its time', () => {
    const lines = pingReport('litellm.test', 'https://litellm.test', probes).split('\n')

    expect(lines[0]).toBe('litellm.test · https://litellm.test')
    expect(lines[1]).toBe(`✓ ${'/key/info'.padEnd(20)} 200  142 ms active`)
    expect(lines[2]).toBe(`✗ ${'/user/daily/activity'.padEnd(20)} 404   40 ms Not Found · beta`)
    expect(lines[3]).toBe(`✗ ${'/health/readiness'.padEnd(20)}   —       — connection refused`)
  })
})
