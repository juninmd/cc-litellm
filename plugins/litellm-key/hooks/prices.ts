import type { Snapshot } from '../types'
import { compact } from './format'

// a name wider than this is never cut (it is what `key set --models` takes), it only breaks the alignment of its own row
const NAME_WIDTH = 40

/** Dollars per million tokens: $3.00, $0.075; money() would round the latter to cents. */
const dollars = (value: number): string => `$${value.toFixed(4).replace(/(\.\d\d\d*?)0*$/, '$1')}`

/** One line per model: what a million tokens cost in and out, and how much the model reads at once. */
export const modelsTable = (snapshot: Snapshot, names: readonly string[], title = `Models (${names.length})`): string => {
  const { prices } = snapshot
  const priced = names.filter(name => prices?.[name] !== undefined)
  const head = title

  if (!prices || priced.length === 0) {
    return `${head}: ${names.join(', ')}`
  }
  const cell = (value: number | null): string => (value === null ? '—' : dollars(value))
  const rows = names.map(name => {
    const price = prices[name]

    return [
      name,
      price ? `${cell(price.input)} / ${cell(price.output)}` : '',
      price?.context ? `${compact(price.context)} context` : '',
    ]
  })
  const widths = [0, 1].map(index => Math.max(...rows.map(row => Math.min(index === 0 ? NAME_WIDTH : Infinity, (row[index] ?? '').length))))

  return [
    `${head} · dollars per million tokens, in / out`,
    ...rows.map(row => `  ${(row[0] ?? '').padEnd(widths[0] ?? 0)}  ${(row[1] ?? '').padEnd(widths[1] ?? 0)}  ${row[2] ?? ''}`.trimEnd()),
  ].join('\n')
}
