export type Budget = {
  spend: number
  limit: number | null
  softLimit: number | null
  duration: string | null
  resetAt: number | null
}

export type BudgetWindow = {
  duration: string
  spend: number | null
  limit: number
  resetAt: number | null
}

export type ModelBudget = {
  model: string
  spend: number
  limit: number | null
  period: string | null
}

export type KeyStatus = 'active' | 'expired' | 'revoked' | 'deleted' | 'unknown'

export type Limits = {
  rpm: number | null
  tpm: number | null
  tpd: number | null
  parallel: number | null
}

export type KeyInfo = {
  alias: string | null
  keyName: string | null
  keyHash: string | null
  status: KeyStatus
  budget: Budget
  lifetimeSpend: number | null
  windows: BudgetWindow[]
  modelBudgets: ModelBudget[]
  limits: Limits
  models: string[]
  expiresAt: number | null
  createdAt: number | null
  lastActiveAt: number | null
  userId: string | null
  teamId: string | null
  organizationId: string | null
  keyType: string | null
}

export type Related = {
  id: string
  label: string
  budget: Budget
  /** True when `budget.spend` is a lower bound: the proxy does not report the real figure to a virtual key. */
  isFloor?: boolean
}

/** Dollars per million tokens, and the context window, of one model the key can call. */
export type ModelPrice = {
  input: number | null
  output: number | null
  context: number | null
}

export type UsageDay = {
  date: string
  spend: number
}

export type Usage = {
  days: UsageDay[]
  spend: number
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  topModels: { model: string; spend: number }[]
}

export type Snapshot = {
  fetchedAt: number
  host: string
  keySource: string
  keyHint: string
  key: KeyInfo
  user: Related | null
  /** The user's proxy role (proxy_admin, internal_user…), known even when the user has no budget cap. */
  userRole: string | null
  team: Related | null
  /** The per-member cap of the team (team_member_budget), for the key's user. */
  member: Related | null
  models: string[] | null
  /** Prices of the allowed models, by name; null when the proxy does not say. */
  prices: Record<string, ModelPrice> | null
  usage: Usage | null
  notes: string[]
}

export type FailureKind =
  | 'not-configured'
  | 'not-litellm'
  | 'auth'
  | 'blocked'
  | 'expired'
  | 'forbidden'
  | 'not-found'
  | 'db'
  | 'rate-limit'
  | 'network'
  | 'http'

export type Failure = {
  kind: FailureKind
  message: string
  hint: string | null
  status: number | null
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'litellm-key': {
      snapshot: Snapshot | null
      failure: Failure | null
      isLoading: boolean
    }
  }
}
