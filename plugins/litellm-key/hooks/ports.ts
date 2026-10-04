import type { Failure, Snapshot } from '../types'
import type { EnvName } from './credentials'
import type { Reply } from './litellm'

export type Mode = 'tick' | 'turn' | 'force'

export type Diagnostics = { host: string; roots: string[]; keySource: string; keyHint: string }

export type Init = { method?: string; headers: Record<string, string>; body?: string }

/** What the reading cycle needs from the engine. `$` never leaves register.tsx: the runtime follows it only inside that file. */
export type Ports = {
  now: () => Promise<number>
  env: () => Promise<Partial<Record<EnvName, string>>>
  settings: () => Promise<{ env?: unknown }>
  fetch: (url: string, init: Init, ms?: number) => Promise<Reply>
  loading: (isLoading: boolean) => Promise<void>
  publish: (snapshot: Snapshot | null, failure: Failure | null) => Promise<void>
  status: (text: string | undefined) => void
  toast: (message: string) => void
  remembered: () => Promise<unknown>
  remember: (ids: string[]) => Promise<void>
}
