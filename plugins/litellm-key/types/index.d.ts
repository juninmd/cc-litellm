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

/** What one model did on one day, or over a stretch of days. */
export type UsageModel = {
  model: string
  spend: number
  requests: number
  tokens: number
}

/** What the key did on one day: a quiet day is all zeros. */
export type ActivityDay = {
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

/** The last 7 days in totals, and the last 30 day by day (oldest first, today last). */
export type Usage = {
  days: UsageDay[]
  spend: number
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  topModels: { model: string; spend: number }[]
  history: ActivityDay[]
}

/** What the proxy says about itself on its health endpoint, in the words it uses. */
export type ProxyInfo = {
  version: string | null
  /** `connected`, or whatever the proxy says when it has no database. */
  db: string | null
}

/** What this Claude Code session has spent: the readings' growth, counted here and never read from the proxy. */
export type SessionSpend = {
  /** When the first reading of this session was made. */
  since: number
  spend: number
  /** The highest spend the readings showed since a reset, to tell what a new reading adds. */
  last: number
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
  /** The user's proxy role (proxy_admin, internal_user…), known even when the user has no budget cap. */
  userRole: string | null
  team: Related | null
  /** The per-member cap of the team (team_member_budget), for the key's user. */
  member: Related | null
  models: string[] | null
  /** Prices of the allowed models, by name; null when the proxy does not say. */
  prices: Record<string, ModelPrice> | null
  usage: Usage | null
  /** Read now and then, and only when the proxy answers: nothing here is worth a note when it does not. */
  proxy: ProxyInfo | null
  /** How long `/key/info` took to answer, when the reading could tell. */
  latencyMs: number | null
  session: SessionSpend | null
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

/** The tabs of the pane. */
export type ViewName = 'overview' | 'usage' | 'models' | 'details' | 'ping'

/** What the Ping tab shows: the last round of probes, the times of the rounds before it, and whether one is running. */
export type PingState = {
  host: string
  root: string
  at: number
  probes: { path: string; status: number | null; ms: number | null; ok: boolean; detail: string }[]
  /** The time of `/key/info` in each of the last rounds, oldest first. */
  history: number[]
  /** Why the last round could not run at all (no credentials), or null. */
  failure: string | null
  isRunning: boolean
}

/** What the usage chart counts per day. */
export type MetricName = 'spend' | 'requests' | 'tokens'

/** How the model list is ordered. */
export type SortName = 'spend' | 'name'

declare module 'claude-code' {
  interface PluginState {
    'litellm-key': {
      snapshot: Snapshot | null
      failure: Failure | null
      isLoading: boolean
      /** The tab the pane shows. */
      view: ViewName
      /** Days of usage the Usage and Models tabs show: 7, 14 or 30. */
      range: number
      sort: SortName
      metric: MetricName
      /** What the Models tab narrows its list by. */
      filter: string
      /** The day picked under the chart of the Usage tab, as `YYYY-MM-DD`. */
      day: string | null
      ping: PingState | null
    }
  }
}
