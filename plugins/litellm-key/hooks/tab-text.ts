import type { Snapshot, ViewName } from '../types'
import { detailsText } from './details'
import { modelsReport } from './report-models'
import { usageReport } from './report-usage'
import { summaryText } from './summary'

/** What a tab needs to say itself as text. */
export type TextOptions = { warnPercent: number; refreshSeconds: number }

/** What a tab says as text: what `/litellm` prints where nothing can draw a pane, and what Copy puts on the clipboard. */
export const textOf = (tab: ViewName, range: number, options: TextOptions): ((snapshot: Snapshot, now: number) => string) => {
  switch (tab) {
    case 'usage':
      return snapshot => usageReport(snapshot, range)
    case 'models':
      return snapshot => modelsReport(snapshot, range)
    case 'details':
      return (snapshot, now) => detailsText(snapshot, now, options.refreshSeconds)
    default:
      return (snapshot, now) => summaryText(snapshot, now, options.warnPercent)
  }
}

/** What each tab is called when a message says what was copied or shared. */
export const TAB_WHAT: Record<ViewName, string> = {
  overview: 'the summary',
  usage: 'the usage report',
  models: 'the model list',
  details: 'the key details',
}
