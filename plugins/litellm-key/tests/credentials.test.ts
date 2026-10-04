import { describe, expect, test } from 'claude-code/testing'
import { candidateRoots, resolveCredentials } from '../hooks/credentials'
import { credentials, sources } from './factories'
import { BASE, KEY, NOW } from './support'

describe('resolveCredentials', () => {
  test('uses what Claude Code uses', () => {
    const resolved = resolveCredentials(sources(), NOW)

    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.credentials.key).toBe(KEY)
      expect(resolved.credentials.host).toBe('litellm.test')
      expect(resolved.credentials.keySource).toBe('ANTHROPIC_AUTH_TOKEN')
      expect(resolved.credentials.headers.authorization).toBe(`Bearer ${KEY}`)
    }
  })

  test('falls back to ANTHROPIC_API_KEY and then LITELLM_PROXY_API_KEY', () => {
    const apiKey = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_API_KEY: 'sk-from-api-key' } }), NOW)
    const proxy = resolveCredentials(
      sources({ env: { LITELLM_PROXY_API_BASE: BASE, LITELLM_PROXY_API_KEY: 'sk-from-proxy-var' } }),
      NOW,
    )

    expect(apiKey.ok && apiKey.credentials.keySource).toBe('ANTHROPIC_API_KEY')
    expect(proxy.ok && proxy.credentials.keySource).toBe('LITELLM_PROXY_API_KEY')
  })

  test('reads the settings.json env block when the process has nothing', () => {
    const resolved = resolveCredentials(
      sources({ env: {}, settingsEnv: { ANTHROPIC_BASE_URL: BASE, ANTHROPIC_AUTH_TOKEN: 'sk-from-settings' } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.key).toBe('sk-from-settings')
  })

  test('plugin options win over the environment', () => {
    const resolved = resolveCredentials(
      sources({ url: 'https://other.test/', key: 'sk-from-option' }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.host).toBe('other.test')
    expect(resolved.ok && resolved.credentials.key).toBe('sk-from-option')
    expect(resolved.ok && resolved.credentials.keySource).toBe('plugin option litellm_key')
    expect(resolved.ok && resolved.credentials.roots).toEqual(['https://other.test'])
    expect(resolved.ok && resolved.credentials.headers.authorization).toBe('Bearer sk-from-option')
  })

  test('takes the key from the x-litellm-api-key custom header and sends it there', () => {
    const resolved = resolveCredentials(
      sources({
        env: {
          ANTHROPIC_BASE_URL: `${BASE}/anthropic`,
          ANTHROPIC_CUSTOM_HEADERS: 'x-other: 1\nx-litellm-api-key: Bearer sk-custom-header-key',
        },
      }),
      NOW,
    )

    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.credentials.key).toBe('sk-custom-header-key')
      expect(resolved.credentials.headers['x-litellm-api-key']).toBe('Bearer sk-custom-header-key')
      expect(resolved.credentials.headers.authorization).toBeUndefined()
      expect(resolved.credentials.roots[0]).toBe(BASE)
    }
  })

  test('never sends the keys Claude Code uses to a different host than the one it uses them on', () => {
    const elsewhere = resolveCredentials(sources({ url: 'https://other.test' }), NOW)

    expect(elsewhere.ok).toBe(false)
    expect(!elsewhere.ok && elsewhere.failure.message).toContain('other.test')
    expect(JSON.stringify(elsewhere)).not.toContain(KEY)

    const same = resolveCredentials(sources({ url: `${BASE}/` }), NOW)

    expect(same.ok && same.credentials.key).toBe(KEY)
  })

  test('pairs LITELLM_PROXY_API_BASE only with LITELLM_PROXY_API_KEY, never with the Anthropic key', () => {
    const unpaired = resolveCredentials(
      sources({ env: { LITELLM_PROXY_API_BASE: BASE, ANTHROPIC_API_KEY: 'sk-ant-direct-key-1234' } }),
      NOW,
    )
    const paired = resolveCredentials(
      sources({
        env: { LITELLM_PROXY_API_BASE: BASE, ANTHROPIC_API_KEY: 'sk-ant-direct-key-1234', LITELLM_PROXY_API_KEY: 'sk-litellm-1234567' },
      }),
      NOW,
    )

    expect(unpaired.ok).toBe(false)
    expect(JSON.stringify(unpaired)).not.toContain('sk-ant-direct-key-1234')
    expect(paired.ok && paired.credentials.key).toBe('sk-litellm-1234567')
  })

  test('says what is missing', () => {
    const noUrl = resolveCredentials(sources({ env: { ANTHROPIC_AUTH_TOKEN: KEY } }), NOW)
    const noKey = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: BASE } }), NOW)
    const direct = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com/', ANTHROPIC_API_KEY: 'sk-ant-xyz123456' } }),
      NOW,
    )
    const bad = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: 'litellm.test', ANTHROPIC_AUTH_TOKEN: KEY } }), NOW)

    for (const resolved of [noUrl, noKey, direct, bad]) {
      expect(resolved.ok).toBe(false)
      expect(!resolved.ok && resolved.failure.kind).toBe('not-configured')
    }
    expect(!noKey.ok && noKey.failure.message).toContain('litellm.test')
  })

  test('does not show credentials that sit in the url', () => {
    const resolved = resolveCredentials(
      sources({ env: { ANTHROPIC_BASE_URL: 'https://user:hunter2@litellm.test:4000/', ANTHROPIC_AUTH_TOKEN: KEY } }),
      NOW,
    )

    expect(resolved.ok && resolved.credentials.host).toBe('litellm.test:4000')
  })

  test('never puts the key in a failure message', () => {
    const resolved = resolveCredentials(sources({ env: { ANTHROPIC_BASE_URL: `${KEY}-not-a-url` } }), NOW)

    expect(JSON.stringify(resolved)).not.toContain(KEY)
  })
})

describe('candidateRoots', () => {
  test('strips pass-through routes first', () => {
    expect(candidateRoots(`${BASE}/anthropic`, false)).toEqual([BASE, `${BASE}/anthropic`])
    expect(candidateRoots(`${BASE}/bedrock/v1`, false)).toEqual([BASE, `${BASE}/bedrock/v1`])
    expect(candidateRoots(BASE, false)).toEqual([BASE])
  })

  test('only looks for the pass-through route in the path, never in the host', () => {
    expect(candidateRoots('https://anthropic', false)).toEqual(['https://anthropic'])
    expect(candidateRoots(`${BASE}/litellm/anthropic/v1`, false)).toEqual([
      `${BASE}/litellm`,
      `${BASE}/litellm/anthropic/v1`,
      BASE,
    ])
  })

  test('tries the origin of a prefixed proxy last, and trusts an explicit url', () => {
    expect(candidateRoots(`${BASE}/litellm`, false)).toEqual([`${BASE}/litellm`, BASE])
    expect(candidateRoots(`${BASE}/anthropic`, true)).toEqual([`${BASE}/anthropic`])
  })
})
