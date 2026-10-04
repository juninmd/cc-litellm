import type { Elements, RenderElement, UiPressArgument } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import { bar, clock, percent, truncate } from './format'
import type { Row, Tone } from './summary'
import { facts, identity, meters } from './summary'

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type Placement = 'dock' | 'inline'

export type DashboardProps = {
  snapshot: Snapshot | null
  failure: Failure | null
  isLoading: boolean
  now: number
  columns: number
  placement: Placement
  warnPercent: number
  refreshSeconds: number
  onRefresh: () => void
  onCopy: (press: UiPressArgument) => void
  onClose: () => void
}

type Tint = { color?: string; dimColor?: boolean }

// Body columns from which the meters sit in a table, one line each.
const WIDE = 118
// Fewest body columns the compact layout serves: a meter needs its label, its bar and the amounts on one line.
const COMPACT_MIN = 70
const COMPACT_BAR = 10
const COMPACT_LABEL = 22
const FACT_GAP = 3

const tint = (tone: Tone): Tint =>
  tone === 'warn' ? { color: 'warning' } : tone === 'error' ? { color: 'error' } : {}

const barTint = (tone: Tone): Tint => (tone === 'ok' ? { color: 'success' } : tint(tone))

const SETUP = [
  'Set these under "env" in ~/.claude/settings.json:',
  '  ANTHROPIC_BASE_URL    https://your-litellm-host',
  '  ANTHROPIC_AUTH_TOKEN  <your virtual key>',
]

// Rows are scarce inline above the prompt (the pane shrinks to its content, never past what the layout spares) and the
// table has no room below WIDE: there the pane is compact. Narrower than COMPACT_MIN a meter's text would not fit
// beside its bar, so the stacked layout, with the text on a line of its own, serves better.
const isCompact = (placement: Placement, columns: number): boolean =>
  placement === 'inline' && columns >= COMPACT_MIN && columns < WIDE

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

export const dashboard = ({ Box, Text, Button }: Ui, props: DashboardProps): RenderElement => {
  const { snapshot, failure, isLoading, now } = props
  const isWide = props.columns >= WIDE
  const compact = isCompact(props.placement, props.columns)
  const gap = compact ? 0 : 1
  const buttons = (
    <Box gap={1}>
      <Button key="refresh" label="Refresh" hotkey="r" variant="primary" onPress={props.onRefresh} />
      {snapshot && <Button key="copy" label="Copy" hotkey="c" onPress={props.onCopy} />}
      <Button key="close" label="Close" hotkey="q" role="dismiss" onPress={props.onClose} />
    </Box>
  )

  if (!snapshot) {
    return (
      <Box flexDirection="column">
        {failure ? (
          <Text color={failure.kind === 'not-configured' ? 'warning' : 'error'} bold>
            {failure.kind === 'not-configured' ? '⚠' : '✗'} {failure.message}
          </Text>
        ) : (
          <Text dimColor>{isLoading ? 'Reading the key from the proxy…' : 'No data yet.'}</Text>
        )}
        {failure?.hint && <Text dimColor>{failure.hint}</Text>}
        {failure?.kind === 'not-configured' && (
          <Box flexDirection="column" marginTop={1}>
            {SETUP.map(line => (
              <Text dimColor>{line}</Text>
            ))}
          </Box>
        )}
        <Box marginTop={gap}>{buttons}</Box>
      </Box>
    )
  }
  const { key } = snapshot
  const list = meters(snapshot, now, props.warnPercent)
  const rows = facts(snapshot, now).filter(row => row.label !== 'Status')
  const longest = Math.max(...list.map(item => item.label.length))
  // Compact: labels take about a quarter of the width (10 to 22 cells), so the amounts keep the rest of the line.
  const labelWidth = compact
    ? Math.min(COMPACT_LABEL, Math.max(10, Math.floor(props.columns * 0.27)), longest)
    : Math.min(24, Math.max(8, longest, ...rows.map(row => row.label.length)))
  const barWidth = isWide ? 18 : compact ? COMPACT_BAR : Math.max(8, Math.min(30, props.columns - labelWidth - 12))
  const statusTone: Tone = key.status === 'active' ? 'ok' : 'error'
  const state = (
    <Text {...(statusTone === 'ok' ? { color: 'success' } : tint(statusTone))}>
      {key.status === 'active' ? '●' : '✗'} {key.status}
    </Text>
  )
  const meterRows = list.map(meter => {
    const pct = percent(meter.used, meter.limit)
    const gauge =
      pct === null ? (
        <Text dimColor>no cap</Text>
      ) : (
        <Text {...barTint(meter.tone)}>
          {bar(pct / 100, barWidth)} {pct}%
        </Text>
      )

    if (compact) {
      const room = props.columns - (labelWidth + 1) - (barWidth + 6)

      return (
        <Box>
          <Box width={labelWidth + 1} flexShrink={0}>
            <Text bold>{truncate(meter.label, labelWidth)}</Text>
          </Box>
          <Box width={barWidth + 6} flexShrink={0}>
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
        <Box width={labelWidth + 2} flexShrink={0}>
          <Text bold>{truncate(meter.label, labelWidth)}</Text>
        </Box>
        <Box width={barWidth + 6} flexShrink={0}>
          {gauge}
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor>{meter.text}</Text>
        </Box>
      </Box>
    ) : (
      <Box flexDirection="column">
        <Box>
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
      {failure && (
        <Box flexDirection="column" marginBottom={gap}>
          <Text color="warning" bold>
            ⚠ Showing the last good reading: {failure.message}
          </Text>
          {failure.hint && <Text dimColor>{failure.hint}</Text>}
        </Box>
      )}
      {compact ? (
        <Box gap={2}>
          <Text bold>{identity(snapshot)}</Text>
          {state}
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {snapshot.host}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box gap={2}>
            <Text bold>{identity(snapshot)}</Text>
            {state}
          </Box>
          <Text dimColor>
            {snapshot.host} · via {snapshot.keySource}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={gap}>
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
        <Box flexDirection="column" marginTop={1}>
          {rows.map(row => (
            <Box>
              <Box width={labelWidth + 2} flexShrink={0}>
                <Text bold>{truncate(row.label, labelWidth)}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text {...tint(row.tone)}>{row.text}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {snapshot.notes.map(note => (
        <Text dimColor>· {note}</Text>
      ))}
      <Box marginTop={gap} gap={2}>
        {buttons}
        <Text dimColor>
          Updated {clock(snapshot.fetchedAt)} · every {props.refreshSeconds}s{isLoading ? ' · refreshing…' : ''}
        </Text>
      </Box>
    </Box>
  )
}
