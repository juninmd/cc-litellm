import type { RenderElement } from 'claude-code'

import { rule, truncate } from './format'
import { RANGES, nextRange } from './history'
import { isCompactAt } from './layout'
import type { Ui } from './parts'
import { tint } from './parts'
import type { DashboardProps } from './pane-props'
import type { Row } from './summary'

/** How a tab lays itself out: the cells across its body, whether rows are scarce, and the blank rows between blocks. */
export type Layout = { columns: number; isCompact: boolean; gap: number }

export const layoutOf = (props: Pick<DashboardProps, 'columns' | 'placement' | 'isCompact'>): Layout => {
  const isCompact = isCompactAt(props.placement, props.columns, props.isCompact)

  return { columns: props.columns, isCompact, gap: isCompact ? 0 : 1 }
}

/** A bold label and a hairline to the edge. */
export const heading = ({ Box, Text }: Ui, label: string, columns: number): RenderElement => (
  <Box>
    <Text bold>{label}</Text>
    <Text dimColor wrap="truncate-end">{` ${'─'.repeat(Math.max(0, columns - label.length - 1))}`}</Text>
  </Box>
)

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

/** A share of a whole as a slim bar and a percentage, in the default color: it compares parts, it does not judge them. */
export const shareBar = ({ Text }: Ui, fraction: number | null, width: number): RenderElement => {
  if (fraction === null) {
    return <Text dimColor>—</Text>
  }
  const { full, track } = rule(fraction, width)

  return (
    <Text>
      {full}
      <Text dimColor>{track}</Text> {String(Math.round(fraction * 100)).padStart(3)}%
    </Text>
  )
}

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
