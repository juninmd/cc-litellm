export type Parsed = {
  positional: string[]
  flags: Record<string, string | true>
  errors: string[]
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string }

const SHORT: Record<string, string> = { y: 'yes', n: 'dry-run' }

/** Splits on whitespace; "double" and 'single' quotes keep a value together (no escapes). */
export const tokenize = (input: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  let isOpen = false

  for (const char of input) {
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      quote = char
      isOpen = true
    } else if (/\s/.test(char)) {
      if (current !== '' || isOpen) {
        tokens.push(current)
      }
      current = ''
      isOpen = false
    } else {
      current += char
      isOpen = true
    }
  }
  if (current !== '' || isOpen) {
    tokens.push(current)
  }

  return tokens
}

const isFlag = (token: string): boolean => /^--[a-z][\w-]*(=|$)/i.test(token) || /^-[a-z]$/i.test(token)

/** `--name value`, `--name=value`, `-y`. Names in `booleans` never take a value. */
export const parseArgs = (input: string, booleans: ReadonlySet<string>): Parsed => {
  const tokens = tokenize(input)
  const parsed: Parsed = { positional: [], flags: {}, errors: [] }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''

    if (!isFlag(token)) {
      parsed.positional.push(token)
      continue
    }
    const body = token.startsWith('--') ? token.slice(2) : (SHORT[token.slice(1).toLowerCase()] ?? token.slice(1))
    const equals = body.indexOf('=')
    const name = (equals === -1 ? body : body.slice(0, equals)).toLowerCase()

    if (booleans.has(name)) {
      if (equals === -1) {
        parsed.flags[name] = true
      } else {
        // --yes=false must never read as yes
        parsed.errors.push(`--${name} takes no value: add the switch or leave it out.`)
      }
    } else if (equals !== -1) {
      parsed.flags[name] = body.slice(equals + 1)
    } else if (index + 1 < tokens.length) {
      index += 1
      parsed.flags[name] = tokens[index] ?? ''
    } else {
      parsed.errors.push(`--${name} needs a value`)
    }
  }

  return parsed
}

/** Dollars: `10`, `10.5`, `$10`; positive, at most 4 decimals, below a billion. */
export const parseMoney = (value: unknown, label: string): Outcome<number> => {
  const text = typeof value === 'string' ? value.trim().replace(/^\$/, '') : ''

  if (!/^\d+(\.\d{1,4})?$/.test(text)) {
    return { ok: false, message: `${label} must be a positive dollar amount such as 10 or 2.50 (got "${String(value)}").` }
  }
  const amount = Number(text)

  if (!(amount > 0) || amount >= 1e9) {
    return { ok: false, message: `${label} must be above $0 and below $1,000,000,000.` }
  }

  return { ok: true, value: amount }
}

/** A LiteLLM duration: a count and one unit (s, m, h, d, w, mo). */
export const parseDuration = (value: unknown, label: string): Outcome<string> => {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''

  return /^[1-9]\d{0,5}(mo|s|m|h|d|w)$/.test(text)
    ? { ok: true, value: text }
    : { ok: false, message: `${label} must be a count and a unit (s, m, h, d, w, mo), such as 30d or 12h (got "${String(value)}").` }
}

export const parseCount = (value: unknown, label: string): Outcome<number> => {
  const text = typeof value === 'string' ? value.trim() : ''

  return /^[1-9]\d{0,8}$/.test(text)
    ? { ok: true, value: Number(text) }
    : { ok: false, message: `${label} must be a whole number above 0 (got "${String(value)}").` }
}
