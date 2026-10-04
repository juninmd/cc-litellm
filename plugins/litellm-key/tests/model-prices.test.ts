import { describe, expect, test } from 'claude-code/testing'

import { fetchSnapshot } from '../hooks/litellm'
import { parseModelPrices } from '../hooks/parsers'
import { modelsTable } from '../hooks/prices'
import { request } from './factories'
import { reply, router, snapshotOf, standardRoutes } from './support'

// /model_group/info lists every model group of the proxy, whatever the key may call (checked on LiteLLM v1.99.1).
const groups = {
  data: [
    { model_group: 'claude-sonnet-4-5', input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5, max_input_tokens: 200000 },
    { model_group: 'claude-opus-4-1', input_cost_per_token: 1.5e-5, output_cost_per_token: 7.5e-5, max_input_tokens: 200000 },
    { model_group: 'claude-haiku-4-5', input_cost_per_token: 1e-6, output_cost_per_token: null, max_input_tokens: null },
    { model_group: 'secret-internal', input_cost_per_token: 1, output_cost_per_token: 1, max_input_tokens: 1 },
  ],
}

describe('parseModelPrices', () => {
  test('turns dollars per token into dollars per million, without float noise', () => {
    const prices = parseModelPrices(groups, null)

    expect(prices?.['claude-sonnet-4-5']).toEqual({ input: 3, output: 15, context: 200000 })
    expect(prices?.['claude-opus-4-1']).toEqual({ input: 15, output: 75, context: 200000 })
    expect(parseModelPrices({ data: [{ model_group: 'm', input_cost_per_token: 0.001 }] }, null)?.m?.input).toBe(1000)
  })

  test('keeps what the proxy does not say as null, and drops models the key may not call', () => {
    const prices = parseModelPrices(groups, ['claude-haiku-4-5', 'claude-opus-4-1'])

    expect(Object.keys(prices ?? {}).sort()).toEqual(['claude-haiku-4-5', 'claude-opus-4-1'])
    expect(prices?.['claude-haiku-4-5']).toEqual({ input: 1, output: null, context: null })
  })

  test('is null for an answer that is not a list of model groups', () => {
    expect(parseModelPrices('nope', null)).toBeNull()
    expect(parseModelPrices({}, null)).toBeNull()
  })
})

describe('prices in the snapshot', () => {
  test('cover the models the key may call, not the whole proxy', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/model_group/info': reply(200, groups) })

    expect(Object.keys(snapshot.prices ?? {}).sort()).toEqual(['claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'])
    expect(snapshot.notes).toEqual([])
  })

  test('are quietly missing on a proxy without the endpoint, and kept between slow refreshes', async () => {
    expect((await snapshotOf()).prices).toBeNull()
    const first = await fetchSnapshot(request(router({ ...standardRoutes(), '/model_group/info': reply(200, groups) }).http))
    const next = router({ ...standardRoutes(), '/model_group/info': reply(500, 'boom') })
    const again = await fetchSnapshot(request(next.http, { refreshSlow: false, previous: first.ok ? first.snapshot : null }))

    expect(next.calls.some(call => call.url.includes('/model_group/info'))).toBe(false)
    expect(again.ok && again.snapshot.prices).toEqual(first.ok ? first.snapshot.prices : null)
  })

  test('a refused endpoint is a note, not an error', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/model_group/info': reply(403, { error: { message: 'no' } }) })

    expect(snapshot.prices).toBeNull()
    expect(snapshot.notes.join(' ')).toContain('model prices unavailable')
  })
})

describe('modelsTable', () => {
  test('puts price in and out and the context window on one line per model', async () => {
    const snapshot = await snapshotOf({ ...standardRoutes(), '/model_group/info': reply(200, groups) })
    const lines = modelsTable(snapshot, snapshot.models ?? []).split('\n')

    expect(lines[0]).toBe('Models (3) · dollars per million tokens, in / out')
    expect(lines.find(line => line.includes('claude-opus-4-1'))).toMatch(/\$15\.00 \/ \$75\.00\s+200k context/)
    expect(lines.find(line => line.includes('claude-haiku-4-5'))?.trimEnd()).toMatch(/\$1\.00 \/ —$/)
  })

  test('keeps the decimals of a cheap model and never cuts a model name', async () => {
    const base = await snapshotOf()
    const long = 'bedrock/us.anthropic.claude-3-5-sonnet-20241022-v2:0'
    const prices = { 'flash-lite': { input: 0.075, output: 0.3, context: 1_000_000 }, [long]: { input: 3, output: 15, context: 200_000 } }
    const lines = modelsTable({ ...base, prices }, ['flash-lite', long]).split('\n')

    expect(lines.find(line => line.includes('flash-lite'))).toMatch(/\$0\.075 \/ \$0\.30\s+1M context/)
    expect(lines.find(line => line.includes(long))).toMatch(/\$3\.00 \/ \$15\.00\s+200k context/)
  })

  test('falls back to the plain list when no price is known', async () => {
    const snapshot = await snapshotOf()

    expect(modelsTable(snapshot, snapshot.models ?? [])).toBe('Models (3): claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5')
  })
})
