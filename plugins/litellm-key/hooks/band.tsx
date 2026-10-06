import type { Elements } from 'claude-code'

import type { Exceeded } from './exceeded'
import { gauge, money, percent } from './format'

type Ui = Pick<Elements['terminal'], 'Box' | 'Text'>

const BAR = 12

/** The band above the prompt while a budget is spent up: no way to dismiss it, it leaves when the numbers are normal again. */
export const overBudgetBand = ({ Box, Text }: Ui, items: readonly Exceeded[]) => {
  const width = Math.max(...items.map(item => item.label.length))
  const { full } = gauge(1, BAR)

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text bold inverse color="error">
          {' ✖ BUDGET USED UP '}
        </Text>
        <Text bold color="error">
          the proxy rejects requests until it resets or an admin adds budget
        </Text>
      </Box>
      {items.map(item => (
        <Box key={item.label} gap={1} paddingLeft={2}>
          <Box width={width} flexShrink={0}>
            <Text bold>{item.label}</Text>
          </Box>
          <Text color="error">{full}</Text>
          <Text bold color="error">
            {`${percent(item.spend, item.limit) ?? 100}%`.padStart(4)}
          </Text>
          <Text>
            {money(item.spend)} of {money(item.limit)}
            {item.resets ? ` · resets ${item.resets}` : ''}
          </Text>
        </Box>
      ))}
      {items.some(item => item.isGrantable) && (
        <Box paddingLeft={2}>
          <Text>An admin can raise it with /litellm grant &lt;amount&gt;; otherwise it resets as shown.</Text>
        </Box>
      )}
      {items.some(item => !item.isGrantable) && (
        <Box paddingLeft={2}>
          <Text>A member cap is set on the team (team_member_budget) that never resets, and the amount counts this key only: an admin changes the cap there.</Text>
        </Box>
      )}
    </Box>
  )
}
