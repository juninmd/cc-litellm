import type { RenderElement } from 'claude-code'

import type { AdminView } from '../types'
import { clock, money, truncate } from './format'
import type { DashboardProps } from './pane-props'
import type { Ui } from './parts'
import type { Layout } from './parts-tabs'
import { heading } from './parts-tabs'

const GRANT = 10

const cap = (spend: number, limit: number | null): string => (limit === null ? `${money(spend)} · no cap` : `${money(spend)} / ${money(limit)} (${limit === 0 ? '∞' : Math.round((spend / limit) * 100)}%)`)

/** What the tab says as text: the same lists, for Copy and for a pane that cannot be drawn. */
export const adminText = (view: AdminView | null): string => {
  if (view === null) {
    return 'No admin data yet: it needs an admin key (litellm_admin_key), or a virtual key that may manage keys.'
  }

  return [
    `Keys (${view.keyTotal}, top by spend)`,
    ...view.keys.map(key => `  ${key.alias ?? key.hash.slice(0, 8)}  ${cap(key.spend, key.limit)}${key.isBlocked ? '  blocked' : ''}`),
    'Teams',
    ...view.teams.map(team => `  ${team.alias ?? team.id}  ${cap(team.spend, team.limit)}`),
    'Spend by model (whole proxy)',
    ...view.models.map(model => `  ${model.model}  ${money(model.spend)}`),
    ...(view.modelCount === null ? [] : [`${view.modelCount} models configured`]),
    ...view.notes,
  ].join('\n')
}

/** For a proxy admin: who spent what, with a button to block a key or give a key or a team more budget. Every press asks first. */
export const adminTab = (ui: Ui, props: DashboardProps, layout: Layout): RenderElement => {
  const { Box, Text, Button } = ui
  const { admin } = props
  const { columns, gap } = layout
  const view = admin?.view ?? null
  const busy = admin?.isLoading === true
  const reload = <Button key="admin-reload" label={busy ? 'Reading…' : 'Reload (l)'} hotkey="l" variant="primary" onPress={props.onAdminLoad} />

  if (view === null) {
    return (
      <Box flexDirection="column" gap={gap}>
        {admin?.failure ? <Text color="error">✗ {admin.failure}</Text> : <Text dimColor>{busy ? 'Reading keys, teams and spend from the proxy…' : 'Not read yet.'}</Text>}
        {reload}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {admin?.failure && <Text color="warning">⚠ Showing the last reading: {admin.failure}</Text>}
      {heading(ui, `Keys · ${view.keyTotal}, top by spend`, columns)}
      {view.keys.map(key => (
        <Box key={`key-${key.hash}`} gap={1}>
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              <Text bold>{truncate(key.alias ?? key.hash.slice(0, 8), 20)}</Text> {cap(key.spend, key.limit)}
              {key.isBlocked ? <Text color="error"> blocked</Text> : ''}
            </Text>
          </Box>
          <Button label={key.isBlocked ? 'Unblock' : 'Block'} plain onPress={() => props.onAdminDo('key', `${key.isBlocked ? 'unblock' : 'block'} ${key.hash}`)} />
          <Button label={`+$${GRANT}`} plain onPress={() => props.onAdminDo('grant', `${GRANT} --key ${key.hash}`)} />
        </Box>
      ))}
      {view.teams.length > 0 && (
        <Box flexDirection="column" marginTop={gap}>
          {heading(ui, 'Teams', columns)}
          {view.teams.map(team => (
            <Box key={`team-${team.id}`} gap={1}>
              <Box flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text bold>{truncate(team.alias ?? team.id, 20)}</Text> {cap(team.spend, team.limit)}
                </Text>
              </Box>
              <Button label={`+$${GRANT}`} plain onPress={() => props.onAdminDo('grant', `${GRANT} --team ${team.id}`)} />
            </Box>
          ))}
        </Box>
      )}
      {view.models.length > 0 && (
        <Box flexDirection="column" marginTop={gap}>
          {heading(ui, `Spend by model, whole proxy${view.modelCount === null ? '' : ` · ${view.modelCount} configured`}`, columns)}
          {view.models.map(model => (
            <Text>
              {truncate(model.model, 34).padEnd(34)} {money(model.spend)}
            </Text>
          ))}
        </Box>
      )}
      {view.notes.map(note => (
        <Text dimColor>· {truncate(note, columns - 2)}</Text>
      ))}
      {admin?.message && <Text color="success">→ {admin.message}</Text>}
      <Box marginTop={gap} gap={2}>
        {reload}
        <Text dimColor>{clock(view.at)}</Text>
      </Box>
    </Box>
  )
}
