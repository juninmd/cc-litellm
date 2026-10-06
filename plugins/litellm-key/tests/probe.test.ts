import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import type { Probe } from '../hooks/probe'
import { pingReport, probeEndpoints } from '../hooks/probe'
import { credentials } from './factories'
import { HASH, KEY, NOW, reply, router, snapshotOf, standardRoutes } from './support'

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

describe('probeEndpoints', () => {
  const ask = async (routes = standardRoutes(), snapshot: Snapshot | null = null) => {
    const net = router(routes)
    const probes = await probeEndpoints({ credentials: credentials(), root: 'https://litellm.test', http: net.http, snapshot, now: NOW })

    return { probes, calls: net.calls }
  }

  test('asks only what a reading would: the key, the models, the prices and the health, until it knows the user and team', async () => {
    const { probes } = await ask()

    expect(probes.map(probe => probe.path)).toEqual(['/key/info', '/v1/models', '/model_group/info', '/health/readiness'])
  })

  test('asks about the user, the team and the usage once a reading has named them', async () => {
    const { probes, calls } = await ask(standardRoutes(), await snapshotOf())

    expect(probes.map(probe => probe.path)).toEqual(['/key/info', '/user/info', '/team/info', '/v1/models', '/model_group/info', '/user/daily/activity', '/health/readiness'])
    expect(calls.find(call => call.url.includes('/user/daily/activity'))?.url).toContain(`api_key=${HASH}`)
    expect(calls.every(call => call.headers.authorization === `Bearer ${KEY}`)).toBe(true)
  })

  test('says in a few words what each answered, and a hint where the endpoint is optional', async () => {
    const { probes } = await ask({ ...standardRoutes(), '/health/readiness': reply(404, { detail: 'Not Found' }) }, await snapshotOf())
    const by = Object.fromEntries(probes.map(probe => [probe.path, probe]))

    expect(by['/key/info']).toMatchObject({ status: 200, ok: true, detail: 'active' })
    expect(by['/v1/models']?.detail).toBe('3 models')
    expect(by['/user/daily/activity']?.detail).toBe('3 active days')
    expect(by['/user/info']?.detail).toBe('has a budget')
    expect(by['/model_group/info']).toMatchObject({ status: 404, ok: false })
    expect(by['/model_group/info']?.detail).toContain('the prices are optional')
    expect(by['/health/readiness']).toMatchObject({ status: 404, ok: false })
    expect(by['/health/readiness']?.detail).toContain('optional')
  })

  test('turns a connection that fails into a row, in plain words and without the key', async () => {
    const http = async (): Promise<never> => {
      throw new Error(`litellm-key: $.http.fetch(https://litellm.test/key/info) failed: ECONNREFUSED: Unable to connect with ${KEY}`)
    }
    const probes = await probeEndpoints({ credentials: credentials(), root: 'https://litellm.test', http, snapshot: null, now: NOW })

    expect(probes[0]).toEqual({ path: '/key/info', status: null, ms: null, ok: false, detail: 'connection refused' })
    expect(JSON.stringify(probes)).not.toContain(KEY)
  })

  test('takes the time from the answer, and none from a clock that did not move', async () => {
    const net = router(standardRoutes())
    const http = async (url: string, headers: Record<string, string>) => ({ ...(await net.http(url, headers)), ms: url.endsWith('/key/info') ? 142.4 : 0 })
    const probes = await probeEndpoints({ credentials: credentials(), root: 'https://litellm.test', http, snapshot: null, now: NOW })

    expect(probes[0]?.ms).toBe(142)
    expect(probes[1]?.ms).toBeNull()
  })

  test('never lets what the proxy said carry the key', async () => {
    const leaky = reply(401, { error: { message: `Invalid key ${KEY}, token ${HASH}`, type: 'auth_error', code: '401', param: 'None' } })
    const { probes } = await ask({ ...standardRoutes(), '/key/info': leaky })

    expect(JSON.stringify(probes)).not.toContain(KEY)
    expect(JSON.stringify(probes)).not.toContain(HASH)
  })
})
