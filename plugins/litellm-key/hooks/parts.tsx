import type { Elements } from 'claude-code'

import { gauge, truncate, usedShare } from './format'
import type { Meter, Tone } from './summary'

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

type Tint = { color?: string; dimColor?: boolean }

// Theme keys, not raw colors: the host's theme decides the exact shades, so a light and a dark terminal both stay legible.
export const tint = (tone: Tone): Tint =>
  tone === 'warn' ? { color: 'warning' } : tone === 'error' ? { color: 'error' } : {}

export const barTint = (tone: Tone): Tint => (tone === 'ok' ? { color: 'success' } : tint(tone))

/** Color is never the only signal: a mark sits beside every number that is not fine. */
const MARK: Record<Tone, string> = { ok: ' ', warn: '▲', error: '✖' }
/** The mark's column, and the room every layout leaves for it. */
export const MARK_WIDTH = 2
// Past this the share reads "999%+": the column is four cells wide, and a fifth would touch the amounts.
const SHARE_MAX = 999
// Bar, a gap, the share (four cells, five for "999%+"), and a gap before the amounts.
const readingWidth = (barWidth: number): number => barWidth + 7

/** The bar: the filled part in the tone's color, the track dim, so 0% reads as empty and 100% as full. */
const Gauge = ({ Box, Text }: Ui, fraction: number, width: number, tone: Tone) => {
  const { full, track } = gauge(fraction, width)

  return (
    <Box flexShrink={0}>
      {full !== '' && <Text {...barTint(tone)}>{full}</Text>}
      {track !== '' && <Text dimColor>{track}</Text>}
    </Box>
  )
}

/** A title and a hairline to the edge: the sections of the roomy pane. */
export const SectionTitle = ({ Box, Text }: Ui, title: string, columns: number) => (
  <Box marginTop={1}>
    <Text bold>{title}</Text>
    <Text dimColor> {'─'.repeat(Math.max(0, columns - title.length - 1))}</Text>
  </Box>
)

/** A solid chip: bold, reversed, in the tone's color; the word carries the meaning, the color only underlines it. */
export const Pill = ({ Text }: Ui, text: string, tone: Tone) => (
  <Text bold inverse {...barTint(tone)}>
    {` ${text} `}
  </Text>
)

export type MeterLayout = {
  variant: 'table' | 'stacked' | 'compact'
  labelWidth: number
  barWidth: number
  columns: number
}

/** A meter: label, bar, percentage, and the amounts. One line in a table or compact, two when stacked. */
export const MeterRow = (ui: Ui, meter: Meter, layout: MeterLayout) => {
  const { Box, Text } = ui
  const { variant, labelWidth, barWidth, columns } = layout
  const pct = usedShare(meter.used, meter.limit)
  const label = (
    <Box width={labelWidth + 1} flexShrink={0}>
      <Text bold>{truncate(meter.label, labelWidth)}</Text>
    </Box>
  )
  const mark = (
    <Box width={MARK_WIDTH} flexShrink={0}>
      <Text {...tint(meter.tone)}>{MARK[meter.tone]}</Text>
    </Box>
  )
  const reading =
    pct === null ? (
      <Text italic>no cap</Text>
    ) : (
      <Box gap={1} flexShrink={0}>
        {Gauge(ui, pct / 100, barWidth, meter.tone)}
        <Text bold {...barTint(meter.tone)}>
          {(pct > SHARE_MAX ? `${SHARE_MAX}%+` : `${pct}%`).padStart(4)}
        </Text>
      </Box>
    )

  if (variant === 'compact') {
    const room = columns - MARK_WIDTH - (labelWidth + 1) - readingWidth(barWidth)

    return (
      <Box>
        {mark}
        {label}
        <Box width={readingWidth(barWidth)} flexShrink={0}>
          {reading}
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{meter.text.length <= room ? meter.text : meter.brief}</Text>
        </Box>
      </Box>
    )
  }

  return variant === 'table' ? (
    <Box>
      {mark}
      {label}
      <Box width={readingWidth(barWidth)} flexShrink={0}>
        {reading}
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text {...tint(meter.tone)}>{meter.detail}</Text>
      </Box>
    </Box>
  ) : (
    <Box flexDirection="column">
      <Box>
        {mark}
        {label}
        {reading}
      </Box>
      <Box paddingLeft={2}>
        <Text {...tint(meter.tone)}>{meter.detail}</Text>
      </Box>
    </Box>
  )
}
