import type { PluginOptions } from 'claude-code'

import type { EnvName, Sources } from './credentials'
import { isObject } from './json'

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export const configOf = (options: PluginOptions) => ({
  url: text(options.litellm_url),
  key: text(options.litellm_key),
  adminKey: text(options.litellm_admin_key),
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
  settings: () => Promise<{ env?: unknown }>
}

/** The process environment and the env block of settings.json, as resolveCredentials wants them. */
export const sourcesOf = async (config: Config, read: SourceReaders): Promise<Sources> => {
  let block: Record<string, unknown> = {}

  try {
    const settings = await read.settings()

    block = isObject(settings.env) ? settings.env : {}
  } catch {
    block = {}
  }
  const settingsEnv: Sources['settingsEnv'] = {}

  for (const name of ENV_NAMES) {
    const fromSettings = block[name]

    settingsEnv[name] = typeof fromSettings === 'string' ? fromSettings : undefined
  }
  const env = await read.env()

  return { url: config.url, key: config.key, env, settingsEnv }
}
