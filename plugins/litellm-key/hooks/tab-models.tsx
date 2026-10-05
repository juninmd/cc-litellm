import type { RenderElement } from 'claude-code'

import type { Snapshot } from '../types'
import { money, plural, shortMoney, truncate } from './format'
import type { DashboardProps, Layout, Ui } from './parts'
import { noteLines, rangeSelector, shareText } from './parts'
import { modelList } from './summary'

// Rows drawn before the rest are left to the filter: a proxy can serve hundreds of models.
const MAX_ROWS = 60

export const modelsTab = (ui: Ui, props: DashboardProps, snapshot: Snapshot, layout: Layout): RenderElement => {
  const { Box, Text, Button, Input } = ui
  const { columns, gap } = layout
  const list = modelList(snapshot, props.range, props.sort, props.filter)
  const shown = list.rows.slice(0, MAX_ROWS)
  const longest = Math.max(1, ...shown.map(row => row.model.length))
  const nameWidth = Math.min(34, longest, Math.max(12, Math.floor(columns * 0.36)))
  const barWidth = Math.max(6, Math.min(20, columns - nameWidth - 2 - 7 - 34))
  const isFiltered = props.filter.trim() !== ''

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" flexWrap="wrap" columnGap={2}>
        <Text bold>
          {isFiltered ? `${list.rows.length} of ${plural(list.total, 'model')}` : plural(list.total, 'model')}
        </Text>
        <Box gap={2}>
          {rangeSelector(ui, props)}
          <Button
            key="sort"
            label={`sort: ${props.sort}`}
            hotkey="s"
            plain
            onPress={() => {
              props.onSort(props.sort === 'spend' ? 'name' : 'spend')
            }}
          />
        </Box>
      </Box>
      {Input && props.hasField && (
        <Box marginTop={gap}>
          <Button key="filter-focus" label="Filter" hotkey="f" plain onPress={props.onFocusFilter} />
          <Text> </Text>
          {/* Enter clears what is typed, so a filter that is on shows in the field in the place of its hint. */}
          <Input
            key="filter"
            placeholder={isFiltered ? props.filter.trim() : 'type to narrow the list'}
            value={props.filter}
            submitLabel="done"
            onInput={value => {
              props.onFilter(value)
            }}
            onSubmit={value => {
              props.onFilter(value)
            }}
          />
          {isFiltered && (
            <Box marginLeft={2}>
              <Button
                key="filter-clear"
                label="clear"
                hotkey="x"
                plain
                onPress={() => {
                  props.onFilter('')
                }}
              />
            </Box>
          )}
        </Box>
      )}
      <Box flexDirection="column" marginTop={gap}>
        {shown.length === 0 ? (
          <Text dimColor>
            {isFiltered
              ? `No model matches "${truncate(props.filter.trim(), 30)}".`
              : list.isOpen
                ? 'The key can call every model the proxy serves, and the proxy did not list them.'
                : 'No models.'}
          </Text>
        ) : (
          shown.map(row => {
            const isUsed = row.spend > 0 || row.requests > 0

            return (
              <Box>
                <Box width={nameWidth + 2} flexShrink={0}>
                  <Text bold={isUsed} dimColor={!isUsed}>
                    {truncate(row.model, nameWidth)}
                  </Text>
                </Box>
                <Box width={barWidth + 7} flexShrink={0}>
                  {isUsed ? shareText(ui, row.share, barWidth) : <Text> </Text>}
                </Box>
                <Box flexShrink={1}>
                  <Text dimColor wrap="truncate-end">
                    {isUsed ? `${money(row.spend)} · ${plural(row.requests, 'request')}` : 'no use'}
                    {row.budget !== null && row.budget.limit !== null
                      ? ` · cap ${shortMoney(row.budget.limit)}${row.budget.period ? `/${row.budget.period}` : ''}`
                      : ''}
                  </Text>
                </Box>
              </Box>
            )
          })
        )}
        {list.rows.length > MAX_ROWS && (
          <Text dimColor>+{list.rows.length - MAX_ROWS} more: type in the filter to narrow the list</Text>
        )}
      </Box>
      {!list.hasUsage && list.rows.length > 0 && (
        <Box marginTop={gap}>
          <Text dimColor>No usage history, so no amounts: turn show_usage on, or the key has no user.</Text>
        </Box>
      )}
      {noteLines(ui, snapshot.notes)}
    </Box>
  )
}
