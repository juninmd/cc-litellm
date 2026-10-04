import type { Admin, Send } from '../hooks/admin'
import type { Deps } from '../hooks/admin-commands'
import { reply } from './support'

export const ADMIN_KEY = 'sk-admin-secret-0000000'
export const OWN_KEY = 'sk-own-virtual-1111111'
export const RAW_LEAK = 'sk-leaky-raw-key-222222'
export const hashOf = (n: number): string => n.toString(16).padStart(2, '0').repeat(32)

type Row = Record<string, unknown>
export type Call = { method: string; path: string; body: Row | null; auth: string }

const FUTURE = '2026-11-01T00:00:00+00:00'

/** The management endpoints of a LiteLLM v1.99 proxy, shaped like its real answers, in memory. */
export const fakeProxy = (options: { admin?: string; rows?: Row[]; users?: Row[]; teams?: Row[]; fallbacks?: Row } = {}) => {
  const admin = options.admin ?? ADMIN_KEY
  const calls: Call[] = []
  const keys = new Map<string, Row>(
    (options.rows ?? [
      { token: hashOf(1), key_alias: 'alice-ci', key_name: 'sk-...1111', spend: 0.09, max_budget: 5, budget_duration: '30d', user_id: 'alice', expires: FUTURE },
      { token: hashOf(2), key_alias: 'bob-dev', key_name: 'sk-...2222', spend: 1, max_budget: null, user_id: 'bob', team_id: 'team-1' },
    ]).map(row => [String(row.token), row]),
  )
  const users = new Map<string, Row>(
    (options.users ?? [{ user_id: 'alice', user_email: 'alice@acme.test', user_role: 'internal_user', spend: 3, max_budget: 20, budget_duration: '30d' }]).map(row => [String(row.user_id), row]),
  )
  const teams = new Map<string, Row>(
    (options.teams ?? [{ team_id: 'team-1', team_alias: 'platform-eng', spend: 40, max_budget: 100, budget_duration: '30d' }]).map(row => [String(row.team_id), row]),
  )
  let serial = 100

  const denied = reply(401, {
    error: { message: 'Authentication Error, Only proxy admin can be used to generate, delete, update info for new keys/users/teams. Route=/x. Your role=unknown.', type: 'auth_error', param: 'None', code: '401' },
  })

  const send: Send = async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const [route = '', rawQuery = ''] = path.split('?')
    const query = new URLSearchParams(rawQuery)
    const body = init.body ? (JSON.parse(init.body) as Row) : null
    const auth = init.headers.authorization ?? ''

    calls.push({ method: init.method, path, body, auth })
    if (auth !== `Bearer ${admin}`) {
      return denied
    }
    if (route === '/key/list') {
      const alias = query.get('key_alias')
      const user = query.get('user_id')
      const team = query.get('team_id')
      const found = [...keys.values()].filter(
        row => (!alias || row.key_alias === alias) && (!user || row.user_id === user) && (!team || row.team_id === team),
      )

      return reply(200, { keys: found, total_count: found.length, current_page: 1, total_pages: 1 })
    }
    if (route === '/key/info') {
      const row = keys.get(query.get('key') ?? '')

      return row ? reply(200, { key: row.token, info: row }) : reply(404, { error: { message: 'Key not found in database', code: '404' } })
    }
    if (route === '/key/generate' && body) {
      if ([...keys.values()].some(row => row.key_alias === body.key_alias)) {
        return reply(400, { error: { message: `Key with alias '${String(body.key_alias)}' already exists. Unique key aliases across all keys are required.`, code: '400' } })
      }
      serial += 1
      const row = { token: hashOf(serial), key_alias: body.key_alias, key_name: `sk-...${serial}`, spend: 0, max_budget: body.max_budget ?? null, budget_duration: body.budget_duration ?? null, user_id: body.user_id ?? null, team_id: body.team_id ?? null }

      keys.set(String(row.token), row)

      return reply(200, { ...row, key: `sk-generated-secret-${serial}` })
    }
    if (route === '/key/update' && body) {
      const row = keys.get(String(body.key))

      if (!row) {
        return reply(404, { error: { message: 'Key not found', code: '404' } })
      }
      row.max_budget = body.max_budget

      return reply(200, { ...row, key: RAW_LEAK })
    }
    if ((route === '/key/block' || route === '/key/unblock') && body) {
      const row = keys.get(String(body.key))

      if (row) {
        row.blocked = route === '/key/block'
      }

      return reply(200, { token: body.key, blocked: route === '/key/block' })
    }
    if (route === '/key/delete' && body) {
      for (const hash of body.keys as string[]) {
        keys.delete(hash)
      }

      return reply(200, { deleted_keys: body.keys })
    }
    if (route === '/user/info') {
      const user = users.get(query.get('user_id') ?? '')

      return user ? reply(200, { user_id: user.user_id, user_info: user, keys: [], teams: [] }) : reply(404, { error: { message: `User ${query.get('user_id')} not found`, code: '404' } })
    }
    if (route === '/user/update' && body) {
      users.set(String(body.user_id), { ...users.get(String(body.user_id)), user_id: body.user_id, spend: 0, ...body })

      return reply(200, { user_id: body.user_id, data: users.get(String(body.user_id)) })
    }
    if (route === '/team/info') {
      const team = teams.get(query.get('team_id') ?? '')

      return team ? reply(200, { team_id: team.team_id, team_info: team, keys: [] }) : reply(404, { error: { message: `Team not found, passed team id: ${query.get('team_id')}.`, code: '404' } })
    }
    if (route === '/v2/team/list') {
      const alias = query.get('team_alias')

      return reply(200, { teams: [...teams.values()].filter(team => team.team_alias === alias), total: 1, page: 1 })
    }
    if (route === '/team/update' && body) {
      Object.assign(teams.get(String(body.team_id)) ?? {}, { max_budget: body.max_budget })

      return reply(200, { team_id: body.team_id })
    }
    if (route === '/router/settings') {
      return reply(200, {
        current_values: options.fallbacks ?? {
          routing_strategy: 'simple-shuffle',
          num_retries: 0,
          allowed_fails: 2,
          cooldown_time: 30,
          fallbacks: [{ 'cloud/auto': ['cloud/auto-long', 'cloud/openrouter-zdr'] }, { 'cloud/auto-long': ['cloud/openrouter-zdr'] }],
          context_window_fallbacks: [{ 'cloud/auto': ['cloud/deepseek-v4-flash'] }],
        },
      })
    }

    return reply(404, { detail: 'Not Found' })
  }

  return { send, calls, keys, users, teams, writes: () => calls.filter(call => call.method === 'POST') }
}

export type Fake = ReturnType<typeof fakeProxy>

export const adminOf = (send: Send, patch: Partial<Admin> = {}): Admin => ({
  root: 'https://litellm.test',
  headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${ADMIN_KEY}` },
  send,
  secrets: [OWN_KEY, ADMIN_KEY],
  isOwnKey: false,
  ...patch,
})

export const depsOf = (fake: Fake, patch: Partial<Deps> = {}, admin: Partial<Admin> = {}): Deps & { asked: string[]; copied: string[] } => {
  const asked: string[] = []
  const copied: string[] = []

  return {
    admin: adminOf(fake.send, admin),
    ownHash: hashOf(1),
    ownUserId: 'alice',
    surfaces: ['terminal'],
    now: Date.parse('2026-10-03T12:00:00Z'),
    ask: async question => {
      asked.push(question)

      return 'Apply'
    },
    copy: async text => {
      copied.push(text)

      return true
    },
    asked,
    copied,
    ...patch,
  }
}
