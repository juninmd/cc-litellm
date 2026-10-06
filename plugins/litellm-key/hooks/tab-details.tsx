import type { RenderElement } from 'claude-code'

import type { Snapshot } from '../types'
import { details } from './details'
import type { DashboardProps } from './pane-props'
import type { Ui } from './parts'
import type { Layout } from './parts-tabs'
import { factRows, heading } from './parts-tabs'

/** Everything the proxy told about the key and how it was read, in groups, and where its own dashboard is. */
export const detailsTab = (ui: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { Box, Text, Link } = ui
  const { columns, gap } = layout
  const groups = details(snapshot, props.now, props.refreshSeconds)
  const labelWidth = Math.min(16, Math.max(8, ...groups.flatMap(group => group.rows.map(row => row.label.length))))

  return (
    <Box flexDirection="column">
      {groups.map((group, at) => (
        <Box flexDirection="column" marginTop={at === 0 ? 0 : gap}>
          {heading(ui, group.title, columns)}
          {factRows(ui, group.rows, labelWidth)}
        </Box>
      ))}
      {snapshot.root !== '' && (
        <Box marginTop={gap}>
          <Box width={labelWidth + 2} flexShrink={0}>
            <Text bold>Dashboard</Text>
          </Box>
          <Link href={`${snapshot.root}/ui`} />
        </Box>
      )}
    </Box>
  )
}
