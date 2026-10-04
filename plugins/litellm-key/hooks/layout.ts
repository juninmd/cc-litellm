export type Placement = 'dock' | 'inline'
export type Variant = 'table' | 'stacked' | 'compact'

/** Body columns from which the meters sit in a table, one line each. */
const WIDE = 118
// Fewest body columns the compact layout serves: a meter needs its label, its bar and the amounts on one line.
const COMPACT_MIN = 70
const COMPACT_BAR = 10
const COMPACT_LABEL = 22
const TABLE_BAR = 18
const STACKED_BAR = { min: 8, max: 30 }
const LABEL = { min: 4, max: 24 }
/** The mark's column, and the room every layout leaves for it. */
export const MARK_WIDTH = 2
const GAP = 1
// A meter's share reads up to "999%+"; a model's stops at "100%".
const SHARE_WIDEST = 5
const SHARE_MODEL = 4

/** Bar, a gap, the share, and a gap before the amounts. */
export const readingWidth = (barWidth: number): number => barWidth + GAP + SHARE_WIDEST + GAP

// Where the compact layout can serve: inline above the prompt, where rows are scarce (the pane shrinks to its content,
// never past what the layout spares) and the table has no room, below WIDE. Narrower than COMPACT_MIN a meter's text
// would not fit beside its bar, so the stacked layout, with the text on a line of its own, serves better there.
export const isCompactAt = (placement: Placement, columns: number, isCompact: boolean): boolean =>
  isCompact && placement === 'inline' && columns >= COMPACT_MIN && columns < WIDE

export type Geometry = { variant: Variant; labelWidth: number; barWidth: number }

/** Which layout serves `columns`, and the widths of its label and bar. `longest` is the widest label the rows carry. */
export const geometryOf = (input: {
  columns: number
  placement: Placement
  isCompact: boolean
  /** The widest meter label. */
  longest: number
  /** The widest label of the rows under the meters. */
  longestFact: number
}): Geometry => {
  const { columns, longest } = input

  if (isCompactAt(input.placement, columns, input.isCompact)) {
    // Marks and labels take about a quarter of the width, so the amounts keep the rest.
    const quarter = Math.floor(columns * 0.27) - MARK_WIDTH

    return { variant: 'compact', labelWidth: Math.min(COMPACT_LABEL, Math.max(10, quarter), longest), barWidth: COMPACT_BAR }
  }
  const wanted = Math.min(LABEL.max, Math.max(8, longest, input.longestFact))

  if (columns >= WIDE) {
    return { variant: 'table', labelWidth: wanted, barWidth: TABLE_BAR }
  }
  // Mark, label and the shortest bar with its share must share one line, however narrow the pane.
  const labelRoom = columns - MARK_WIDTH - 1 - STACKED_BAR.min - GAP - SHARE_WIDEST
  const labelWidth = Math.max(LABEL.min, Math.min(wanted, labelRoom))

  return {
    variant: 'stacked',
    labelWidth,
    barWidth: Math.max(STACKED_BAR.min, Math.min(STACKED_BAR.max, columns - labelWidth - 11)),
  }
}

// A share bar needs no more than this: it compares parts, it does not measure a cap.
const MODEL_BAR = { min: 6, max: 16 }
// The widest amount a week of one model is likely to cost: "$1,234.56".
const AMOUNT_WIDTH = 9

/** The share bar of a model row, and whether the amount fits on the same line or goes under. */
export const modelPlan = (columns: number, geometry: Geometry): { barWidth: number; isOneLine: boolean } => {
  // Mark, label, bar, a gap, the share, a gap and the amount.
  const room = columns - MARK_WIDTH - (geometry.labelWidth + 1) - GAP - SHARE_MODEL - GAP - AMOUNT_WIDTH
  const barWidth = Math.min(geometry.barWidth, MODEL_BAR.max)

  return room >= MODEL_BAR.min
    ? { barWidth: Math.min(barWidth, room), isOneLine: true }
    : { barWidth, isOneLine: false }
}

const BUTTON_GAP = 1
const FOOTER_GAP = 2

/** A terminal button is drawn `[ label ]`. */
export const buttonsWidth = (labels: readonly string[]): number =>
  labels.reduce((sum, label) => sum + label.length + 4, 0) + BUTTON_GAP * Math.max(0, labels.length - 1)

/**
 * The compact footer: buttons and status on one row when they fit, with the shorter status before giving up and
 * putting the status under the buttons, where it always fits.
 */
export const footerPlan = (columns: number, buttons: number, full: string, short: string): 'row' | 'row-short' | 'column' => {
  if (buttons + FOOTER_GAP + full.length <= columns) {
    return 'row'
  }

  return buttons + FOOTER_GAP + short.length <= columns ? 'row-short' : 'column'
}
