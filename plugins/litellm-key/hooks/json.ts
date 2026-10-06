import { clean } from './format'

export type Json = Record<string, unknown>

export const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const num = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? clean(value) : ''

  return text.trim() !== '' ? text : null
}

export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(item => str(item) ?? []) : []

/** The same data with every text clean, whatever the proxy put in it: the engine refuses to draw a control character. */
export const scrub = <T>(value: T): T => {
  if (typeof value === 'string') {
    return clean(value) as T
  }
  if (Array.isArray(value)) {
    return value.map(scrub) as T
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [clean(name), scrub(item)])) as T
  }

  return value
}

export const date = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  let text = value.trim().replace(' ', 'T')

  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text)) {
    text += 'Z'
  }
  const parsed = Date.parse(text)

  return Number.isNaN(parsed) ? null : parsed
}

export const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
