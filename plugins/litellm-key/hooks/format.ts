const BLOCKS = '▁▂▃▄▅▆▇█'
const RISERS = ' ▁▂▃▄▅▆▇█'
const EIGHTHS = ' ▏▎▍▌▋▊▉█'
const DAY_MS = 86_400_000

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const trim = (n: number): string =>
  (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '')

export const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  if (abs === 0) {
    return '$0.00'
  }
  if (abs < 0.0001) {
    return `${sign}<$0.0001`
  }
  if (abs < 0.01) {
    return `${sign}$${abs.toFixed(4)}`
  }
  const [whole = '0', cents = '00'] = abs.toFixed(2).split('.')

  return `${sign}$${group(whole)}.${cents}`
}

/** A whole count with thousands grouped: 12,345. */
export const count = (value: number): string => {
  const rounded = Math.round(value)

  return `${rounded < 0 ? '-' : ''}${group(String(Math.abs(rounded)))}`
}

/** How many times one amount is another, to a tenth under ten: "0.4×", "4.7×", "12×". */
export const times = (ratio: number): string => {
  if (!Number.isFinite(ratio)) {
    return '—'
  }

  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1).replace(/\.0$/, '')}×`
}

export type Change = { pct: number; direction: 'up' | 'down' | 'flat' }

/** How far `current` moved from `previous`, in whole percent; null when there is nothing to compare with. */
export const change = (current: number, previous: number): Change | null => {
  if (!(previous > 0) || !Number.isFinite(current)) {
    return null
  }
  const pct = Math.round(((current - previous) / previous) * 100)

  return { pct: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

/** A money amount in about six cells, for chart axes and narrow columns: $0, $0.42, $12.3, $412, $1.2k. */
export const shortMoney = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '—'
  }
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  if (abs === 0) {
    return '$0'
  }
  if (abs >= 1e6) {
    return `${sign}$${trim(abs / 1e6)}M`
  }
  if (abs >= 1e3) {
    return `${sign}$${trim(abs / 1e3)}k`
  }
  if (abs >= 100) {
    return `${sign}$${abs.toFixed(0)}`
  }
  if (abs >= 10) {
    return `${sign}$${abs.toFixed(1).replace(/\.0$/, '')}`
  }

  return abs >= 0.01 ? `${sign}$${abs.toFixed(2)}` : `${sign}<$0.01`
}

export const compact = (value: number): string => {
  const abs = Math.abs(value)

  if (abs >= 1e9) {
    return `${trim(value / 1e9)}B`
  }
  if (abs >= 1e6) {
    return `${trim(value / 1e6)}M`
  }
  if (abs >= 1e3) {
    return `${trim(value / 1e3)}k`
  }

  return String(Math.round(value))
}

export const percent = (used: number, limit: number | null): number | null =>
  limit === null || !(limit > 0) ? null : Math.round((used / limit) * 100)

/** The share of a cap that is used, null with no cap; a cap of $0 is used up from the first cent, as the banner reads it. */
export const usedShare = (used: number, limit: number | null): number | null =>
  limit === null ? null : (percent(used, limit) ?? 100)

/** A bar in eighths of a cell: `full` is the filled part, `track` the rest, so each can take its own color. */
export const gauge = (fraction: number, width: number): { full: string; track: string } => {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const eighths = Math.round(clamped * width * 8)
  const whole = Math.floor(eighths / 8)
  const part = eighths % 8
  const full = '█'.repeat(whole) + (part > 0 ? EIGHTHS.charAt(part) : '')

  return { full, track: '░'.repeat(width - whole - (part > 0 ? 1 : 0)) }
}

/** A slim bar in whole cells, low in the cell, so rows stacked on each other stay apart. Any share above zero gets a cell. */
export const rule = (fraction: number, width: number): { full: string; track: string } => {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const cells = clamped > 0 ? Math.min(width, Math.max(1, Math.round(clamped * width))) : 0

  return { full: '▄'.repeat(cells), track: '▁'.repeat(width - cells) }
}

/** One block per value, scaled to the biggest; a day with nothing is a dot, so "none" never looks like "a little". */
/**
 * Vertical bars, one per value, scaled to the biggest, as `height` rows of text from the top down. Each bar is
 * `barWidth` cells wide with `gap` blank cells between them. Any value above zero shows at least one eighth of a row.
 */
export const columnChart = (values: readonly number[], height: number, barWidth: number, gap = 1): string[] => {
  const most = Math.max(0, ...values)
  const rows: string[] = []

  for (let row = height - 1; row >= 0; row -= 1) {
    rows.push(
      values
        .map(value => {
          const eighths = !(value > 0) || most <= 0 ? 0 : Math.max(1, Math.round((value / most) * height * 8))

          return RISERS.charAt(Math.min(8, Math.max(0, eighths - row * 8))).repeat(barWidth)
        })
        .join(' '.repeat(gap)),
    )
  }

  return rows
}

export const sparkline = (values: readonly number[]): string => {
  const max = Math.max(0, ...values)

  return values
    .map(value => (value <= 0 ? '·' : BLOCKS.charAt(Math.min(7, Math.max(0, Math.round((value / max) * 7))))))
    .join('')
}

export const span = (ms: number): string => {
  const abs = Math.abs(ms)

  if (abs < 60_000) {
    return `${Math.floor(abs / 1000)}s`
  }
  const minutes = Math.round(abs / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  }
  const days = Math.floor(hours / 24)

  return days >= 10 || hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
}

export const until = (target: number | null, now: number): string | null => {
  if (target === null) {
    return null
  }

  return target >= now ? `in ${span(target - now)}` : `${span(now - target)} ago`
}

/** How long ago, as a status wants it: "just now" under five seconds. */
export const ago = (at: number, now: number): string => (now - at < 5000 ? 'just now' : `${span(now - at)} ago`)

export const clock = (ms: number): string => {
  const date = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')

  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

export const utcDay = (now: number, back: number): string =>
  new Date(now - back * DAY_MS).toISOString().slice(0, 10)

export const maskKey = (key: string): string => {
  const trimmed = key.trim()

  if (trimmed.length <= 8) {
    return '••••'
  }

  return `${trimmed.startsWith('sk-') ? 'sk-' : ''}…${trimmed.slice(-4)}`
}

// The engine refuses a text child that holds a control character, and a pane it cannot draw is closed.
const ESCAPE_SEQUENCES = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?)/g
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g

/** The text without its terminal escape sequences and other control characters, which are never drawn. */
export const clean = (text: string): string => text.replace(ESCAPE_SEQUENCES, '').replace(CONTROLS, '')

/**
 * The url with any `user:password@` taken out: the root is shown and linked, so it must never carry credentials. The
 * userinfo runs to the last `@` before the path, as a password may hold one.
 */
export const withoutCredentials = (url: string): string => url.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/\s]*@/i, '$1')

export const redact = (text: string, secrets: readonly string[] = []): string => {
  let masked = clean(text)

  for (const secret of secrets) {
    if (secret.length >= 6) {
      masked = masked.split(secret).join(maskKey(secret))
    }
  }

  return (
    masked
      .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^/\s]*@/gi, '$1')
      .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-…')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer …')
      // The sha256 of a key is the name the proxy knows it by, and a 401 says it ("Key Hash (Token) =…"): kept out too,
      // whole or cut short in the url of a request that an error names.
      .replace(/\b(api_key=)[^&\s"']+/gi, '$1…')
      .replace(/\b[0-9a-f]{64}\b/gi, '…')
  )
}

export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`

/** Cuts from the middle, so names that differ at the end (claude-sonnet-4-5, claude-sonnet-4-6) stay apart. */
export const truncateMiddle = (text: string, max: number): string => {
  if (text.length <= max) {
    return text
  }
  if (max <= 1) {
    return max === 1 ? '…' : ''
  }
  const room = max - 1
  const head = Math.ceil(room / 2)
  const tail = room - head

  return `${text.slice(0, head)}…${tail > 0 ? text.slice(-tail) : ''}`
}

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`
