import type { RenderElement, UiPressArgument } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import { clock } from './format'
import type { Ui } from './parts'
import { MARK_WIDTH, MeterRow, Pill, SectionTitle, tint } from './parts'
import type { Row, Tone } from './summary'
import { facts, identity, meters, usageParts } from './summary'

export type { Ui } from './parts'

export type Placement = 'dock' | 'inline'

export type DashboardProps = {
  snapshot: Snapshot | null
  failure: Failure | null
  isLoading: boolean
  now: number
  columns: number
  placement: Placement
  /** The person asked for the compact layout (the `compact_pane` option); off, the pane keeps the stacked one. */
  isCompact: boolean
  warnPercent: number
  refreshSeconds: number
  onRefresh: () => void
  onCopy: (press: UiPressArgument) => void
  onClose: () => void
}

// Body columns from which the meters sit in a table, one line each.
const WIDE = 118
// Fewest body columns the compact layout serves: a meter needs its label, its bar and the amounts on one line.
const COMPACT_MIN = 70
const COMPACT_BAR = 10
const COMPACT_LABEL = 22
const FACT_GAP = 3

const SETUP = [
  'Set these under "env" in ~/.claude/settings.json:',
  '  ANTHROPIC_BASE_URL    https://your-litellm-host',
  '  ANTHROPIC_AUTH_TOKEN  <your virtual key>',
]

// Where the compact layout can serve: inline above the prompt, where rows are scarce (the pane shrinks to its content,
// never past what the layout spares) and the table has no room, below WIDE. Narrower than COMPACT_MIN a meter's text
// would not fit beside its bar, so the stacked layout, with the text on a line of its own, serves better there.
const fitsCompact = (placement: Placement, columns: number): boolean =>
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

export const dashboard = (ui: Ui, props: DashboardProps): RenderElement => {
  const { Box, Text, Button } = ui
  const { snapshot, failure, isLoading, now } = props
  const isWide = props.columns >= WIDE
  const compact = props.isCompact && fitsCompact(props.placement, props.columns)
  // Titles and hairlines cost rows: only the dock, which has them to spare, gets them.
  const hasSections = !compact && props.placement === 'dock'
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
        {failure?.hint && <Text>{failure.hint}</Text>}
        {failure?.kind === 'not-configured' && (
          <Box flexDirection="column" marginTop={1}>
            {SETUP.map(line => (
              <Text>{line}</Text>
            ))}
          </Box>
        )}
        <Box marginTop={gap}>{buttons}</Box>
        <Text>r refresh · q close</Text>
      </Box>
    )
  }
  const { key } = snapshot
  const list = meters(snapshot, now, props.warnPercent)
  const everyRow = facts(snapshot, now).filter(row => row.label !== 'Status')
  const usage = compact ? null : usageParts(snapshot)
  const rows = everyRow.filter(row => compact || row.label !== 'Last 7 days')
  const longest = Math.max(...list.map(item => item.label.length))
  // Compact: marks and labels take about a quarter of the width (10 to 22 cells for the label), so the amounts keep the rest.
  const labelWidth = compact
    ? Math.min(COMPACT_LABEL, Math.max(10, Math.floor(props.columns * 0.27) - MARK_WIDTH), longest)
    : Math.min(24, Math.max(8, longest, ...everyRow.map(row => row.label.length)))
  const barWidth = isWide ? 18 : compact ? COMPACT_BAR : Math.max(8, Math.min(30, props.columns - labelWidth - 11))
  const statusTone: Tone = key.status === 'active' ? 'ok' : 'error'
  const state = Pill(ui, `${key.status === 'active' ? '●' : '✗'} ${key.status}`, statusTone)
  const variant = compact ? 'compact' : isWide ? 'table' : 'stacked'
  const meterRows = list.map(meter => MeterRow(ui, meter, { variant, labelWidth, barWidth, columns: props.columns }))
  const title = (text: string) => hasSections && SectionTitle(ui, text, props.columns)

  return (
    <Box flexDirection="column">
      {failure && (
        <Box flexDirection="column" marginBottom={gap}>
          <Text color="warning" bold>
            ⚠ Showing the last good reading: {failure.message}
          </Text>
          {failure.hint && <Text>{failure.hint}</Text>}
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
        </Box>
      )}
      {snapshot.notes.map(note => (
        <Text>· {note}</Text>
      ))}
      {compact ? (
        <Box marginTop={gap} gap={2}>
          {buttons}
          <Text dimColor>
            Updated {clock(snapshot.fetchedAt)} · every {props.refreshSeconds}s{isLoading ? ' · refreshing…' : ''}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={gap}>
          {buttons}
          <Text>
            <Text dimColor>
              Updated {clock(snapshot.fetchedAt)} · every {props.refreshSeconds}s{isLoading ? ' · refreshing…' : ''} ·{' '}
            </Text>
            <Text>r refresh · c copy · q close</Text>
          </Text>
        </Box>
      )}
    </Box>
  )
}
