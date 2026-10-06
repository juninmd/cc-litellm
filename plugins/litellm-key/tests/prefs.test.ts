import { describe, expect, test } from 'claude-code/testing'

import { parsePrefs } from '../hooks/prefs'

describe('parsePrefs', () => {
  test('takes what the pane offers: a range, a sort and a metric', () => {
    expect(parsePrefs({ range: 30, sort: 'name', metric: 'tokens' })).toEqual({ range: 30, sort: 'name', metric: 'tokens' })
    expect(parsePrefs({ range: 14 })).toEqual({ range: 14 })
  })

  test('drops what it no longer offers, one choice at a time', () => {
    expect(parsePrefs({ range: 9, sort: 'size', metric: 'joy' })).toEqual({})
    expect(parsePrefs({ range: '14', sort: 'spend', metric: 7 })).toEqual({ sort: 'spend' })
    expect(parsePrefs({ range: 7, sort: 'size', metric: 'requests' })).toEqual({ range: 7, metric: 'requests' })
  })

  test('has nothing to say of what is no object', () => {
    for (const stored of [undefined, null, 'spend', 7, [], [30]]) {
      expect(parsePrefs(stored)).toEqual({})
    }
  })
})
