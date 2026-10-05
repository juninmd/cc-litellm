import type { RenderElement } from 'claude-code'

import type { Snapshot, ViewName } from '../types'
import { ago, clock } from './format'
import type { DashboardProps, Layout, Ui } from './parts'
import { glyph, layoutOf, tint } from './parts'
import type { Tone } from './summary'
import { detailsText, identity, modelsReport, summaryText, usageReport } from './summary'
import { detailsTab } from './tab-details'
import { modelsTab } from './tab-models'
import { overviewTab } from './tab-overview'
import { usageTab } from './tab-usage'

export { packFacts } from './tab-overview'
export type { DashboardProps, Placement, Ui } from './parts'

type Tab = { name: ViewName; label: string; hotkey: string }

const TABS: readonly Tab[] = [
  { name: 'overview', label: 'Overview', hotkey: '1' },
  { name: 'usage', label: 'Usage', hotkey: '2' },
  { name: 'models', label: 'Models', hotkey: '3' },
  { name: 'details', label: 'Details', hotkey: '4' },
]

const SETUP_SNIPPET = `{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-litellm-host",
    "ANTHROPIC_AUTH_TOKEN": "<your virtual key>"
  }
}`

type Copy = { text: () => string; what: string }

/**
 * What the Copy button puts on the clipboard: the tab the person is looking at, as text. The text is only made when the
 * button is pressed, not each time the pane is drawn.
 */
const copyOf = (props: DashboardProps, snapshot: Snapshot): Copy => {
  const { now, warnPercent, range } = props

  switch (props.tab) {
    case 'usage':
      return { text: () => usageReport(snapshot, range), what: 'the usage report' }
    case 'models':
      return { text: () => modelsReport(snapshot, range), what: 'the model list' }
    case 'details':
      return { text: () => detailsText(snapshot, now, props.refreshSeconds), what: 'the key details' }
    default:
      return {
        text: () => summaryText(snapshot, now, warnPercent, { session: props.session, isForecast: props.isForecast }),
        what: 'the summary',
      }
  }
}

/** Refresh, Copy and Close: what can be done whatever the tab. */
const actions = (ui: Ui, props: DashboardProps, snapshot: Snapshot | null, isSetup: boolean): RenderElement => {
  const { Box, Button } = ui
  const copy: Copy | null = snapshot
    ? copyOf(props, snapshot)
    : isSetup
      ? { text: () => SETUP_SNIPPET, what: 'the settings snippet' }
      : null

  return (
    <Box gap={1}>
      <Button key="refresh" label="Refresh" hotkey="r" variant="primary" onPress={props.onRefresh} />
      {copy !== null && (
        <Button
          key="copy"
          label={snapshot ? 'Copy' : 'Copy snippet'}
          hotkey="c"
          onPress={press => {
            props.onCopy(copy.text(), copy.what, press)
          }}
        />
      )}
      <Button key="close" label="Close" hotkey="q" role="dismiss" onPress={props.onClose} />
    </Box>
  )
}

/** Whether the key works, in a word with a sign. */
const state = ({ Text }: Ui, snapshot: Snapshot): RenderElement => {
  const tone: Tone = snapshot.key.status === 'active' ? 'ok' : 'error'

  return (
    <Text {...(tone === 'ok' ? { color: 'success' } : tint(tone))}>
      {glyph(tone)} {snapshot.key.status}
    </Text>
  )
}

/** Who the key is and whether it works, with the actions at the other end; they wrap under it where there is no room. */
const header = (ui: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { Box, Text } = ui

  return (
    <Box justifyContent="space-between" flexWrap="wrap" columnGap={2}>
      <Box gap={2} flexShrink={1}>
        <Text bold wrap="truncate-end">
          {identity(snapshot)}
        </Text>
        {state(ui, snapshot)}
        {props.isLoading && <Text dimColor>↻</Text>}
        {layout.isCompact && (
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {snapshot.host}
            </Text>
          </Box>
        )}
      </Box>
      {actions(ui, props, snapshot, false)}
    </Box>
  )
}

/** The four tabs: the one showing is a mark, the others are buttons with their digit as the hotkey. */
const tabs = ({ Box, Text, Button }: Ui, props: DashboardProps): RenderElement => (
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

const footer = ({ Box, Text }: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { now, isLoading } = props
  const read = `Updated ${clock(snapshot.fetchedAt)} (${ago(snapshot.fetchedAt, now)}) · every ${props.refreshSeconds}s${isLoading ? ' · refreshing…' : ''}`

  return (
    <Box flexDirection="column" marginTop={layout.gap}>
      {!layout.isCompact && (
        <Text dimColor wrap="truncate-end">
          {snapshot.host} · via {snapshot.keySource}
        </Text>
      )}
      <Text dimColor wrap="truncate-end">
        {read}
      </Text>
      {!layout.isCompact && props.isTerminal && (
        <Text dimColor wrap="truncate-end">
          {props.isFocused
            ? '1-4 tabs · r refresh · c copy · q close · esc back to the prompt'
            : 'ctrl+x tab, or a click, gives the pane the keyboard'}
        </Text>
      )}
    </Box>
  )
}

const empty = (ui: Ui, props: DashboardProps, layout: Layout): RenderElement => {
  const { Box, Text, Code } = ui
  const { failure, isLoading } = props
  const isSetup = failure?.kind === 'not-configured'

  return (
    <Box flexDirection="column">
      {failure ? (
        <Box flexDirection="column" borderStyle="round" borderColor={isSetup ? 'warning' : 'error'} paddingX={1}>
          <Text color={isSetup ? 'warning' : 'error'} bold>
            {isSetup ? '⚠' : '✗'} {failure.message}
          </Text>
          {failure.hint && <Text dimColor>{failure.hint}</Text>}
        </Box>
      ) : (
        <Text dimColor>{isLoading ? 'Reading the key from the proxy…' : 'No data yet.'}</Text>
      )}
      {isSetup && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Set these under "env" in ~/.claude/settings.json:</Text>
          <Code source={SETUP_SNIPPET} language="json" />
        </Box>
      )}
      <Box marginTop={layout.gap}>{actions(ui, props, null, isSetup)}</Box>
    </Box>
  )
}

export const dashboard = (ui: Ui, props: DashboardProps): RenderElement => {
  const { Box, Text } = ui
  const { snapshot, failure } = props
  const layout = layoutOf(props)

  if (!snapshot) {
    return empty(ui, props, layout)
  }
  const body =
    props.tab === 'usage'
      ? usageTab(ui, props, snapshot, layout)
      : props.tab === 'models'
        ? modelsTab(ui, props, snapshot, layout)
        : props.tab === 'details'
          ? detailsTab(ui, props, snapshot, layout)
          : overviewTab(ui, props, snapshot, layout)

  return (
    <Box flexDirection="column">
      {failure && (
        <Box flexDirection="column" marginBottom={layout.gap}>
          <Text color="warning" bold>
            ⚠ Showing the last good reading: {failure.message}
          </Text>
          {failure.hint && <Text dimColor>{failure.hint}</Text>}
        </Box>
      )}
      {header(ui, props, snapshot, layout)}
      {tabs(ui, props)}
      <Box flexDirection="column" marginTop={layout.gap}>
        {body}
      </Box>
      {footer(ui, props, snapshot, layout)}
    </Box>
  )
}
