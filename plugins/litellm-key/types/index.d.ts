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
  keyType: string | null
}

export type Related = {
  id: string
  label: string
  budget: Budget
}

/** What one model did on one day, or over a stretch of days. */
export type UsageModel = {
  model: string
  spend: number
  requests: number
  tokens: number
}

export type UsageDay = {
  /** `YYYY-MM-DD`, in UTC, as the proxy counts days. */
  date: string
  spend: number
  requests: number
  failed: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  models: UsageModel[]
}

/** Every day the proxy was asked about, oldest first and today last; a quiet day is all zeros. */
export type Usage = {
  days: UsageDay[]
}

export type Snapshot = {
  fetchedAt: number
  host: string
  /** The proxy root that answered, without credentials: the page of its admin UI hangs off it. */
  root: string
  keySource: string
  keyHint: string
  key: KeyInfo
  user: Related | null
  team: Related | null
  models: string[] | null
  usage: Usage | null
  notes: string[]
}

export type FailureKind =
  | 'not-configured'
  | 'not-litellm'
  | 'auth'
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

export type ViewName = 'overview' | 'usage' | 'models' | 'details'

export type SortName = 'spend' | 'name'

/** What this key spent while Claude Code has been running, counted from the first reading. */
export type Session = {
  /** When the first reading was taken. */
  since: number
  /** Spend added since then, across budget resets. */
  spend: number
  /** The spend of the latest reading, to tell what is new from what was already there. */
  last: number
}

declare module 'claude-code' {
  interface PluginState {
    'litellm-key': {
      snapshot: Shaped<Snapshot | null>
      failure: Failure | null
      isLoading: boolean
      view: ViewName
      range: number
      sort: SortName
      filter: string
      /** The day picked under the chart of the Usage tab, as `YYYY-MM-DD`. */
      day: string | null
      session: Session | null
    }
  }
}
