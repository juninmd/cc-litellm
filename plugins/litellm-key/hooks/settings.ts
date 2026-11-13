import type { PluginOptions } from 'claude-code'

import type { AuthSource, EnvName, Sources } from './credentials'
import { authSourceOf, resolveCredentials } from './credentials'
import type { Run } from './helper'
import { helperKey } from './helper'
import { isObject } from './json'

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export const configOf = (options: PluginOptions) => ({
  url: text(options.litellm_url),
  key: text(options.litellm_key),
  adminKey: text(options.litellm_admin_key),
  authSource: authSourceOf(text(options.auth_source)) as AuthSource | null,
  refreshSeconds: Math.round(bounded(options.refresh_seconds, 60, 15, 3600)),
  warnPercent: Math.round(bounded(options.warn_percent, 80, 1, 99)),
  // Dollars a day, to the cent; zero is off.
  dailyAlert: Math.round(bounded(options.daily_alert, 0, 0, 1_000_000) * 100) / 100,
  isToastShown: options.show_toasts !== false,
  isStatusShown: options.show_status_line !== false,
  isRelatedShown: options.show_related !== false,
  isUsageShown: options.show_usage !== false,
  isCompact: options.compact_pane === true,
})

export type Config = ReturnType<typeof configOf>

const ENV_NAMES: readonly EnvName[] = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_CUSTOM_HEADERS',
  'LITELLM_PROXY_API_BASE',
  'LITELLM_PROXY_API_KEY',
]

export type SourceReaders = {
  env: () => Promise<Partial<Record<EnvName, string>>>
  settings: () => Promise<{ env?: unknown; apiKeyHelper?: unknown }>
  /** Runs a command; without it the `apiKeyHelper` is not read. */
  run?: Run
  chosen?: () => Promise<unknown>
  now?: () => Promise<number>
}

/** The process environment and the env block of settings.json, as resolveCredentials wants them. */
/** `isAll` runs the helper even when another source has a key: `/litellm auth` tests every source. */
export const sourcesOf = async (config: Config, read: SourceReaders, isAll = false): Promise<Sources> => {
  let block: Record<string, unknown> = {}
  let command: string | null = null

  try {
    const settings = await read.settings()

    block = isObject(settings.env) ? settings.env : {}
    command = text(settings.apiKeyHelper)
  } catch {
    block = {}
  }
  const settingsEnv: Sources['settingsEnv'] = {}

  for (const name of ENV_NAMES) {
    const fromSettings = block[name]

    settingsEnv[name] = typeof fromSettings === 'string' ? fromSettings : undefined
  }
  const env = await read.env()

  // What `/litellm auth use` stored wins over the option; `auto` there means the first with a key, on purpose.
  const stored = await read.chosen?.().catch(() => undefined)
  const prefer = stored === 'auto' ? null : (authSourceOf(stored) ?? config.authSource)
  const sources: Sources = { url: config.url, key: config.key, env, settingsEnv, prefer }

  // Claude Code tries the helper after the environment keys: run it only when nothing before it has a key.
  if (command && read.run && read.now) {
    const now = await read.now()

    if (isAll || !resolveCredentials(sources, now).ok) {
      const helped = await helperKey(command, read.run, now)

      return 'key' in helped ? { ...sources, helperKey: helped.key } : { ...sources, helperError: helped.error }
    }
  }

  return sources
}
