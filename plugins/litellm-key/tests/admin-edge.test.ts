import { describe, expect, test } from 'claude-code/testing'

import { rowOf } from '../hooks/admin'
import type { Send } from '../hooks/admin'
import { runAdmin } from '../hooks/admin-commands'
import { keysText } from '../hooks/admin-plan'
import { depsOf, fakeProxy, hashOf } from './fake-proxy'
import { reply } from './support'

const run = (deps: ReturnType<typeof depsOf>, command: 'keys' | 'key' | 'grant' | 'fallbacks', input: string) =>
  runAdmin(deps, command, input)

describe('a switch never takes a value', () => {
  for (const flag of ['--yes=false', '--yes=0', '--yes=no']) {
    test(`${flag} does not skip the confirmation`, async () => {
      const fake = fakeProxy()
      const { text } = await run(depsOf(fake, { surfaces: [] }), 'grant', `5 --key alice-ci ${flag}`)

      expect(text).toContain('--yes takes no value')
      expect(fake.writes()).toHaveLength(0)
    })
  }

  test('--reveal=0 does not print the new secret', async () => {
    const fake = fakeProxy()
    const { text } = await run(depsOf(fake), 'key', 'new ci --budget 5 --yes --reveal=0')

    expect(text).toContain('--reveal takes no value')
    expect(fake.writes()).toHaveLength(0)
  })
})

describe('a new key never gets lost', () => {
  test('a clipboard that throws counts as a refusal: the key is deleted again', async () => {
    const fake = fakeProxy()
    const deps = depsOf(fake, {
      copy: async () => {
        throw new Error('clipboard unavailable')
      },
    })
    const { text, isChanged } = await run(deps, 'key', 'new ci --budget 5 --yes')

    expect(text).toContain('was deleted again')
    expect(isChanged).toBe(false)
    expect([...fake.keys.values()].some(row => row.key_alias === 'ci')).toBe(false)
  })

  test('the success line says how to take the key back if the paste comes out empty', async () => {
    const { text } = await run(depsOf(fakeProxy()), 'key', 'new ci --budget 5 --yes')

    expect(text).toContain('/litellm key block ci')
  })
})

describe('a write that went through is never reported as failed', () => {
  const unreadable = (fake: ReturnType<typeof fakeProxy>): Send => {
    let isWritten = false

    return async (url, init) => {
      const answer = await fake.send(url, init)

      isWritten ||= url.includes('/key/update')

      return isWritten && url.includes('/key/info') ? reply(503, 'upstream down') : answer
    }
  }

  test('a failed read-back after a 200 update still says the budget changed, and not to repeat it', async () => {
    const fake = fakeProxy()
    const { text, isChanged } = await run(depsOf(fake, {}, { send: unreadable(fake) }), 'grant', '10 --key alice-ci --yes')

    expect(fake.keys.get(hashOf(1))?.max_budget).toBe(15)
    expect(isChanged).toBe(true)
    expect(text).toContain('$15.00')
    expect(text).toContain('Do not repeat')
  })

  test('a write that timed out says it may still have landed', async () => {
    const fake = fakeProxy()
    const send: Send = async (url, init) => {
      if (init.method === 'POST') {
        throw new Error('no answer within 15s')
      }

      return fake.send(url, init)
    }
    const { text } = await run(depsOf(fake, {}, { send }), 'grant', '10 --key alice-ci --yes')

    expect(text).toContain('may still have gone through')
  })
})

describe('what the listing and the grant read from the proxy', () => {
  test('two teams with one alias are refused, not guessed', async () => {
    const teams = [
      { team_id: 't1', team_alias: 'dup', spend: 1, max_budget: 10 },
      { team_id: 't2', team_alias: 'dup', spend: 2, max_budget: 20 },
    ]
    const fake = fakeProxy({ teams })
    const { text } = await run(depsOf(fake), 'grant', '5 --team dup --yes')

    expect(text).toContain('Several teams share the alias "dup"')
    expect(fake.writes()).toHaveLength(0)
  })

  test('an expiry without a zone is UTC, like the rest of the proxy dates', () => {
    const row = rowOf({ token: hashOf(1), expires: '2026-10-03T12:00:00' })

    expect(row?.expiresAt).toBe(Date.UTC(2026, 9, 3, 12))
  })

  test('a zero cap shows as $0.00, never as null%', () => {
    const row = rowOf({ token: hashOf(1), key_alias: 'frozen', spend: 0, max_budget: 0 })
    const text = keysText(row ? [row] : [], 1, 'all keys', Date.UTC(2026, 9, 3))

    expect(text).toContain('$0.00 / $0.00')
    expect(text).not.toContain('null')
  })

  test('a cap that lives in the budget table counts, as it does for the key Claude Code uses', async () => {
    const rows = [
      { token: hashOf(7), key_alias: 'tabled', spend: 5, max_budget: null, litellm_budget_table: { max_budget: 20, budget_duration: '7d' } },
    ]
    const { text } = await run(depsOf(fakeProxy({ rows })), 'grant', '5 --key tabled --dry-run')

    expect(text).toContain('$20.00 → $25.00 (+$5.00) per 7d')
  })
})
