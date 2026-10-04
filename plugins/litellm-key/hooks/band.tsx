import type { Elements } from 'claude-code'

type Ui = Pick<Elements['terminal'], 'Box' | 'Text'>

/** The band above the prompt while a budget is spent up: no way to dismiss it, it leaves when the numbers are normal again. */
export const overBudgetBand = ({ Box, Text }: Ui, lines: readonly string[]) => (
  <Box flexDirection="column">
    <Text color="error" bold>
      ⛔ Budget used up: the proxy rejects requests until it resets or an admin adds budget
    </Text>
    {lines.map(line => (
      <Text key={line} color="error">
        {'  '}
        {line}
      </Text>
    ))}
  </Box>
)
