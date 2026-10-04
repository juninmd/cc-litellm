import type { RenderElement, UiPressArgument } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import { clock } from './format'
import type { Placement } from './layout'
import { buttonsWidth, footerPlan, geometryOf, isCompactAt, modelPlan } from './layout'
import type { Ui } from './parts'
import { MeterRow, ModelRow, Pill, SectionTitle, tint } from './parts'
import type { Row, Tone } from './summary'
import { facts, identity, modelShares, usageParts } from './facts'
import { meters } from './summary'

export type { Ui } from './parts'
export type { Placement } from './layout'

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

const FACT_GAP = 3
const LABEL = { refresh: 'Refresh (r)', copy: 'Copy (c)', close: 'Close (q)' }

const SETUP = [
  'Set these under "env" in ~/.claude/settings.json:',
  '  ANTHROPIC_BASE_URL    https://your-litellm-host',
  '  ANTHROPIC_AUTH_TOKEN  <your virtual key>',
]

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
  const compact = isCompactAt(props.placement, props.columns, props.isCompact)
  // Titles and hairlines cost rows: only the dock, which has them to spare, gets them.
  const hasSections = !compact && props.placement === 'dock'
  const gap = compact ? 0 : 1
  // The key sits in the label because no surface draws a hotkey itself.
  const labels = [LABEL.refresh, ...(snapshot ? [LABEL.copy] : []), LABEL.close]
  const buttons = (
    <Box gap={1} flexWrap="wrap">
      <Button key="refresh" label={LABEL.refresh} hotkey="r" variant="primary" onPress={props.onRefresh} />
      {snapshot && <Button key="copy" label={LABEL.copy} hotkey="c" onPress={props.onCopy} />}
      <Button key="close" label={LABEL.close} hotkey="q" role="dismiss" onPress={props.onClose} />
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
      </Box>
    )
  }
  const { key } = snapshot
  const list = meters(snapshot, now, props.warnPercent)
  const everyRow = facts(snapshot, now).filter(row => row.label !== 'Status')
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
  const statusTone: Tone = key.status === 'active' ? 'ok' : 'error'
  const state = Pill(ui, `${key.status === 'active' ? '●' : '✗'} ${key.status}`, statusTone)
  const modelLayout = { labelWidth, ...modelPlan(props.columns, { variant, labelWidth, barWidth }) }
  const meterRows = list.map(meter => MeterRow(ui, meter, { variant, labelWidth, barWidth, columns: props.columns }))
  const title = (text: string) => hasSections && SectionTitle(ui, text, props.columns)
  const updated = (isShort: boolean): string =>
    `Updated ${clock(snapshot.fetchedAt)}${isShort ? '' : ` · every ${props.refreshSeconds}s`}${isLoading ? ' · refreshing…' : ''}`
  const plan = footerPlan(props.columns, buttonsWidth(labels), updated(false), updated(true))

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
          {shares.length > 0 && title('TOP MODELS')}
          {shares.map(item => ModelRow(ui, item, modelLayout))}
        </Box>
      )}
      {snapshot.notes.map(note => (
        <Text>· {note}</Text>
      ))}
      {compact ? (
        <Box marginTop={gap} gap={plan === 'column' ? 0 : 2} flexDirection={plan === 'column' ? 'column' : 'row'}>
          {buttons}
          <Text dimColor>{updated(plan === 'row-short')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={gap}>
          {buttons}
          <Text dimColor>{updated(false)}</Text>
        </Box>
      )}
    </Box>
  )
}
