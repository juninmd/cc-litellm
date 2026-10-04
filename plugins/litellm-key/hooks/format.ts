const BLOCKS = '▁▂▃▄▅▆▇█'
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

/** One block per value, scaled to the biggest; a day with nothing is a dot, so "none" never looks like "a little". */
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
