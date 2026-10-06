import type { MetricName, SortName } from '../types'
import { METRICS, RANGES } from './history'
import { isObject } from './json'

/** What the person chose in the pane, and keeps for next time. */
export type Prefs = { range: number; sort: SortName; metric: MetricName }

/** What was kept, as far as it still makes sense: a choice the pane no longer offers is dropped, not trusted. */
export const parsePrefs = (stored: unknown): Partial<Prefs> => {
  if (!isObject(stored)) {
    return {}
  }
  const { range, sort } = stored
  const metric = METRICS.find(item => item === stored.metric)

  return {
    ...(typeof range === 'number' && RANGES.includes(range) ? { range } : {}),
    ...(sort === 'spend' || sort === 'name' ? { sort } : {}),
    ...(metric === undefined ? {} : { metric }),
  }
}
