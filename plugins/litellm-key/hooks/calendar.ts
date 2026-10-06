const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
