import type { RenderElement } from 'claude-code'

import type { Snapshot, ViewName } from '../types'
import { clock } from './format'
import { buttonsWidth, footerPlan, isCompactAt } from './layout'
import type { DashboardProps } from './pane-props'
import type { Ui } from './parts'
import { Pill } from './parts'
import { layoutOf } from './parts-tabs'
import type { Tone } from './summary'
import { identity } from './facts'
import { detailsTab } from './tab-details'
import { modelsTab } from './tab-models'
import { overviewBody } from './tab-overview'
import { TAB_WHAT, textOf } from './tab-text'
import { usageTab } from './tab-usage'

export type { DashboardProps } from './pane-props'
export type { Ui } from './parts'
export type { Placement } from './layout'
export { packFacts } from './tab-overview'

const LABEL = { refresh: 'Refresh (r)', copy: 'Copy (c)', close: 'Close (q)' }

const TABS: readonly { name: ViewName; label: string; hotkey: string }[] = [
  { name: 'overview', label: 'Overview', hotkey: '1' },
  { name: 'usage', label: 'Usage', hotkey: '2' },
  { name: 'models', label: 'Models', hotkey: '3' },
  { name: 'details', label: 'Details', hotkey: '4' },
]

const SETUP = [
  'Set these under "env" in ~/.claude/settings.json:',
  '  ANTHROPIC_BASE_URL    https://your-litellm-host',
  '  ANTHROPIC_AUTH_TOKEN  <your virtual key>',
]

/** The tabs: the one showing is a mark, the others are plain buttons, which draw their own hotkey ("2: Usage"). */
const tabBar = ({ Box, Text, Button }: Ui, props: DashboardProps): RenderElement => (
  <Box columnGap={2} flexWrap="wrap">
    {TABS.map(tab =>
      tab.name === props.tab ? (
        <Text inverse bold>{` ${tab.hotkey}: ${tab.label} `}</Text>
      ) : (
        <Button
          key={`tab-${tab.name}`}
          label={tab.label}
          hotkey={tab.hotkey}
          plain
          onPress={() => {
            props.onTab(tab.name)
          }}
        />
      ),
    )}
  </Box>
)

export const dashboard = (ui: Ui, props: DashboardProps): RenderElement => {
  const { Box, Text, Button } = ui
  const { snapshot, failure, isLoading, now } = props
  const compact = isCompactAt(props.placement, props.columns, props.isCompact)
  // Titles and hairlines cost rows: only the dock, which has them to spare, gets them.
  const hasSections = !compact && props.placement === 'dock'
  const gap = compact ? 0 : 1
  // A tab with nothing in it has nothing to copy: the usage report of no history is a sentence, not a report.
  const canCopy = snapshot !== null && !(props.tab === 'usage' && snapshot.usage === null)
  // The key sits in the label because no surface draws a hotkey itself.
  const labels = [LABEL.refresh, ...(canCopy ? [LABEL.copy] : []), LABEL.close]
  const buttons = (
    <Box gap={1} flexWrap="wrap">
      <Button key="refresh" label={LABEL.refresh} hotkey="r" variant="primary" onPress={props.onRefresh} />
      {snapshot && canCopy && (
        <Button
          key="copy"
          label={LABEL.copy}
          hotkey="c"
          onPress={press => {
            // The text is made when the button is pressed, not each time the pane is drawn.
            props.onCopy(textOf(props.tab, props.range, props)(snapshot, now), TAB_WHAT[props.tab], press)
          }}
        />
      )}
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
  const statusTone: Tone = key.status === 'active' ? 'ok' : 'error'
  const state = Pill(ui, `${key.status === 'active' ? '●' : '✗'} ${key.status}`, statusTone)
  const layout = layoutOf(props)
  const body =
    props.tab === 'usage'
      ? usageTab(ui, props, snapshot, layout)
      : props.tab === 'models'
        ? modelsTab(ui, props, snapshot, layout)
        : props.tab === 'details'
          ? detailsTab(ui, props, snapshot, layout)
          : overviewBody(ui, props, snapshot, { compact, hasSections, gap })
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
      {tabBar(ui, props)}
      <Box flexDirection="column" marginTop={gap}>
        {body}
      </Box>
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
