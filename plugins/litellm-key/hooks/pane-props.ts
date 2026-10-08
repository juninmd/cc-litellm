import type { UiPressArgument } from 'claude-code'

import type { Failure, MetricName, PingState, Snapshot, SortName, ViewName } from '../types'
import type { Placement } from './layout'

export type DashboardProps = {
  snapshot: Snapshot | null
  failure: Failure | null
  isLoading: boolean
  now: number
  columns: number
  placement: Placement
  /** The surface draws a text field. The mobile app does not yet, and its table only holds a stand-in that draws nothing. */
  hasField: boolean
  /** The person asked for the compact layout (the `compact_pane` option); off, the pane keeps the stacked one. */
  isCompact: boolean
  /** Whether the usage history is read at all (the `show_usage` option). */
  isUsageShown: boolean
  warnPercent: number
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
  /** The last round of the Ping tab, null before the first. */
  ping: PingState | null
  onRefresh: () => void
  /** Asks every endpoint once and times each. */
  onPing: () => void
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
