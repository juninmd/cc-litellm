import { describe, expect, test } from 'claude-code/testing'

import type { Failure, Snapshot } from '../types'
import { jsonReport } from '../hooks/report-json'
import { checkAlerts, checkVerdict, levelOf, paceReport } from '../hooks/report-key'
import { near } from './near'
import { HASH, KEY, NOW, reply, snapshotOf, standardRoutes, withKey } from './support'

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
    expect(lines[2]).toBe('Runway     lasts until the reset at $2.18/day')
    expect(lines[3]).toBe('Allowance  $5.77/day to last until the reset')
    expect(lines[4]).toBe('Headroom   about 396 more requests at $0.095 each')
    expect(lines[5]).toBe('Today      $8.70 · 90 requests · 4.7× the usual day ($1.83)')
  })

  test('says when the budget runs out, once that comes before the reset, and what to cut it to', async () => {
    const text = paceReport(await snapshotOf(withKey({ spend: 42 })), NOW)

    expect(text).toMatch(/\nRunway {5}out in 3d 1\dh at \$2\.18\/day · resets in 6d 12h\n/)
    expect(text).toContain('\nAllowance  $1.23/day to last · 44% less than lately\n')
  })

  test('does the same for the team and the user, each under its name', async () => {
    const text = paceReport(await snapshotOf(), NOW)

    expect(text).toContain('\nTeam eng-platform\n  Budget     $412.00 / $1,000.00 (41%)')
    expect(text).toContain('\n  Allowance  $51.13/day to last until the reset')
    expect(text).toContain('\nUser jane@acme.test\n  Budget     $26.10 / $100.00 (26%)')
    expect(text).toContain('\n  Allowance  $2.59/day to last until the reset')
  })

  test('says what is missing when the budget has no pace yet', async () => {
    const early = await snapshotOf({ ...standardRoutes(), '/user/daily/activity': reply(404, 'x') })

    expect(paceReport(early, NOW)).toContain('Runway     no pace to show: it needs the usage history, and some spend in it')
  })

  test('has no pace to wait for on a budget with no cap, and one that is spent', async () => {
    expect(paceReport(await snapshotOf(withKey({ max_budget: null })), NOW)).not.toContain('no pace to show')
    expect(paceReport(await snapshotOf(withKey({ spend: 52 })), NOW)).not.toContain('no pace to show')
  })

  test('adds the session, with its rate once it has one', async () => {
    const snapshot = { ...(await snapshotOf()), session: { since: NOW - 3_600_000, spend: 2, last: 12.5 } }

    expect(paceReport(snapshot, NOW)).toMatch(/\nSession {4}\+\$2\.00 since \d\d:\d\d \(1h ago\) · \$2\.00\/h/)
  })

  test('never holds the key', async () => {
    expect(paceReport(await snapshotOf(), NOW)).not.toContain(KEY)
  })
})

describe('checkVerdict', () => {
  test('is OK, with the exit code 0, while nothing needs a look', async () => {
    expect(checkVerdict(await snapshotOf(), null, NOW, 80, 0)).toEqual({
      level: 'ok',
      exitCode: 0,
      text: 'OK · ██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)',
    })
  })

  test('is a WARNING, with 1, and lists what is near', async () => {
    const verdict = checkVerdict(await snapshotOf(withKey({ spend: 42 })), null, NOW, 80, 0)
    const lines = verdict.text.split('\n')

    expect(verdict).toMatchObject({ level: 'warning', exitCode: 1 })
    expect(lines[0]).toMatch(/^WARNING · .* 84% of budget · \$42\.00 of \$50\.00 · resets in 6d 12h \(30d\) · out in 3d 1\dh at this pace$/)
    expect(lines.slice(1)).toEqual(['  ▲ Key budget is at 84%: $42.00 of $50.00', expect.stringMatching(/^ {2}▲ Key budget: out in 3d 1\dh at this pace$/)])
  })

  test('is CRITICAL, with 2, for what is broken, however much else is only near', async () => {
    const over = checkVerdict(await snapshotOf(withKey({ spend: 52 })), null, NOW, 80, 0)
    const dead = checkVerdict(await snapshotOf(withKey({ status: 'revoked', spend: 42 })), null, NOW, 80, 0)

    expect(over).toMatchObject({ level: 'critical', exitCode: 2 })
    expect(over.text).toContain('  ✗ Key budget is over its cap: $52.00 of $50.00')
    expect(dead).toMatchObject({ level: 'critical', exitCode: 2 })
    expect(dead.text.split('\n')[1]).toBe('  ✗ The key is revoked')
  })

  test('says an expiring key, and an expired one, in its own words', async () => {
    const soon = checkAlerts(await snapshotOf(withKey({ expires: new Date(NOW + DAY).toISOString() })), NOW, 80, 0)
    const gone = checkAlerts(await snapshotOf(withKey({ expires: new Date(NOW + 1000).toISOString() })), NOW + 5000, 80, 0)

    expect(soon).toEqual([{ tone: 'warn', text: 'The key expires in 1d' }])
    expect(gone).toEqual([{ tone: 'error', text: 'The key expired 4s ago' }])
  })

  test('takes the threshold it is given', async () => {
    // The key is at 25%, the team at 41%: a threshold of 20 catches both, 50 neither.
    expect(checkVerdict(await snapshotOf(), null, NOW, 20, 0).level).toBe('warning')
    expect(checkVerdict(await snapshotOf(), null, NOW, 50, 0).level).toBe('ok')
  })

  test('takes the daily alert it is given', async () => {
    const verdict = checkVerdict(await snapshotOf(), null, NOW, 80, 5)

    expect(verdict.level).toBe('warning')
    expect(verdict.text).toContain("▲ Today's spend is $8.70, over your daily alert of $5.00")
  })

  test('is UNKNOWN, with 3, when there is nothing read', () => {
    expect(checkVerdict(null, failure('auth', 'Check the key.'), NOW, 80, 0)).toEqual({
      level: 'unknown',
      exitCode: 3,
      text: 'UNKNOWN · The proxy is down\nCheck the key.',
    })
    expect(checkVerdict(null, null, NOW, 80, 0).text).toBe('UNKNOWN · nothing was read yet')
  })

  test('is UNKNOWN too when the reading is old, and says what it last saw', async () => {
    const verdict = checkVerdict(await snapshotOf(), failure(), NOW + 300_000, 80, 0)

    expect(verdict.exitCode).toBe(3)
    expect(verdict.text).toBe(
      'UNKNOWN · The proxy is down (last good reading 5m ago: ██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 11h (30d))',
    )
  })

  test('levelOf is the worst of what it is given', () => {
    expect(levelOf([])).toBe('ok')
    expect(levelOf([{ tone: 'warn', text: 'a' }])).toBe('warning')
    expect(levelOf([{ tone: 'warn', text: 'a' }, { tone: 'error', text: 'b' }])).toBe('critical')
  })
})

describe('jsonReport', () => {
  const OPTIONS = { warnPercent: 80, dailyAlert: 0 }
  const parsed = async (snapshot?: Snapshot, options: Partial<Parameters<typeof jsonReport>[2]> = {}) =>
    JSON.parse(jsonReport(snapshot ?? (await snapshotOf()), NOW, { ...OPTIONS, ...options })) as Record<string, any>

  test('is JSON, of a version, with who the key is and where it stands', async () => {
    const json = await parsed()

    expect(json.schema).toBe(1)
    expect(json.readAt).toBe('2026-10-03T12:00:00.000Z')
    expect(json.level).toBe('ok')
    expect(json.proxy).toBe('litellm.test')
    expect(json.key).toMatchObject({ alias: 'prod-claude', name: 'sk-...7890', status: 'active', user: 'jane', role: 'internal_user', team: 'eng', expiresAt: '2026-11-13T00:00:00.000Z' })
    expect(json.budget).toMatchObject({ spend: 12.5, limit: 50, percent: 25, left: 37.5, period: '30d', resetAt: '2026-10-10T00:00:00.000Z' })
  })

  test('has the runway, the allowance and the usage', async () => {
    const json = await parsed()

    expect(json.runway).toMatchObject({ kind: 'lasts', runsOutAt: null, resetAt: '2026-10-10T00:00:00.000Z' })
    near(json.runway.perDay, 14.2 / 6.5)
    near(json.allowance.perDay, 37.5 / 6.5)
    near(json.allowance.perHour, 37.5 / 6.5 / 24)
    expect(json.usage.today).toEqual({ date: '2026-10-03', spend: 8.7, requests: 90, tokens: 1700000 })
    expect(json.usage.last7).toMatchObject({ spend: 14.2, requests: 150 })
    expect(json.usage.last30.spend).toBe(14.2)
  })

  test('says when the budget runs out, once it will before the reset', async () => {
    const json = await parsed(await snapshotOf(withKey({ spend: 45 })))

    expect(json.runway.kind).toBe('runs-out')
    expect(Date.parse(json.runway.runsOutAt)).toBeLessThan(Date.parse(json.runway.resetAt))
  })

  test('has the related budgets, the limits and the models', async () => {
    const json = await parsed()

    expect(json.related.team).toMatchObject({ id: 'eng', label: 'eng-platform', spend: 412, limit: 1000, percent: 41 })
    expect(json.related.user).toMatchObject({ id: 'jane', label: 'jane@acme.test', percent: 26 })
    expect(json.related.member).toBeNull()
    expect(json.limits).toEqual({ rpm: 60, tpm: 100000, tpd: null, parallel: 5 })
    expect(json.models).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
  })

  test('says the level and lists the alerts', async () => {
    const json = await parsed(await snapshotOf(withKey({ spend: 52 })))

    expect(json.level).toBe('critical')
    expect(json.alerts).toEqual([{ tone: 'error', text: 'Key budget is over its cap: $52.00 of $50.00' }])
  })

  test('carries the session, the daily alert and why the reading is old', async () => {
    const snapshot = { ...(await snapshotOf()), session: { since: NOW - 3_600_000, spend: 2, last: 12.5 } }
    const json = await parsed(snapshot, { stale: 'The proxy is down', dailyAlert: 5 })

    expect(json.session).toEqual({ since: '2026-10-03T11:00:00.000Z', spend: 2 })
    expect(json.stale).toBe('The proxy is down')
    expect(json.alerts).toEqual([{ tone: 'warn', text: "Today's spend is $8.70, over your daily alert of $5.00" }])
    expect((await parsed()).stale).toBeNull()
    expect((await parsed()).session).toBeNull()
  })

  test('says what the proxy said of itself', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/health/readiness': reply(200, { litellm_version: '1.77.0', db: 'connected' }) })

    expect((await parsed(snapshot)).litellm).toEqual({ version: '1.77.0', db: 'connected' })
  })

  test('has no usage, no runway and no related budgets where the proxy had none', async () => {
    const bare = await snapshotOf({ '/key/info': reply(200, { key: HASH, info: { spend: 3, max_budget: null, user_id: null, models: [] } }) })
    const json = await parsed(bare)

    expect(json.usage).toBeNull()
    expect(json.runway).toBeNull()
    expect(json.related).toEqual({ user: null, team: null, member: null })
    expect(json.budget).toMatchObject({ limit: null, percent: null, left: null })
  })

  test('never holds the key, nor its hash', async () => {
    const text = jsonReport(await snapshotOf(), NOW, OPTIONS)

    expect(text).not.toContain(KEY)
    expect(text).not.toContain(HASH)
    expect(text).not.toContain(HASH.slice(0, 8))
  })
})
