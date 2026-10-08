import type { RenderElement } from 'claude-code'

import type { PingState } from '../types'
import { clock, sparkline } from './format'
import type { DashboardProps } from './pane-props'
import type { Ui } from './parts'
import type { Layout } from './parts-tabs'
import { heading } from './parts-tabs'
import { pingReport } from './probe'

/** Under 300 ms is quick, under a second is slow, more is worth a look. */
const toneOf = (ms: number | null, isOk: boolean): 'success' | 'warning' | 'error' => (!isOk ? 'error' : ms !== null && ms >= 1000 ? 'error' : ms !== null && ms >= 300 ? 'warning' : 'success')

/** What the tab says as text: the table of `/litellm ping`, and the times of the rounds before it. */
export const pingText = (ping: PingState | null): string => {
  if (ping === null || ping.failure !== null || ping.probes.length === 0) {
    return ping?.failure ?? 'No ping yet: press p on the Ping tab, or run /litellm ping.'
  }

  return pingReport(ping.host, ping.root, ping.probes)
}

/** A round of probes against the proxy, with the time of each endpoint, and a button to ask again. */
export const pingTab = (ui: Ui, props: DashboardProps, layout: Layout): RenderElement => {
  const { Box, Text, Button } = ui
  const { ping } = props
  const { columns, gap } = layout
  const button = (
    <Button key="ping" label={ping?.isRunning ? 'Pinging…' : 'Ping now (p)'} hotkey="p" variant="primary" onPress={props.onPing} />
  )

  if (ping === null || (ping.probes.length === 0 && ping.failure === null)) {
    return (
      <Box flexDirection="column" gap={gap}>
        <Text dimColor>{ping?.isRunning ? 'Asking every endpoint the plugin reads…' : 'Not pinged yet.'}</Text>
        {button}
      </Box>
    )
  }
  if (ping.failure !== null) {
    return (
      <Box flexDirection="column" gap={gap}>
        <Text color="error">✗ {ping.failure}</Text>
        {button}
      </Box>
    )
  }
  const width = Math.max(0, ...ping.probes.map(probe => probe.path.length))
  const first = ping.probes[0]
  const okCount = ping.probes.filter(probe => probe.ok).length
  const times = ping.history
  const average = times.length === 0 ? null : Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length)

  return (
    <Box flexDirection="column">
      {heading(ui, 'Latency', columns)}
      <Text>
        <Text bold>{first?.ms === null || first === undefined ? '—' : `${first.ms} ms`}</Text> to /key/info
        {average === null ? '' : ` · avg ${average} ms · best ${Math.min(...times)} · worst ${Math.max(...times)}`}
      </Text>
      {times.length > 1 && <Text dimColor>{sparkline(times)} last {times.length} pings</Text>}
      <Box flexDirection="column" marginTop={gap}>
        {heading(ui, `Endpoints ${okCount}/${ping.probes.length} ok`, columns)}
        {ping.probes.map(probe => (
          <Box>
            <Text color={probe.ok ? 'success' : 'error'}>{probe.ok ? '✓' : '✗'} </Text>
            <Text>{probe.path.padEnd(width)} </Text>
            <Text color={toneOf(probe.ms, probe.ok)}>{(probe.ms === null ? '—' : `${probe.ms} ms`).padStart(7)} </Text>
            <Box flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {probe.status === null ? '' : `${probe.status} `}
                {probe.detail}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Box marginTop={gap} gap={2}>
        {button}
        <Text dimColor>
          {ping.host} · {clock(ping.at)}
        </Text>
      </Box>
    </Box>
  )
}
