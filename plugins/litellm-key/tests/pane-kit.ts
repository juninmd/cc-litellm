import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const PANE = {
  title: 'LiteLLM key',
  isFocused: false,
  bodyColumns: 76,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

/** Draws the pane on a surface, as the engine would, with props to say where and how wide. */
export const mount = <P extends (typeof SURFACES)[number]>($: Engine, surface: P, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: 'litellm-key', surface, component: 'Pane', requestId: 'litellm-key', props: { ...PANE, ...props } as typeof PANE })

export type Reads = { findAll: (query: ElementQuery) => Promise<FoundElement[]> }

export const keysOf = async (ui: Reads) => (await ui.findAll({ type: 'Button' })).map(button => button.key)

export const texts = async (ui: Reads, pattern: RegExp) => (await ui.findAll({ type: 'Text', text: pattern })).map(item => item.text)
