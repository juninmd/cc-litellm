import type { Failure } from '../types'
import { failure } from './failures'
import { redact, truncate } from './format'

export type EnvName =
  | 'ANTHROPIC_BASE_URL'
  | 'ANTHROPIC_AUTH_TOKEN'
  | 'ANTHROPIC_API_KEY'
  | 'ANTHROPIC_CUSTOM_HEADERS'
  | 'LITELLM_PROXY_API_BASE'
  | 'LITELLM_PROXY_API_KEY'

export type Sources = {
  url: string | null
  key: string | null
  env: Partial<Record<EnvName, string>>
  settingsEnv: Partial<Record<EnvName, string>>
}

export type Credentials = {
  roots: string[]
  host: string
  key: string
  keySource: string
  headers: Record<string, string>
}

export type Resolved = { ok: true; credentials: Credentials } | { ok: false; failure: Failure }

const PASS_THROUGH = /\/(?:anthropic|bedrock|vertex[_-]ai|gemini|openai|azure|cohere|v1)(?:\/.*)?$/i

// The userinfo runs to the last "@" before the path: a password may hold one.
export const hostOf = (url: string): string => /^https?:\/\/(?:[^/]*@)?([^/]+)/i.exec(url)?.[1] ?? url
const originOf = (url: string): string | null => /^(https?:\/\/[^/]+)/i.exec(url)?.[1] ?? null

const customHeader = (raw: string | undefined, name: string): string | null => {
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const colon = line.indexOf(':')

    if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === name) {
      return line.slice(colon + 1).trim() || null
    }
  }

  return null
}

const bearer = (value: string): string => value.replace(/^Bearer\s+/i, '').trim()

export const candidateRoots = (base: string, isExplicit: boolean): string[] => {
  const roots: string[] = []
  const add = (url: string | null): void => {
    const clean = url?.replace(/\/+$/, '')

    if (clean && !roots.includes(clean)) {
      roots.push(clean)
    }
  }
  const origin = originOf(base)
  const path = origin ? base.slice(origin.length) : ''

  if (!isExplicit && origin) {
    add(`${origin}${path.replace(PASS_THROUGH, '')}`)
  }
  add(base)
  if (!isExplicit) {
    add(origin)
  }

  return roots
}

const normalize = (url: string | undefined): string | null => {
  const base = url?.replace(/[?#].*$/, '').replace(/\/+$/, '')

  return base && /^https?:\/\/[^/\s]+/i.test(base) ? base : null
}

export const resolveCredentials = (sources: Sources, now: number): Resolved => {
  const pick = (name: EnvName): string | undefined => {
    const value = sources.env[name]?.trim() || sources.settingsEnv[name]?.trim()

    return value || undefined
  }
  const optionUrl = sources.url?.trim() || undefined
  const anthropicBase = pick('ANTHROPIC_BASE_URL')
  const proxyBase = pick('LITELLM_PROXY_API_BASE')
  const rawUrl = optionUrl ?? anthropicBase ?? proxyBase

  if (!rawUrl) {
    return {
      ok: false,
      failure: failure(
        'not-configured',
        'Claude Code is not routed through a LiteLLM proxy (ANTHROPIC_BASE_URL is not set).',
        now,
        {
          hint: 'Set ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN, or fill litellm_url and litellm_key with: claude plugin configure litellm-key',
        },
      ),
    }
  }
  const base = normalize(rawUrl)

  if (!base) {
    return {
      ok: false,
      failure: failure('not-configured', `"${truncate(redact(rawUrl), 60)}" is not an http(s) URL.`, now, {
        hint: 'Use a full URL such as https://litellm.example.com',
      }),
    }
  }
  if (/^https?:\/\/api\.anthropic\.com$/i.test(base)) {
    return {
      ok: false,
      failure: failure(
        'not-configured',
        optionUrl
          ? 'litellm_url points at api.anthropic.com, which is not a LiteLLM proxy.'
          : 'Claude Code talks to api.anthropic.com directly, not to a LiteLLM proxy.',
        now,
        { hint: 'Point ANTHROPIC_BASE_URL at your proxy, or fill litellm_url with: claude plugin configure litellm-key' },
      ),
    }
  }
  const isSameProxy = (other: string | undefined): boolean => {
    const origin = originOf(normalize(other) ?? '')

    return origin !== null && origin === originOf(base)
  }
  const route = optionUrl
    ? isSameProxy(anthropicBase)
      ? 'anthropic'
      : isSameProxy(proxyBase)
        ? 'litellm'
        : 'custom'
    : anthropicBase
      ? 'anthropic'
      : 'litellm'
  const headerKey = route === 'anthropic' ? customHeader(pick('ANTHROPIC_CUSTOM_HEADERS'), 'x-litellm-api-key') : null
  const candidates: { key: string | null | undefined; source: string; header?: 'x-litellm-api-key' }[] = [
    { key: sources.key?.trim(), source: 'plugin option litellm_key' },
    ...(route === 'anthropic'
      ? [
          { key: headerKey ? bearer(headerKey) : null, source: 'ANTHROPIC_CUSTOM_HEADERS (x-litellm-api-key)', header: 'x-litellm-api-key' as const },
          { key: pick('ANTHROPIC_AUTH_TOKEN'), source: 'ANTHROPIC_AUTH_TOKEN' },
          { key: pick('ANTHROPIC_API_KEY'), source: 'ANTHROPIC_API_KEY' },
        ]
      : []),
    ...(route === 'custom' ? [] : [{ key: pick('LITELLM_PROXY_API_KEY'), source: 'LITELLM_PROXY_API_KEY' }]),
  ]
  const chosen = candidates.find(candidate => candidate.key)

  if (!chosen?.key) {
    const hints = {
      anthropic: 'Set ANTHROPIC_AUTH_TOKEN to your virtual key, or fill litellm_key with: claude plugin configure litellm-key',
      litellm: 'Set LITELLM_PROXY_API_KEY, or fill litellm_key with: claude plugin configure litellm-key',
      custom: 'Fill litellm_key too, with: claude plugin configure litellm-key. The keys in the environment belong to other hosts and are not sent here.',
    }

    return {
      ok: false,
      failure: failure('not-configured', `No virtual key found for ${hostOf(base)}.`, now, { hint: hints[route] }),
    }
  }
  const key = bearer(chosen.key)

  return {
    ok: true,
    credentials: {
      roots: candidateRoots(base, optionUrl !== undefined),
      host: hostOf(base),
      key,
      keySource: chosen.source,
      headers: {
        accept: 'application/json',
        [chosen.header ?? 'authorization']: `Bearer ${key}`,
      },
    },
  }
}
