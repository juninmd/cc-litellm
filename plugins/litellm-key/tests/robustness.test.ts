import { describe, expect, test } from 'claude-code/testing'

import { checkVerdict, compareReport, dayReport, jsonReport, paceReport } from '../hooks/reports'
import { alerts, details, facts, meters, modelList, statusText, summaryText, usageReport } from '../hooks/summary'
import { NOW, activity, keyBody, reply, snapshotOf, standardRoutes } from './support'

// A small deterministic generator, so that a failure can be replayed: the same rounds on every run.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296

  return seed / 4294967296
}

const pick = <T,>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)] as T

const NUMBERS: readonly unknown[] = [0, 0.001, 0.5, 1, 7.77, 50, 99.999, 100, 1234.5, 1e6, 1e12, -1, -50, null, 'x', '12.5', Number.MAX_SAFE_INTEGER]
const DURATIONS: readonly unknown[] = ['30d', '1h', '24h', '1w', '1mo', '45m', null, 'weird', '0d']
const OFFSETS_MS: readonly (number | null)[] = [-86_400_000, -1000, 0, 1000, 1_800_000, 3_599_999, 3_600_000, 7_200_000, 5 * 86_400_000, 29 * 86_400_000, 400 * 86_400_000, null]

const bad = (text: string): boolean => /NaN|undefined|Infinity|\[object/.test(text)

describe('reports on odd numbers', () => {
  test('none throws or says NaN, undefined or Infinity, whatever the key and the history hold', async () => {
    const next = rng(42)

    for (let round = 0; round < 250; round += 1) {
      const offset = pick(next, OFFSETS_MS)
      const spends = Array.from({ length: pick(next, [0, 1, 3, 14, 30, 30]) }, () => pick(next, [0, 0, 0.002, 1, 4.5, 99, 1e5]))
      const info = {
        spend: pick(next, NUMBERS),
        max_budget: pick(next, NUMBERS),
        budget_duration: pick(next, DURATIONS),
        budget_reset_at: offset === null ? null : new Date(NOW + offset).toISOString(),
        total_spend: pick(next, NUMBERS),
        expires: pick(next, [null, new Date(NOW + 86_400_000).toISOString(), new Date(NOW - 86_400_000).toISOString(), 'soon']),
        rpm_limit: pick(next, NUMBERS),
        user_id: pick(next, ['jane', null]),
      }
      const snapshot = await snapshotOf({
        ...standardRoutes(),
        '/key/info': reply(200, keyBody(info)),
        '/user/daily/activity': activity(spends),
      })
      const now = NOW + pick(next, [0, 60_000, 3_600_000, 86_400_000])
      const texts = [
        summaryText(snapshot, now, 80, { isForecast: true }),
        paceReport(snapshot, now),
        compareReport(snapshot, 7),
        compareReport(snapshot, 14),
        dayReport(snapshot, '2026-10-03'),
        dayReport(snapshot, '2026-10-02'),
        usageReport(snapshot, 30),
        checkVerdict(snapshot, null, now, 80, { dailyAlert: 1 }).text,
        statusText(snapshot, null, now, { bar: true, forecast: true, dailyAlert: 1 }) ?? '',
        jsonReport(snapshot, now, 80, { dailyAlert: 1 }),
        ...alerts(snapshot, now, 80, true, { dailyAlert: 1 }).map(item => item.text),
        ...facts(snapshot, now, { isForecast: true }).map(row => `${row.label} ${row.text}`),
        ...meters(snapshot, now, 80).map(item => item.text),
        ...details(snapshot, now, 60).flatMap(group => group.rows.map(row => `${row.label} ${row.text}`)),
        ...modelList(snapshot, 7, 'spend', '').rows.map(row => row.model),
      ]

      for (const text of texts) {
        expect(bad(text), `round ${round}: ${JSON.stringify(info)} offset ${offset} -> ${text}`).toBe(false)
      }
      expect(() => JSON.parse(jsonReport(snapshot, now, 80))).not.toThrow()
    }
  })
})
