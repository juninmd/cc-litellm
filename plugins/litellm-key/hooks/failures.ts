import type { Failure, FailureKind } from '../types'
import { redact, truncate } from './format'
import { isObject } from './json'

export const failure = (
  kind: FailureKind,
  message: string,
  now: number,
  extra: { hint?: string; status?: number } = {},
): Failure => ({
  kind,
  message,
  hint: extra.hint ?? null,
  status: extra.status ?? null,
  at: now,
})

export const looksLikeLiteLLM = (status: number, json: unknown): boolean => {
  if (!isObject(json)) {
    return false
  }
  if (isObject(json.error) && json.type !== 'error') {
    return 'param' in json.error || 'code' in json.error
  }

  return 'detail' in json && !(status === 404 && json.detail === 'Not Found')
}

export const messageOf = (json: unknown, text: string): string => {
  if (isObject(json)) {
    const { error, detail, message } = json

    if (isObject(error) && typeof error.message === 'string') {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    if (typeof detail === 'string') {
      return detail
    }
    if (isObject(detail)) {
      for (const value of [detail.error, detail.message]) {
        if (typeof value === 'string') {
          return value
        }
      }
    }
    if (typeof message === 'string') {
      return message
    }
  }

  return text.trim() || 'empty response'
}

export const classify = (status: number, json: unknown, text: string, key: string, now: number): Failure => {
  const message = truncate(redact(messageOf(json, text).replace(/\s+/g, ' '), [key]), 200)
  const extra = { status }

  if (status === 401 && /key is blocked/i.test(message)) {
    return failure('blocked', 'The proxy says this key is blocked.', now, {
      ...extra,
      hint: 'Ask a proxy admin to unblock it (/key/unblock), or use another key.',
    })
  }
  if (status === 401 && /expired key|key (?:has )?expired/i.test(message)) {
    return failure('expired', 'The proxy says this key has expired.', now, {
      ...extra,
      hint: 'Ask a proxy admin for a new key or a later expiry.',
    })
  }
  if (status === 401) {
    return failure('auth', `The proxy rejected the key (401): ${message}`, now, {
      ...extra,
      hint: 'The key may be invalid, expired or blocked. Check ANTHROPIC_AUTH_TOKEN.',
    })
  }
  if (status === 403) {
    return failure('forbidden', `This key may not read its own info (403): ${message}`, now, extra)
  }
  if (status === 404 && /key not found/i.test(message)) {
    return failure('not-found', 'The proxy has no database record for this key.', now, {
      ...extra,
      hint: 'The master key and keys defined only in config.yaml have no virtual-key data. Use a key made with /key/generate.',
    })
  }
  if (/database not connected|db not connected/i.test(message)) {
    return failure('db', 'The proxy has no database, so virtual keys are not tracked.', now, {
      ...extra,
      hint: 'Set DATABASE_URL on the LiteLLM proxy.',
    })
  }
  if (status === 429) {
    return failure('rate-limit', `The proxy is rate limiting this key (429): ${message}`, now, extra)
  }

  return failure('http', `The proxy answered ${status}: ${message}`, now, extra)
}

const NETWORK_ERRORS: readonly [RegExp, string][] = [
  [/ECONNREFUSED/i, 'connection refused'],
  [/ENOTFOUND|EAI_AGAIN/i, 'host not found'],
  [/ECONNRESET|socket hang up/i, 'connection reset'],
  [/CERT|SSL|TLS/i, 'TLS certificate problem'],
]

export const describeError = (error: unknown, key: string): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const bare = raw
    .replace(/^[\w-]+: \$\.http\.fetch\([^)]*\) (?:failed|aborted): /, '')
    .replace(/^(\w+): \1\b/, '$1')
  const known = NETWORK_ERRORS.find(([pattern]) => pattern.test(bare))

  return known ? known[1] : truncate(redact(bare, [key]), 160)
}
