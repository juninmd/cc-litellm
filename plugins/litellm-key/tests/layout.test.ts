import { describe, expect, test } from 'claude-code/testing'

import { COMPACT_MIN, WIDE, layoutOf } from '../hooks/parts'
import { modelColumns } from '../hooks/tab-usage'

// The pane's frame takes 4 columns: a body of WIDE is a terminal of 122, a body of COMPACT_MIN one of 74.
const at = (columns: number, patch: { placement?: 'dock' | 'inline'; isCompact?: boolean } = {}) =>
  layoutOf({ columns, placement: 'inline', isCompact: false, ...patch })

describe('layoutOf', () => {
  test('keeps the thresholds the README tells', () => {
    expect(WIDE).toBe(118)
    expect(COMPACT_MIN).toBe(70)
  })

  test('puts the meters in a table from WIDE columns, wherever the pane sits', () => {
    expect(at(WIDE - 1).isWide).toBe(false)
    expect(at(WIDE).isWide).toBe(true)
    expect(at(WIDE, { placement: 'dock' }).isWide).toBe(true)
    expect(at(WIDE - 1, { placement: 'dock' }).isWide).toBe(false)
  })

  test('is compact only when asked, inline, and between COMPACT_MIN and the table', () => {
    expect(at(COMPACT_MIN - 1, { isCompact: true }).isCompact).toBe(false)
    expect(at(COMPACT_MIN, { isCompact: true }).isCompact).toBe(true)
    expect(at(WIDE - 1, { isCompact: true }).isCompact).toBe(true)
    expect(at(WIDE, { isCompact: true }).isCompact).toBe(false)
    expect(at(90, { isCompact: true, placement: 'dock' }).isCompact).toBe(false)
    expect(at(90).isCompact).toBe(false)
  })

  test('leaves no blank rows between blocks only when compact', () => {
    expect(at(90, { isCompact: true }).gap).toBe(0)
    expect(at(90).gap).toBe(1)
    expect(at(WIDE).gap).toBe(1)
  })
})

describe('modelColumns', () => {
  test('keeps the room a list without arrows always had', () => {
    expect(modelColumns(76, 17, false)).toEqual({ nameWidth: 17, barWidth: 24, textWidth: 26 })
  })

  test('takes the cells an arrow needs from the bar, so that "$10.65 ▲ 250% · 113 requests" is not cut', () => {
    const { textWidth, barWidth } = modelColumns(76, 17, true)

    expect(barWidth).toBe(20)
    expect(textWidth).toBeGreaterThanOrEqual('$10.65 ▲ 250% · 113 requests'.length)
  })

  test('gives the amounts the same room whatever the name, while the bar can still give way', () => {
    for (const longest of [8, 17, 26, 40]) {
      const { textWidth } = modelColumns(76, longest, true)

      expect(textWidth).toBeGreaterThanOrEqual(26)
    }
  })

  test('never lets the bar be thinner than six cells, nor the name wider than a third of the pane', () => {
    for (const columns of [30, 50, 76, 120]) {
      const { nameWidth, barWidth } = modelColumns(columns, 60, true)

      expect(barWidth).toBeGreaterThanOrEqual(6)
      expect(nameWidth).toBeLessThanOrEqual(Math.max(10, Math.floor(columns * 0.3)))
    }
  })
})
