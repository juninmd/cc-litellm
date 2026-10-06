import type { ActivityDay, MetricName } from '../types'
import { shortDate, weekday } from './calendar'
import { columnChart, compact, shortMoney } from './format'
import { metricOf } from './history'

const MAX_SLOT = 10
const MAX_BAR = 6

/** An amount of what the chart counts, in a few cells: money for spend, a short count for requests and tokens. */
export const metricText = (value: number, metric: MetricName): string =>
  metric === 'spend' ? shortMoney(value) : compact(value)

export type DayLabel = { text: string; date: string; isToday: boolean }

/** A bar chart of spend per day, as text the view dresses in color: the bars, the axis ticks and the labels under them. */
export type Plot = {
  /** The bars, top row first. Each row is as wide as `width`, already centered in its slot. */
  bars: string[]
  /** Cells to the left of the bars, which hold the axis ticks. */
  gutter: number
  /** Cells the bars take, to the right of the gutter. */
  width: number
  /** What the top and the bottom of the axis stand for. */
  ticks: { top: string; bottom: string }
  /** Cells given to each day. */
  slot: number
  /** The weekday under each day, to be centered in its slot, when the slots are wide enough for the names. */
  days: DayLabel[] | null
  /** The spend of each day, to be centered in its slot, when the slots are wide enough for the amounts. */
  amounts: string[] | null
  /** The first and last day, a line under bars too close for a label each. */
  ends: string | null
}

/**
 * Lays out one bar per day in `columns` cells, `height` rows tall, counting `metric` (spend, unless told otherwise).
 * Null when the days are too many for the room, so the caller can fall back to a line.
 */
export const plot = (
  days: readonly ActivityDay[],
  columns: number,
  height: number,
  metric: MetricName = 'spend',
): Plot | null => {
  if (days.length === 0 || height < 1) {
    return null
  }
  const values = days.map(day => metricOf(day, metric))
  const most = Math.max(0, ...values)
  const zero = metricText(0, metric)
  const top = most > 0 ? metricText(most, metric) : zero
  const gutter = top.length + 1
  const slot = Math.min(MAX_SLOT, Math.floor((columns - gutter) / days.length))

  if (slot < 2) {
    return null
  }
  const barWidth = Math.min(MAX_BAR, slot - (slot <= 3 ? 1 : 2))
  const gap = slot - barWidth
  const lead = Math.floor(gap / 2)
  const width = days.length * slot
  const bars = columnChart(values, height, barWidth, gap).map(row => `${' '.repeat(lead)}${row}`.padEnd(width))
  const first = days[0]
  const last = days[days.length - 1]

  return {
    bars,
    gutter,
    width,
    ticks: { top, bottom: zero },
    slot,
    days:
      slot >= 4
        ? days.map((day, at) => ({ text: weekday(day.date), date: day.date, isToday: at === days.length - 1 }))
        : null,
    amounts: slot >= 6 ? values.map(value => (value > 0 ? metricText(value, metric) : '·')) : null,
    ends:
      slot < 4 && first && last
        ? `${shortDate(first.date)}${' '.repeat(Math.max(1, width - shortDate(first.date).length - shortDate(last.date).length))}${shortDate(last.date)}`
        : null,
  }
}
