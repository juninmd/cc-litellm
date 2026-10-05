import type { RenderElement } from 'claude-code'

import type { Snapshot } from '../types'
import { truncate } from './format'
import type { DashboardProps, Layout, Ui } from './parts'
import { ARROW_WIDTH, GAUGE_EXTRA, factRows, gaugeArrow, gaugeText, glyph, noteLines, tint } from './parts'
import type { Row } from './summary'
import { alerts, facts, meters, timeMeter } from './summary'

const COMPACT_BAR = 10
const COMPACT_LABEL = 22
const FACT_GAP = 3
// How many alerts the pane lists before it only counts the rest.
const ALERTS = 4

const sizeOf = (row: Row): number => row.label.length + 1 + row.text.length

/** Packs the facts into lines no wider than `width`, in order, FACT_GAP apart. */
export const packFacts = (rows: readonly Row[], width: number): Row[][] => {
  const lines: Row[][] = []
  let line: Row[] = []
  let used = 0

  for (const row of rows) {
    const size = sizeOf(row)

    if (line.length > 0 && used + FACT_GAP + size > width) {
      lines.push(line)
      line = []
      used = 0
    }
    used += (line.length === 0 ? 0 : FACT_GAP) + size
    line.push(row)
  }
  if (line.length > 0) {
    lines.push(line)
  }

  return lines
}

const alertLines = ({ Box, Text }: Ui, list: ReturnType<typeof alerts>, limit: number): RenderElement => (
  <Box flexDirection="column">
    {list.slice(0, limit).map(alert => (
      <Text {...tint(alert.tone)}>
        {glyph(alert.tone)} {alert.text}
      </Text>
    ))}
    {list.length > limit && <Text dimColor>+{list.length - limit} more</Text>}
  </Box>
)

/** The compact layout has no rows to spare: how many alerts there are, and the worst of them, on one line. */
const alertSummary = ({ Text }: Ui, list: ReturnType<typeof alerts>): RenderElement | null => {
  const [worst] = list

  return worst === undefined ? null : (
    <Text {...tint(worst.tone)} wrap="truncate-end">
      {glyph(worst.tone)} {list.length > 1 ? `${list.length} alerts · ` : ''}
      {worst.text}
    </Text>
  )
}

export const overviewTab = (ui: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { Box, Text } = ui
  const { now, warnPercent, isForecast } = props
  const { columns, isWide, isCompact } = layout
  const spend = meters(snapshot, now, warnPercent, isForecast)
  const clock = isForecast ? timeMeter(snapshot, now) : null
  // The time of the budget's period sits right under the budget: a bar longer than the time bar is spending too fast.
  const list = clock === null ? spend : [...spend.slice(0, 1), clock, ...spend.slice(1)]
  const rows = facts(snapshot, now, { session: props.session, isForecast }).filter(row => row.label !== 'Status')
  const warnings = alerts(snapshot, now, warnPercent, isForecast, { dailyAlert: props.dailyAlert })
  const longest = Math.max(...list.map(item => item.label.length))
  // Compact: labels take about a quarter of the width (10 to 22 cells), so the amounts keep the rest of the line.
  const labelWidth = isCompact
    ? Math.min(COMPACT_LABEL, Math.max(10, Math.floor(columns * 0.27)), longest)
    : Math.min(24, Math.max(8, longest, ...rows.map(row => row.label.length)), Math.max(8, Math.floor(columns * 0.4)))
  // Where a budget is heading is told after its percentage, in a few cells only reserved when one has something to say.
  const headings = list.map(meter =>
    meter.forecast !== null && meter.tone !== 'error' ? meter.forecast.projectedPct : null,
  )
  const arrowRoom = headings.some(item => item !== null && item >= 100) ? ARROW_WIDTH : 0
  const barWidth = isWide
    ? 18
    : isCompact
      ? COMPACT_BAR
      : Math.max(8, Math.min(30, columns - labelWidth - 14 - arrowRoom))
  const meterRows = list.map((meter, at) => {
    const heading = headings[at] ?? null
    const gauge = (
      <Box flexShrink={0}>
        {gaugeText(
          ui,
          meter.tone,
          meter.used,
          meter.limit,
          barWidth,
          meter.label === 'Time' ? 'suggestion' : undefined,
        )}
        {gaugeArrow(ui, heading)}
      </Box>
    )
    const mark = (
      <Box width={2} flexShrink={0}>
        <Text {...(meter.tone === 'ok' ? { dimColor: true } : tint(meter.tone))}>
          {meter.tone === 'ok' ? '·' : glyph(meter.tone)}
        </Text>
      </Box>
    )

    if (isCompact) {
      const room = columns - 2 - (labelWidth + 1) - (barWidth + GAUGE_EXTRA + arrowRoom)

      return (
        <Box>
          {mark}
          <Box width={labelWidth + 1} flexShrink={0}>
            <Text bold>{truncate(meter.label, labelWidth)}</Text>
          </Box>
          <Box width={barWidth + GAUGE_EXTRA + arrowRoom} flexShrink={0}>
            {gauge}
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {meter.text.length <= room ? meter.text : meter.brief}
            </Text>
          </Box>
        </Box>
      )
    }

    return isWide ? (
      <Box>
        {mark}
        <Box width={labelWidth + 2} flexShrink={0}>
          <Text bold>{truncate(meter.label, labelWidth)}</Text>
        </Box>
        <Box width={barWidth + GAUGE_EXTRA + arrowRoom} flexShrink={0}>
          {gauge}
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor>{meter.text}</Text>
        </Box>
      </Box>
    ) : (
      <Box flexDirection="column">
        <Box>
          {mark}
          <Box width={labelWidth + 2} flexShrink={0}>
            <Text bold>{truncate(meter.label, labelWidth)}</Text>
          </Box>
          {gauge}
        </Box>
        <Box paddingLeft={2}>
          <Text dimColor>{meter.text}</Text>
        </Box>
      </Box>
    )
  })

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">{meterRows}</Box>
      {warnings.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {isCompact ? alertSummary(ui, warnings) : alertLines(ui, warnings, ALERTS)}
        </Box>
      ) : (
        !isCompact && (
          <Box marginTop={1}>
            <Text color="success">✓</Text>
            <Text dimColor> Nothing needs attention</Text>
          </Box>
        )
      )}
      {isCompact ? (
        rows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {packFacts(rows, columns).map(line => (
              <Box gap={FACT_GAP}>
                {line.map(row => (
                  <Box gap={1}>
                    <Text bold>{row.label}</Text>
                    <Text {...tint(row.tone)}>{row.text}</Text>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {factRows(ui, rows, labelWidth)}
        </Box>
      )}
      {noteLines(ui, snapshot.notes)}
    </Box>
  )
}
