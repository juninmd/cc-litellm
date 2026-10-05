const BLOCKS = '▁▂▃▄▅▆▇█'
// Left-aligned partial cells of a horizontal bar, by eighths; index 0 is unused.
const PARTIALS = ' ▏▎▍▌▋▊▉'
// Bottom-aligned partial cells of a vertical bar, by eighths: 0 is blank, 8 is full.
const RISERS = ' ▁▂▃▄▅▆▇█'
const DAY_MS = 86_400_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

/** A horizontal bar in two parts, so the filled part and the empty track can take their own colors. */
export type Gauge = { filled: string; empty: string }

/**
 * `width` cells, filled to `fraction` in eighths of a cell. A little use still shows (one eighth) and a nearly full
 * bar never looks full: only a fraction of 1 or more fills the last cell.
 */
export const gauge = (fraction: number, width: number): Gauge => {
  const cells = Math.max(0, Math.floor(width))
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const most = cells * 8
  let eighths = Math.round(clamped * most)

  if (cells === 0) {
    return { filled: '', empty: '' }
  }
  if (clamped > 0 && eighths === 0) {
    eighths = 1
  }
  if (clamped < 1 && eighths === most && most > 0) {
    eighths = most - 1
  }
  const full = Math.floor(eighths / 8)
  const rest = eighths % 8

  return {
    filled: '█'.repeat(full) + (rest > 0 ? PARTIALS.charAt(rest) : ''),
    empty: '░'.repeat(cells - full - (rest > 0 ? 1 : 0)),
  }
}

export const bar = (fraction: number, width: number): string => {
  const { filled, empty } = gauge(fraction, width)

  return filled + empty
}

/** A small whole-cell meter for a line of text: `▰▰▰▱▱▱`. Same rules as `gauge`: a little shows, nearly full is not full. */
export const miniBar = (fraction: number, width: number): string => {
  const cells = Math.max(0, Math.floor(width))
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  let filled = Math.round(clamped * cells)

  if (!(cells > 0)) {
    return ''
  }
  if (clamped > 0 && filled === 0) {
    filled = 1
  }
  if (clamped < 1 && filled === cells) {
    filled = Math.max(0, cells - 1)
  }

  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

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

  if (max <= 0) {
    return BLOCKS.charAt(0).repeat(values.length)
  }

  return values
    .map(value => BLOCKS.charAt(Math.min(7, Math.max(0, Math.round((value / max) * 7)))))
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

export const clock = (ms: number): string => {
  const date = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')

  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

/** How long ago, as a status wants it: "just now" under five seconds. */
export const ago = (at: number, now: number): string => (now - at < 5000 ? 'just now' : `${span(now - at)} ago`)

export const utcDay = (now: number, back: number): string =>
  new Date(now - back * DAY_MS).toISOString().slice(0, 10)

const dayStart = (date: string): number | null => {
  const parsed = Date.parse(`${date}T00:00:00Z`)

  return Number.isNaN(parsed) ? null : parsed
}

/** "Tue" for a `YYYY-MM-DD` day (UTC, as the proxy counts days); empty when it is not a day. */
export const weekday = (date: string): string => {
  const start = dayStart(date)

  return start === null ? '' : (WEEKDAYS[new Date(start).getUTCDay()] ?? '')
}

/** "Oct 3" for a `YYYY-MM-DD` day. */
export const shortDate = (date: string): string => {
  const start = dayStart(date)

  if (start === null) {
    return date
  }
  const when = new Date(start)

  return `${MONTHS[when.getUTCMonth()] ?? ''} ${when.getUTCDate()}`
}

/** The `YYYY-MM-DD` day (UTC) a timestamp falls on. */
export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

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

export type Change = { pct: number; direction: 'up' | 'down' | 'flat' }

/** How far `current` moved from `previous`, in whole percent; null when there is nothing to compare with. */
export const change = (current: number, previous: number): Change | null => {
  if (!(previous > 0) || !Number.isFinite(current)) {
    return null
  }
  const pct = Math.round(((current - previous) / previous) * 100)

  return { pct: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

export const maskKey = (key: string): string => {
  const trimmed = key.trim()

  if (trimmed.length <= 8) {
    return '••••'
  }

  return `${trimmed.startsWith('sk-') ? 'sk-' : ''}…${trimmed.slice(-4)}`
}

export const redact = (text: string, secrets: readonly string[] = []): string => {
  let clean = text

  for (const secret of secrets) {
    if (secret.length >= 6) {
      clean = clean.split(secret).join(maskKey(secret))
    }
  }

  return clean
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-…')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer …')
}

export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`
