import type { Elements, RenderElement, UiPressArgument } from 'claude-code'

import type { Failure, MetricName, Session, Snapshot, SortName, ViewName } from '../types'
import { gauge, percent, share, truncate } from './format'
import type { Row, Tone } from './summary'
import { RANGES, nextRange } from './usage'

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link' | 'Code'> & {
  /** Every surface's table has one, but only some draw it (see `hasField`). */
  Input?: Elements['terminal']['Input']
}

export type Placement = 'dock' | 'inline'

export type DashboardProps = {
  snapshot: Snapshot | null
  failure: Failure | null
  isLoading: boolean
  now: number
  columns: number
  placement: Placement
  /** The pane holds the keyboard, so its hotkeys work. */
  isFocused: boolean
  /** The surface draws a text field. The mobile app does not yet, and its table only holds a stand-in that draws nothing. */
  hasField: boolean
  /** The surface is a terminal, the one place where keys and focus work as the footer says. */
  isTerminal: boolean
  /** The person asked for the compact layout (the `compact_pane` option); off, the pane keeps the stacked one. */
  isCompact: boolean
  /** Whether the pace and the forecast are drawn (the `show_forecast` option). */
  isForecast: boolean
  /** Whether the usage history is read at all (the `show_usage` option). */
  isUsageShown: boolean
  warnPercent: number
  /** What today may spend before it is flagged (the `daily_alert` option); zero leaves it out. */
  dailyAlert: number
  refreshSeconds: number
  tab: ViewName
  /** Days of usage the Usage and Models tabs show: 7, 14 or 30. */
  range: number
  sort: SortName
  /** What the chart of the Usage tab counts per day. */
  metric: MetricName
  filter: string
  /** The day picked under the chart, as `YYYY-MM-DD`. */
  day: string | null
  session: Session | null
  onRefresh: () => void
  onClose: () => void
  /** Puts text on the clipboard of the surface the press came from, and says what it was ("the summary"). */
  onCopy: (text: string, what: string, press: UiPressArgument) => void
  onTab: (tab: ViewName) => void
  onRange: (range: number) => void
  onSort: (sort: SortName) => void
  onMetric: (metric: MetricName) => void
  onFilter: (text: string) => void
  onDay: (date: string) => void
  /** Moves the keyboard to the filter field. */
  onFocusFilter: () => void
}

export type Layout = {
  /** Cells across the body. */
  columns: number
  /** Wide enough for the meters to sit in a table, one line each. */
  isWide: boolean
  /** The compact layout is in force: one line a meter, no blank rows. */
  isCompact: boolean
  /** Blank rows between the blocks of a tab: none when compact. */
  gap: number
}

// Body columns from which the meters sit in a table, one line each.
export const WIDE = 118
// Fewest body columns the compact layout serves: a meter needs its label, its bar and the amounts on one line.
export const COMPACT_MIN = 70

type Tint = { color?: string; dimColor?: boolean }

/**
 * How the pane lays itself out. The compact layout serves only inline above the prompt, where rows are scarce and the
 * table has no room (below WIDE); narrower than COMPACT_MIN a meter's text would not fit beside its bar, so the stacked
 * layout, with the text on a line of its own, serves better there.
 */
export const layoutOf = (props: Pick<DashboardProps, 'columns' | 'placement' | 'isCompact'>): Layout => {
  const isCompact =
    props.isCompact && props.placement === 'inline' && props.columns >= COMPACT_MIN && props.columns < WIDE

  return { columns: props.columns, isWide: props.columns >= WIDE, isCompact, gap: isCompact ? 0 : 1 }
}

export const tint = (tone: Tone): Tint =>
  tone === 'warn' ? { color: 'warning' } : tone === 'error' ? { color: 'error' } : {}

export const barTint = (tone: Tone): Tint => (tone === 'ok' ? { color: 'success' } : tint(tone))

/** A mark that says the tone without color: a dot, a triangle, a cross. */
export const glyph = (tone: Tone): string => (tone === 'error' ? '✗' : tone === 'warn' ? '▲' : '●')

export const heading = ({ Box, Text }: Ui, label: string, columns: number): RenderElement => (
  <Box>
    <Text bold>{label}</Text>
    <Text dimColor wrap="truncate-end">{` ${'─'.repeat(Math.max(0, columns - label.length - 1))}`}</Text>
  </Box>
)

/**
 * The filled part of a bar in the color of its tone (or `accent`, for a bar that is no verdict), the empty track muted,
 * and the percentage; "no cap" without one.
 */
export const gaugeText = (
  { Text }: Ui,
  tone: Tone,
  used: number,
  limit: number | null,
  width: number,
  accent?: string,
): RenderElement => {
  const pct = percent(used, limit)

  if (pct === null || limit === null) {
    return <Text dimColor>no cap</Text>
  }
  const { filled, empty } = gauge(share(used, limit), width)

  return (
    <Text {...(accent === undefined ? barTint(tone) : { color: accent })}>
      {filled}
      <Text color="inactive">{empty}</Text> {pct}%
    </Text>
  )
}

/** The cells a gauge takes, percentage included, and what the arrow of `gaugeArrow` adds beside it. */
export const GAUGE_EXTRA = 6
export const ARROW_WIDTH = 7

/** Where a budget is heading, after its percentage: `→ 119%`. Only for one that will pass its cap before it resets. */
export const gaugeArrow = ({ Text }: Ui, projectedPct: number | null): RenderElement | null =>
  projectedPct !== null && projectedPct >= 100 ? <Text {...tint('warn')}> → {projectedPct}%</Text> : null

/** A share of a whole as a bar and a percentage, in one accent color. */
export const shareText = ({ Text }: Ui, share: number | null, width: number): RenderElement => {
  if (share === null) {
    return <Text dimColor>—</Text>
  }
  const { filled, empty } = gauge(share, width)

  return (
    <Text color="suggestion">
      {filled}
      <Text color="inactive">{empty}</Text> {String(Math.round(share * 100)).padStart(3)}%
    </Text>
  )
}

/** Labeled rows in two columns: the label, then what it says in the color of its tone. */
export const factRows = ({ Box, Text }: Ui, rows: readonly Row[], labelWidth: number): RenderElement[] =>
  rows.map(row => (
    <Box>
      <Box width={labelWidth + 2} flexShrink={0}>
        <Text bold>{truncate(row.label, labelWidth)}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text {...tint(row.tone)}>{row.text}</Text>
      </Box>
    </Box>
  ))

export const noteLines = ({ Text }: Ui, notes: readonly string[]): RenderElement[] =>
  notes.map(note => <Text dimColor>· {note}</Text>)

/** 7d, 14d and 30d side by side: the current one marked, the others a click away, and `d` steps to the next. */
export const rangeSelector = ({ Box, Text, Button }: Ui, props: DashboardProps): RenderElement => {
  const next = nextRange(props.range)

  return (
    <Box gap={2}>
      {RANGES.map(range =>
        range === props.range ? (
          <Text inverse bold>{` ${range}d `}</Text>
        ) : (
          <Button
            key={`range-${range}`}
            label={`${range}d`}
            plain
            {...(range === next ? { hotkey: 'd' } : {})}
            onPress={() => {
              props.onRange(range)
            }}
          />
        ),
      )}
    </Box>
  )
}
