import type { ModelPrice } from '../types'
import { compact } from './format'

/** How much of the model's window the conversation fills: what the last step read, plus what it wrote, and for which model. */
export type ContextUse = { used: number; model: string | null }

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)

/** From the usage a model step ends with: input, cached input and output all sit in the next step's window. */
export const contextOf = (usage: unknown): ContextUse | null => {
  if (typeof usage !== 'object' || usage === null) {
    return null
  }
  const u = usage as Record<string, unknown>
  const used = count(u.input_tokens) + count(u.cache_read_input_tokens) + count(u.cache_creation_input_tokens) + count(u.output_tokens)

  return used > 0 ? { used, model: typeof u.model === 'string' && u.model !== '' ? u.model : null } : null
}

const tail = (name: string): string => (name.split('/').pop() ?? name).toLowerCase()

/** The window of the model, from the prices the proxy gave: by its exact name, else by the name without its provider. */
export const windowOf = (model: string | null, prices: Record<string, ModelPrice> | null): number | null => {
  if (model === null || prices === null) {
    return null
  }
  const exact = prices[model]?.context
  const name = Object.keys(prices).find(key => tail(key) === tail(model))

  return exact ?? (name === undefined ? null : (prices[name]?.context ?? null))
}

/** `🧠 84k/200k 42%`, or `🧠 84k` when the window is not known. */
export const contextText = (use: ContextUse | null, prices: Record<string, ModelPrice> | null): string | undefined => {
  if (use === null) {
    return undefined
  }
  const max = windowOf(use.model, prices)

  return max === null || max <= 0 ? `🧠 ${compact(use.used)}` : `🧠 ${compact(use.used)}/${compact(max)} ${Math.round((use.used / max) * 100)}%`
}

/** For `/litellm debug`. */
export const contextLine = (use: ContextUse | null, prices: Record<string, ModelPrice> | null): string =>
  use === null ? 'none yet (needs a model step that reports its usage)' : `${contextText(use, prices)} · ${use.model ?? 'model unknown'}`
