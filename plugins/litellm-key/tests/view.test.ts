import { describe, expect, test } from 'claude-code/testing'

import type { Row } from '../hooks/summary'
import { packFacts } from '../hooks/view'

const row = (label: string, text: string): Row => ({ label, text, tone: 'ok' })

describe('packFacts', () => {
  test('puts facts side by side while they fit and starts a line when they do not', () => {
    const lines = packFacts([row('Limits', '60 rpm'), row('Expires', 'in 40d'), row('Models', 'a, b')], 30)

    expect(lines.map(line => line.map(item => item.label))).toEqual([['Limits', 'Expires'], ['Models']])
  })

  test('keeps the order and never splits one fact, however long', () => {
    const lines = packFacts([row('Models', 'x'.repeat(50)), row('Expires', 'in 40d')], 20)

    expect(lines.map(line => line.map(item => item.label))).toEqual([['Models'], ['Expires']])
  })

  test('has no lines when there are no facts', () => {
    expect(packFacts([], 80)).toEqual([])
  })
})
