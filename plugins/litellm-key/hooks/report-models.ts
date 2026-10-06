import type { ModelBudget, Snapshot, SortName } from '../types'
import { modelsText } from './facts'
import { money, plural, truncate } from './format'
import { byName, usageOver } from './history'

export type ModelRow = {
  model: string
  spend: number
  requests: number
  tokens: number
  /** Share of the range's spend, 0 to 1; null while nothing was spent in it. */
  share: number | null
  /** A cap for this model on the key, when it has one. */
  budget: ModelBudget | null
}

export type ModelList = {
  rows: ModelRow[]
  /** How many models there are before the filter is applied. */
  total: number
  /** The key may call every model the proxy serves, and the proxy did not list them. */
  isOpen: boolean
  /** Whether the usage history says anything about the models. */
  hasUsage: boolean
}

/** The models of the key and the ones it used, with what each spent over the last `range` days. */
export const modelList = (snapshot: Snapshot, range: number, sort: SortName, filter: string): ModelList => {
  const listed = snapshot.models ?? snapshot.key.models.filter(name => name !== 'all-proxy-models')
  const isOpen = snapshot.key.models.length === 0 || snapshot.key.models.includes('all-proxy-models')
  const totals = snapshot.usage ? usageOver(snapshot.usage, range) : null
  const used = new Map((totals?.models ?? []).map(item => [item.model, item]))
  const caps = new Map(snapshot.key.modelBudgets.map(item => [item.model, item]))
  const names = [...new Set([...listed, ...used.keys()])]
  const spent = totals?.spend ?? 0
  const needle = filter.trim().toLowerCase()
  const rows = names
    .filter(name => needle === '' || name.toLowerCase().includes(needle))
    .map(name => {
      const own = used.get(name)

      return {
        model: name,
        spend: own?.spend ?? 0,
        requests: own?.requests ?? 0,
        tokens: own?.tokens ?? 0,
        share: spent > 0 && own ? own.spend / spent : spent > 0 ? 0 : null,
        budget: caps.get(name) ?? null,
      }
    })
    .sort((a, b) => (sort === 'name' ? byName(a.model, b.model) : b.spend - a.spend || byName(a.model, b.model)))

  return { rows, total: names.length, isOpen, hasUsage: totals !== null }
}

/** The model list as text, with what each spent over the range. */
export const modelsReport = (snapshot: Snapshot, range: number): string => {
  const list = modelList(snapshot, range, 'spend', '')

  if (list.rows.length === 0) {
    return `Models: ${modelsText(snapshot)}`
  }
  const width = Math.min(34, Math.max(...list.rows.map(row => row.model.length)))

  return [
    `Models (${list.rows.length}) · spend over the last ${range} days`,
    ...list.rows.map(row => {
      const cap =
        row.budget !== null && row.budget.limit !== null
          ? ` · cap ${money(row.budget.limit)}${row.budget.period ? ` per ${row.budget.period}` : ''}`
          : ''
      const used =
        row.spend > 0 || row.requests > 0 ? `${money(row.spend).padStart(10)}  ${plural(row.requests, 'request')}` : '—'.padStart(10)

      return `${truncate(row.model, width).padEnd(width)}  ${used}${cap}`
    }),
  ].join('\n')
}
