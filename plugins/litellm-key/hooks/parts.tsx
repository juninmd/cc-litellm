import type { Elements } from 'claude-code'

import { gauge, money, rule, truncateMiddle, usedShare } from './format'
import type { Variant } from './layout'
import { MARK_WIDTH, readingWidth } from './layout'
import type { Meter, Tone } from './summary'

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'> & {
  /** Every surface's table has one, but only some draw it (see `hasField`). */
  Input?: Elements['terminal']['Input']
}

type Tint = { color?: string; dimColor?: boolean }

// Theme keys, not raw colors: the host's theme decides the exact shades, so a light and a dark terminal both stay legible.
export const tint = (tone: Tone): Tint =>
  tone === 'warn' ? { color: 'warning' } : tone === 'error' ? { color: 'error' } : {}

export const barTint = (tone: Tone): Tint => (tone === 'ok' ? { color: 'success' } : tint(tone))

/** Color is never the only signal: a mark sits beside every number that is not fine. */
const MARK: Record<Tone, string> = { ok: ' ', warn: '▲', error: '✖' }
// Past this the share reads "999%+": the column is four cells wide, and a fifth would touch the amounts.
const SHARE_MAX = 999

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
  variant: Variant
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
      <Text bold>{truncateMiddle(meter.label, labelWidth)}</Text>
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

export type ModelShare = { model: string; spend: number; share: number }

/** A share bar: slim, in the default color (it compares parts, it does not judge them), over a dim track. */
const Rule = ({ Box, Text }: Ui, fraction: number, width: number) => {
  const { full, track } = rule(fraction, width)

  return (
    <Box flexShrink={0}>
      {full !== '' && <Text>{full}</Text>}
      {track !== '' && <Text dimColor>{track}</Text>}
    </Box>
  )
}

/** A model's week: name, a share bar, the share, and the amount. */
export const ModelRow = (
  ui: Ui,
  item: ModelShare,
  layout: { labelWidth: number; barWidth: number; isOneLine: boolean },
) => {
  const { Box, Text } = ui
  const amount = <Text bold>{money(item.spend)}</Text>
  const head = (
    <Box>
      <Box width={MARK_WIDTH} flexShrink={0}>
        <Text> </Text>
      </Box>
      <Box width={layout.labelWidth + 1} flexShrink={0}>
        <Text bold>{truncateMiddle(item.model, layout.labelWidth)}</Text>
      </Box>
      <Box gap={1} flexShrink={0}>
        {Rule(ui, item.share / 100, layout.barWidth)}
        <Text bold>{`${item.share}%`.padStart(4)}</Text>
      </Box>
      {layout.isOneLine && (
        <Box paddingLeft={1} flexShrink={0}>
          {amount}
        </Box>
      )}
    </Box>
  )

  return layout.isOneLine ? (
    head
  ) : (
    <Box flexDirection="column">
      {head}
      <Box paddingLeft={MARK_WIDTH}>{amount}</Box>
    </Box>
  )
}
