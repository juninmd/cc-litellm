import type { Credentials, Sources } from '../hooks/credentials'
import type { FetchRequest } from '../hooks/litellm'
import { BASE, KEY, NOW, standardRoutes } from './support'

export const sources = (patch: Partial<Sources> = {}): Sources => ({
  url: null,
  key: null,
  env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: KEY },
  settingsEnv: {},
  ...patch,
})

export const credentials = (patch: Partial<Credentials> = {}): Credentials => ({
  roots: [BASE],
  host: 'litellm.test',
  key: KEY,
  keySource: 'ANTHROPIC_AUTH_TOKEN',
  headers: { authorization: `Bearer ${KEY}` },
  ...patch,
})

export const request = (http: FetchRequest['http'], patch: Partial<FetchRequest> = {}): FetchRequest => ({
  credentials: credentials(),
  http,
  now: NOW,
  pinnedRoot: null,
  wantRelated: true,
  wantUsage: true,
  refreshSlow: true,
  previous: null,
  ...patch,
})

export const standardUsage = () => JSON.parse(String(standardRoutes()['/user/daily/activity'] && (standardRoutes()['/user/daily/activity'] as { text: string }).text))
