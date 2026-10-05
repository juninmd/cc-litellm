import type { RenderElement } from 'claude-code'

import type { MetricName, Snapshot } from '../types'
import { plot } from './chart'
import { money, plural, sparkline, truncate } from './format'
import type { DashboardProps, Layout, Ui } from './parts'
import { factRows, heading, noteLines, rangeSelector, shareText } from './parts'
import { dayDetail, usageCsv, usageFacts } from './summary'
import type { Mover } from './usage'
import { COMPARABLE, metricOf, nextMetric, usageCompare, usageOver } from './usage'

const CHART_ROWS = 6
const COMPACT_CHART_ROWS = 4
// Models listed under the chart before the rest are left to the Models tab.
const TOP_MODELS = 6
// Body columns from which the heading of the models has room to say what the arrows measure.
const ARROWS_NOTE_MIN = 70

// What an arrow takes beside the amounts of a model: "▲ 250% " and a cell to spare.
const ARROW_ROOM = 8

/**
 * The cells of a row of the list of models: the name, the bar, and what the bar leaves for the amounts. The bar gives up
 * cells to the arrows only when there are some, so a list without them keeps the room it always had.
 */
export const modelColumns = (columns: number, longest: number, hasArrows: boolean) => {
  const nameWidth = Math.min(26, longest, Math.max(10, Math.floor(columns * 0.3)))
  const barWidth = Math.max(6, Math.min(24, columns - nameWidth - 2 - 7 - 22 - (hasArrows ? ARROW_ROOM : 0)))

  return { nameWidth, barWidth, textWidth: columns - (nameWidth + 2) - (barWidth + 7) }
}

const TITLES: Record<MetricName, string> = {
  spend: 'Spend per day',
  requests: 'Requests per day',
  tokens: 'Tokens per day',
}

/** What a model did against the days before, to sit after its spend: an arrow and a percentage, or "new". */
const moverText = (mover: Mover | undefined): string => {
  if (mover === undefined) {
    return ''
  }
  if (mover.isNew) {
    return ' new'
  }
  const moved = mover.change

  return moved === null || moved.direction === 'flat' ? '' : ` ${moved.direction === 'up' ? '▲' : '▼'} ${moved.pct}%`
}

/** Why there is no history to draw, in the words of the one thing that can be done about it. */
const noHistory = (snapshot: Snapshot, props: DashboardProps): string =>
  !props.isUsageShown
    ? 'Usage history is off. Turn show_usage on with: claude plugin configure litellm-key'
    : snapshot.key.userId === null
      ? 'This key has no user, and the proxy keeps daily activity per user.'
      : 'The proxy did not return usage history (/user/daily/activity is a beta endpoint).'

/** The bars with their axis, and under each a day to pick: the picked one marked, the others a click or Tab and Enter away. */
const bars = (
  { Box, Text, Button }: Ui,
  drawn: NonNullable<ReturnType<typeof plot>>,
  props: DashboardProps,
): RenderElement => (
  <Box flexDirection="column">
    {drawn.bars.map((row, at) => (
      <Box>
        <Box width={drawn.gutter} flexShrink={0}>
          <Text dimColor>
            {at === 0
              ? drawn.ticks.top.padStart(drawn.gutter - 1)
              : at === drawn.bars.length - 1
                ? drawn.ticks.bottom.padStart(drawn.gutter - 1)
                : ' '}
          </Text>
        </Box>
        <Text color="suggestion" wrap="truncate-end">
          {row}
        </Text>
      </Box>
    ))}
    {drawn.days && (
      <Box paddingLeft={drawn.gutter}>
        {drawn.days.map(label => (
          <Box width={drawn.slot} justifyContent="center">
            {label.date === props.day ? (
              <Text inverse bold>
                {label.text}
              </Text>
            ) : (
              <Button
                key={`day-${label.date}`}
                label={label.text}
                plain
                dimColor
                onPress={() => {
                  props.onDay(label.date)
                }}
              />
            )}
          </Box>
        ))}
      </Box>
    )}
    {drawn.amounts && (
      <Box paddingLeft={drawn.gutter}>
        {drawn.amounts.map(amount => (
          <Box width={drawn.slot} justifyContent="center">
            <Text dimColor>{amount}</Text>
          </Box>
        ))}
      </Box>
    )}
    {drawn.ends && (
      <Box paddingLeft={drawn.gutter}>
        <Text dimColor>{drawn.ends}</Text>
      </Box>
    )}
  </Box>
)

export const usageTab = (ui: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { Box, Text, Button } = ui
  const { columns, isCompact } = layout
  const { usage } = snapshot

  if (!usage) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{noHistory(snapshot, props)}</Text>
        {noteLines(ui, snapshot.notes)}
      </Box>
    )
  }
  const totals = usageOver(usage, props.range)
  const drawn = plot(totals.days, columns, isCompact ? COMPACT_CHART_ROWS : CHART_ROWS, props.metric)
  // Only a stretch the history can be set against the one before it says which models moved.
  const diff = COMPARABLE.includes(props.range) ? usageCompare(usage, props.range) : null
  const movers = new Map((diff?.movers ?? []).map(item => [item.model, item]))
  // A day picked while another range was showing may lie outside this one.
  const picked =
    props.day !== null && totals.days.some(item => item.date === props.day) ? dayDetail(snapshot, props.day) : null
  const rows = usageFacts(snapshot, props.range)
  const labelWidth = Math.max(8, ...rows.map(row => row.label.length))
  const longest = Math.max(1, ...totals.models.map(item => item.model.length))
  const { nameWidth, barWidth } = modelColumns(columns, longest, diff !== null)

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" flexWrap="wrap" columnGap={2}>
        <Text bold>
          {TITLES[props.metric]} <Text dimColor>(UTC)</Text>
        </Text>
        <Box gap={2}>
          {rangeSelector(ui, props)}
          <Button
            key="metric"
            label={`chart: ${props.metric}`}
            hotkey="m"
            plain
            onPress={() => {
              props.onMetric(nextMetric(props.metric))
            }}
          />
          <Button
            key="csv"
            label="CSV"
            hotkey="v"
            plain
            onPress={press => {
              props.onCopy(usageCsv(snapshot, props.range), `${props.range} days as CSV`, press)
            }}
          />
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={isCompact ? 0 : 1}>
        {drawn ? (
          bars(ui, drawn, props)
        ) : (
          <Text color="suggestion">{sparkline(totals.days.map(day => metricOf(day, props.metric)))}</Text>
        )}
      </Box>
      {drawn?.days && (
        <Box flexDirection="column" marginTop={isCompact ? 0 : 1}>
          {picked ? (
            <Box flexDirection="column">
              <Box gap={2}>
                <Text bold>{picked.title}</Text>
                <Text>{picked.summary}</Text>
              </Box>
              {picked.models.length > 0 && (
                <Text dimColor wrap="truncate-end">
                  {picked.models
                    .slice(0, 3)
                    .map(item => `${item.model} ${money(item.spend)} (${Math.round(item.share * 100)}%)`)
                    .join(' · ')}
                </Text>
              )}
            </Box>
          ) : (
            !isCompact && <Text dimColor>Pick a day under the chart for its details</Text>
          )}
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {factRows(ui, rows, labelWidth)}
      </Box>
      {totals.models.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {heading(
            ui,
            `By model, last ${props.range} days${diff !== null && columns >= ARROWS_NOTE_MIN ? ` · ▲▼ vs the ${props.range} before` : ''}`,
            columns,
          )}
          {totals.models.slice(0, TOP_MODELS).map(item => (
            <Box>
              <Box width={nameWidth + 2} flexShrink={0}>
                <Text>{truncate(item.model, nameWidth)}</Text>
              </Box>
              <Box width={barWidth + 7} flexShrink={0}>
                {shareText(ui, totals.spend > 0 ? item.spend / totals.spend : null, barWidth)}
              </Box>
              <Box flexShrink={1}>
                <Text dimColor wrap="truncate-end">
                  {`${money(item.spend)}${moverText(movers.get(item.model))} · ${plural(item.requests, 'request')}`}
                </Text>
              </Box>
            </Box>
          ))}
          {totals.models.length > TOP_MODELS && (
            <Text dimColor>+{totals.models.length - TOP_MODELS} more on the Models tab</Text>
          )}
        </Box>
      )}
      {noteLines(ui, snapshot.notes)}
    </Box>
  )
}
