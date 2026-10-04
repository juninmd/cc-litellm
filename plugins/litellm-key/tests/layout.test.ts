import { describe, expect, test } from 'claude-code/testing'

import type { Placement } from '../hooks/layout'
import { MARK_WIDTH, buttonsWidth, footerPlan, geometryOf, isCompactAt, modelPlan, readingWidth } from '../hooks/layout'

const COLUMNS = Array.from({ length: 371 }, (_, index) => 30 + index)
const PLACEMENTS: Placement[] = ['dock', 'inline']
// A meter's share is up to five cells ("999%+") and a model's four ("100%"); a gap sits before each.
const SHARE = 5
const MODEL_SHARE = 4

const geometry = (columns: number, placement: Placement, isCompact: boolean, longest = 30, longestFact = 11) =>
  geometryOf({ columns, placement, isCompact, longest, longestFact })

describe('geometryOf', () => {
  test('picks the layout from where the pane sits and how wide it is', () => {
    expect(geometry(70, 'inline', true).variant).toBe('compact')
    expect(geometry(117, 'inline', true).variant).toBe('compact')
    expect(geometry(118, 'inline', true).variant).toBe('table')
    expect(geometry(69, 'inline', true).variant).toBe('stacked')
    expect(geometry(100, 'inline', false).variant).toBe('stacked')
    expect(geometry(100, 'dock', true).variant).toBe('stacked')
    expect(isCompactAt('inline', 80, true)).toBe(true)
    expect(isCompactAt('inline', 80, false)).toBe(false)
  })

  test('the mark, the label and the bar with its share fit on one line at every width from 30 to 400', () => {
    for (const columns of COLUMNS) {
      for (const placement of PLACEMENTS) {
        for (const isCompact of [true, false]) {
          const { variant, labelWidth, barWidth } = geometry(columns, placement, isCompact)
          const line =
            variant === 'stacked'
              ? MARK_WIDTH + labelWidth + 1 + barWidth + 1 + SHARE
              : MARK_WIDTH + labelWidth + 1 + readingWidth(barWidth)

          expect(line, `${variant} at ${columns} ${placement}`).toBeLessThanOrEqual(columns)
          expect(labelWidth).toBeGreaterThanOrEqual(4)
          expect(labelWidth).toBeLessThanOrEqual(24)
        }
      }
    }
  })

  test('a narrow pane gives the label what is left, a roomy one the label it wants', () => {
    expect(geometry(30, 'dock', false).labelWidth).toBe(13)
    expect(geometry(76, 'dock', false, 17, 11).labelWidth).toBe(17)
    expect(geometry(76, 'dock', false, 40, 11).labelWidth).toBe(24)
    expect(geometry(76, 'dock', false, 3, 3).labelWidth).toBe(8)
  })
})

describe('modelPlan', () => {
  test('each model line, the amount included, fits where it claims to be one line, and its head fits where it is two', () => {
    for (const columns of COLUMNS) {
      const stacked = geometry(columns, 'dock', false)
      const { barWidth, isOneLine } = modelPlan(columns, stacked)
      const head = MARK_WIDTH + stacked.labelWidth + 1 + barWidth + 1 + MODEL_SHARE

      expect(head, `head at ${columns}`).toBeLessThanOrEqual(columns)
      if (isOneLine) {
        expect(head + 1 + 9, `line at ${columns}`).toBeLessThanOrEqual(columns)
        expect(barWidth).toBeGreaterThanOrEqual(6)
      }
    }
  })

  test('a roomy pane keeps the amount on the line, a narrow one puts it under', () => {
    expect(modelPlan(76, geometry(76, 'dock', false)).isOneLine).toBe(true)
    expect(modelPlan(140, geometry(140, 'dock', false)).isOneLine).toBe(true)
    expect(modelPlan(36, geometry(36, 'dock', false)).isOneLine).toBe(false)
  })
})

describe('footerPlan', () => {
  const buttons = buttonsWidth(['Refresh (r)', 'Copy (c)', 'Close (q)'])
  const full = 'Updated 12:00:00 · every 30s · refreshing…'
  const short = 'Updated 12:00:00 · refreshing…'

  test('a button is its label in brackets, and the row adds a gap between them', () => {
    expect(buttons).toBe(15 + 1 + 12 + 1 + 13)
    expect(buttonsWidth([])).toBe(0)
  })

  test('shortens the status before it gives the row up, and never needs more than the columns it has', () => {
    expect(footerPlan(86, buttons, full, short)).toBe('row')
    expect(footerPlan(85, buttons, full, short)).toBe('row-short')
    expect(footerPlan(74, buttons, full, short)).toBe('row-short')
    // 70 to 73 columns while refreshing: the status does not fit beside the buttons, so it goes under them
    for (const columns of [70, 71, 72, 73]) {
      expect(footerPlan(columns, buttons, full, short)).toBe('column')
    }
    for (const columns of COLUMNS.filter(value => value >= 70)) {
      const plan = footerPlan(columns, buttons, full, short)
      const width = plan === 'row' ? buttons + 2 + full.length : plan === 'row-short' ? buttons + 2 + short.length : Math.max(buttons, full.length)

      expect(width, `${plan} at ${columns}`).toBeLessThanOrEqual(columns)
    }
  })
})
