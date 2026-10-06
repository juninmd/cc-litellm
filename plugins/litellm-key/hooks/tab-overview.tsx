import type { RenderElement } from 'claude-code'

import type { Snapshot } from '../types'
import { facts, modelShares, usageParts } from './facts'
import { geometryOf, modelPlan } from './layout'
import type { DashboardProps } from './pane-props'
import type { Ui } from './parts'
import { MeterRow, ModelRow, SectionTitle, tint } from './parts'
import type { Row } from './summary'
import { meters } from './summary'

const FACT_GAP = 3

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

export type Frame = {
  /** The compact layout is in force: one line a meter, the facts side by side. */
  compact: boolean
  /** Titles and hairlines cost rows: only the dock, which has them to spare, gets them. */
  hasSections: boolean
  /** Blank rows between the blocks. */
  gap: number
}

/** The budgets, then the key's facts, the week and its top models: the first tab, and what the pane always was. */
export const overviewBody = (ui: Ui, props: DashboardProps, snapshot: Snapshot, frame: Frame): RenderElement => {
  const { Box, Text } = ui
  const { compact, hasSections, gap } = frame
  const list = meters(snapshot, props.now, props.warnPercent)
  const everyRow = facts(snapshot, props.now).filter(row => row.label !== 'Status')
  const usage = compact ? null : usageParts(snapshot)
  const shares = hasSections ? modelShares(snapshot) : []
  const rows = everyRow.filter(row => row.label !== 'Top models' && (compact || row.label !== 'Last 7 days'))
  const { variant, labelWidth, barWidth } = geometryOf({
    columns: props.columns,
    placement: props.placement,
    isCompact: props.isCompact,
    longest: Math.max(...list.map(item => item.label.length)),
    longestFact: Math.max(...everyRow.map(row => row.label.length)),
  })
  const modelLayout = { labelWidth, ...modelPlan(props.columns, { variant, labelWidth, barWidth }) }
  const meterRows = list.map(meter => MeterRow(ui, meter, { variant, labelWidth, barWidth, columns: props.columns }))
  const title = (text: string) => hasSections && SectionTitle(ui, text, props.columns)

  return (
    <Box flexDirection="column">
      {title('BUDGETS')}
      <Box flexDirection="column" marginTop={hasSections ? 0 : gap}>
        {meterRows}
      </Box>
      {compact ? (
        rows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {packFacts(rows, props.columns).map(line => (
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
        <Box flexDirection="column" marginTop={hasSections ? 0 : 1}>
          {rows.length > 0 && title('KEY')}
          {rows.map(row => (
            <Box paddingLeft={2}>
              <Box width={labelWidth + 1} flexShrink={0}>
                <Text bold>{row.label}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text {...tint(row.tone)}>{row.text}</Text>
              </Box>
            </Box>
          ))}
          {usage && title('LAST 7 DAYS')}
          {usage && (
            <Box paddingLeft={2} flexDirection="column">
              <Box gap={2}>
                {!hasSections && (
                  <Box width={labelWidth + 1} flexShrink={0}>
                    <Text bold>Last 7 days</Text>
                  </Box>
                )}
                <Text bold>{usage.spark}</Text>
                <Text>{usage.rest}</Text>
              </Box>
              {hasSections && <Text>{usage.days}</Text>}
            </Box>
          )}
          {shares.length > 0 && title('TOP MODELS')}
          {shares.map(item => ModelRow(ui, item, modelLayout))}
        </Box>
      )}
    </Box>
  )
}
