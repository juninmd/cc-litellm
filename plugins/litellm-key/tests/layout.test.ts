import { describe, expect, test } from 'claude-code/testing'

import { COMPACT_MIN, WIDE, layoutOf } from '../hooks/parts'

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
