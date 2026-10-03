import type { Elements, RenderElement, UiPressArgument } from 'claude-code'

import type { Failure, Snapshot } from '../types'
import { bar, clock, percent, truncate } from './format'
import type { Tone } from './summary'
import { facts, identity, meters } from './summary'

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type DashboardProps = {
  snapshot: Snapshot | null
  failure: Failure | null
  isLoading: boolean
  now: number
  columns: number
  warnPercent: number
  refreshSeconds: number
  onRefresh: () => void
  onCopy: (press: UiPressArgument) => void
  onClose: () => void
}

type Tint = { color?: string; dimColor?: boolean }

const WIDE = 118

const tint = (tone: Tone): Tint =>
  tone === 'warn' ? { color: 'warning' } : tone === 'error' ? { color: 'error' } : {}

const barTint = (tone: Tone): Tint => (tone === 'ok' ? { color: 'success' } : tint(tone))

const SETUP = [
  'Set these under "env" in ~/.claude/settings.json:',
  '  ANTHROPIC_BASE_URL    https://your-litellm-host',
  '  ANTHROPIC_AUTH_TOKEN  <your virtual key>',
]

export const dashboard = ({ Box, Text, Button }: Ui, props: DashboardProps): RenderElement => {
  const { snapshot, failure, isLoading, now } = props
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
        <Box marginTop={1}>{buttons}</Box>
      </Box>
    )
  }
  const { key } = snapshot
  const list = meters(snapshot, now, props.warnPercent)
  const rows = facts(snapshot, now).filter(row => row.label !== 'Status')
  const labelWidth = Math.min(24, Math.max(8, ...list.map(item => item.label.length), ...rows.map(row => row.label.length)))
  const isWide = props.columns >= WIDE
  const barWidth = isWide ? 18 : Math.max(8, Math.min(30, props.columns - labelWidth - 12))
  const statusTone: Tone = key.status === 'active' ? 'ok' : 'error'

  return (
    <Box flexDirection="column">
      {failure && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="warning" bold>
            ⚠ Showing the last good reading: {failure.message}
          </Text>
          {failure.hint && <Text dimColor>{failure.hint}</Text>}
        </Box>
      )}
      <Box gap={2}>
        <Text bold>{identity(snapshot)}</Text>
        <Text {...(statusTone === 'ok' ? { color: 'success' } : tint(statusTone))}>
          {key.status === 'active' ? '●' : '✗'} {key.status}
        </Text>
      </Box>
      <Text dimColor>
        {snapshot.host} · via {snapshot.keySource}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {list.map(meter => {
          const pct = percent(meter.used, meter.limit)
          const gauge =
            pct === null ? (
              <Text dimColor>no cap</Text>
            ) : (
              <Text {...barTint(meter.tone)}>
                {bar(pct / 100, barWidth)} {pct}%
              </Text>
            )

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
        })}
      </Box>
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
      {snapshot.notes.map(note => (
        <Text dimColor>· {note}</Text>
      ))}
      <Box marginTop={1} gap={2}>
        {buttons}
        <Text dimColor>
          Updated {clock(snapshot.fetchedAt)} · every {props.refreshSeconds}s{isLoading ? ' · refreshing…' : ''}
        </Text>
      </Box>
    </Box>
  )
}
