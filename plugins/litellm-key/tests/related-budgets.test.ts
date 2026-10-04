import { describe, expect, test } from 'claude-code/testing'

import { exceededItems } from '../hooks/exceeded'
import { facts } from '../hooks/facts'
import { fetchSnapshot } from '../hooks/litellm'
import { parseKey, parseMember } from '../hooks/parsers'
import { meters } from '../hooks/summary'
import { request } from './factories'
import { NOW, keyBody, reply, router, snapshotOf, standardRoutes, withKey } from './support'

// What a plain virtual key reads from /team/info when the team sets team_member_budget (shape checked on LiteLLM v1.99.1).
const teamWith = (cap: number | null, extra: Record<string, unknown> = {}, period: string | null = '30d') => ({
  ...standardRoutes(),
  '/team/info': reply(200, {
    team_id: 'eng',
    team_info: {
      team_id: 'eng',
      team_alias: 'eng-platform',
      spend: 412,
      max_budget: 1000,
      budget_duration: '30d',
      team_member_budget_table: cap === null ? null : { max_budget: cap, budget_duration: period },
    },
    keys: [],
    team_memberships: [],
    ...extra,
  }),
})

describe('the per-member cap of a team', () => {
  test('is read from the /team/info the plugin already asks for, with this key as a floor', async () => {
    const { http, calls } = router(teamWith(40))
    const result = await fetchSnapshot(request(http))

    expect(calls.filter(call => call.url.includes('/team/info'))).toHaveLength(1)
    expect(result.ok && result.snapshot.member).toEqual({
      id: 'jane',
      label: 'jane',
      budget: { spend: 12.5, limit: 40, softLimit: null, duration: '30d', resetAt: null },
      isFloor: true,
    })
  })

  test('takes the larger of the membership spend and this key, and a membership budget over the team default', async () => {
    const memberships = [
      { user_id: 'someone-else', spend: 99, litellm_budget_table: { max_budget: 1 } },
      { user_id: 'jane', spend: 30, litellm_budget_table: { max_budget: 60 } },
    ]
    const member = (await snapshotOf(teamWith(40, { team_memberships: memberships }))).member

    expect(member?.budget.limit).toBe(60)
    expect(member?.budget.spend).toBe(30)
  })

  test('is absent without a cap, without a user, and when the team could not be read', async () => {
    expect((await snapshotOf(teamWith(null))).member).toBeNull()
    expect((await snapshotOf({ ...teamWith(40), ...withKey({ user_id: null }) })).member).toBeNull()
    expect((await snapshotOf({ ...teamWith(40), '/team/info': reply(403, { error: { message: 'no' } }) })).member).toBeNull()
  })

  test('parseMember ignores a table with no max_budget and an answer that is not a team', () => {
    const key = parseKey(keyBody(), keyBody().info, NOW)

    expect(parseMember({ team_info: { team_member_budget_table: { max_budget: null } } }, key)).toBeNull()
    expect(parseMember('nope', key)).toBeNull()
  })

  test('is spent up once this key alone has used a cap that never resets, and cannot be raised with /litellm grant', async () => {
    const spent = exceededItems(await snapshotOf(teamWith(10, {}, null)), NOW)
    const fine = exceededItems(await snapshotOf(teamWith(40, {}, null)), NOW)

    expect(spent.map(item => item.label)).toEqual(['member jane (team eng-platform)'])
    expect(spent[0]?.isGrantable).toBe(false)
    expect(fine).toEqual([])
  })

  test('is a meter that says it counts this key only', async () => {
    const found = meters(await snapshotOf(teamWith(10, {}, null)), NOW, 80).find(item => item.label.startsWith('Member'))

    expect(found?.label).toBe('Member jane')
    expect(found?.text).toContain('this key only')
    expect(found?.tone).toBe('error')
  })

  test('does not claim the proxy refuses requests when the cap resets: the key may hold the spend of older periods', async () => {
    const snapshot = await snapshotOf(teamWith(10))
    const found = meters(snapshot, NOW, 80).find(item => item.label.startsWith('Member'))

    expect(snapshot.member?.budget.spend).toBe(12.5)
    expect(exceededItems(snapshot, NOW)).toEqual([])
    expect(found?.tone).toBe('warn')
    expect(found?.text).toContain('this key only')
  })
})

describe('the organization of a key', () => {
  test('is named, with the way to read its budget, because a virtual key cannot', async () => {
    const snapshot = await snapshotOf(withKey({ organization_id: 'org-1' }))
    const row = facts(snapshot, NOW).find(item => item.label === 'Organization')

    expect(snapshot.key.organizationId).toBe('org-1')
    expect(row?.text).toBe('org-1 · budget: /litellm org')
  })

  test('is not mentioned for a key with none', async () => {
    expect(facts(await snapshotOf(), NOW).some(item => item.label === 'Organization')).toBe(false)
  })
})
