import type { Admin, Budgeted } from './admin'
import { listKeys, readFallbacks, resolveKey } from './admin'
import { readTarget } from './admin-targets'
import { applyBudget, deleteKey, generateKey, setBlocked } from './admin-writes'
import { fallbacksText, keyBody, keyPreview, keysText, parseNewKey, planGrant, unknownFlags } from './admin-plan'
import type { Parsed } from './args'
import { parseArgs, parseMoney } from './args'
import { maskKey, money } from './format'

export type Deps = {
  admin: Admin
  /** SHA-256 of the key Claude Code uses, when the last reading found it. */
  ownHash: string | null
  ownUserId: string | null
  /** Drawing surfaces of the session: none means headless, with no dialog and no clipboard. */
  surfaces: readonly string[]
  now: number
  ask: (question: string, options: string[]) => Promise<string>
  copy: (text: string) => Promise<boolean>
}

export type Result = { text: string; isChanged: boolean }
export type AdminCommand = 'keys' | 'key' | 'grant' | 'fallbacks'

const BOOLEANS = new Set(['yes', 'dry-run', 'reveal', 'set', 'all'])
const done = (text: string, isChanged = false): Result => ({ text, isChanged })

export const KEY_HELP = [
  '/litellm key new <alias> [--budget 10 --every 30d --models a,b --rpm 60 --tpm 100000 --expires 30d --user ID --team ID]',
  '/litellm key block <alias|hash>',
  '/litellm key unblock <alias|hash>',
].join('\n')

export const GRANT_HELP =
  '/litellm grant <amount> [--key <alias|hash> | --user <id> | --team <id|alias>] [--set] [--dry-run] [--yes]'

const copied = async (deps: Deps, secret: string): Promise<boolean> => {
  try {
    return await deps.copy(secret)
  } catch {
    return false // a clipboard that throws is one that refuses: the key must not stay behind
  }
}

/** Shows the preview and gets a yes: --yes, else the engine's dialog; --dry-run, no dialog and a failed dialog all stop here. */
const confirmed = async (deps: Deps, parsed: Parsed, preview: readonly string[], verb: string): Promise<string | null> => {
  const shown = preview.join('\n')

  if (parsed.flags['dry-run'] === true) {
    return `${shown}\n(dry run: nothing changed)`
  }
  if (parsed.flags.yes === true) {
    return null
  }
  if (deps.surfaces.length > 0) {
    try {
      return (await deps.ask(`${shown}\n\n${verb}?`, ['Apply', 'Cancel'])) === 'Apply' ? null : `${shown}\nCancelled: nothing changed.`
    } catch {
      // dismissed or no one to ask: fall through to the preview
    }
  }

  return `${shown}\nNothing changed yet. Run it again with --yes to apply.`
}

const keys = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const bad = unknownFlags(parsed, ['user', 'team', 'all'])

  if (bad) {
    return done(bad)
  }
  const teamId = typeof parsed.flags.team === 'string' ? parsed.flags.team : null
  const userId = teamId
    ? null
    : typeof parsed.flags.user === 'string'
      ? parsed.flags.user
      : parsed.flags.all === true
        ? null
        : deps.ownUserId
  const scope = teamId ? `team ${teamId}` : userId ? `user ${userId}` : 'all keys'
  const found = await listKeys(deps.admin, { userId, teamId })

  return done(found.ok ? keysText(found.value.rows, found.value.total, scope, deps.now) : found.message)
}

const keyNew = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const key = parseNewKey({ ...parsed, positional: parsed.positional.slice(1) })

  if (!key.ok) {
    return done(key.message)
  }
  const isReveal = parsed.flags.reveal === true

  if (deps.surfaces.length === 0 && !isReveal) {
    return done('There is no clipboard here to hand the new key over. Add --reveal to print it in this output (it will be saved in the transcript).')
  }
  const stop = await confirmed(deps, parsed, keyPreview(key.value), 'Create this key')

  if (stop) {
    return done(stop)
  }
  const made = await generateKey(deps.admin, keyBody(key.value))

  if (!made.ok) {
    return done(made.message)
  }
  const { secret, hash } = made.value
  const label = `"${key.value.alias}" · ${maskKey(secret)}`

  if (isReveal) {
    return done(`Created key ${label}\nKey: ${secret}\nPrinted because of --reveal: it is now saved in this session's transcript.`, true)
  }
  if (await copied(deps, secret)) {
    return done(
      `Created key ${label}\nCopied to the clipboard. Paste it now: the proxy cannot show it again. If the paste comes out empty, run /litellm key block ${key.value.alias} and make another.`,
      true,
    )
  }
  const undone = hash ? await deleteKey(deps.admin, hash) : null

  return undone?.ok
    ? done(`The clipboard did not take the key, so it was not kept: key "${key.value.alias}" was deleted again. Retry, or add --reveal.`)
    : done(
        `Key ${label} was created but could not be copied, and it could not be deleted either. Block it with /litellm key block ${key.value.alias}${
          undone ? ` (${undone.message})` : ''
        }.`,
        true,
      )
}

const keyToggle = async (deps: Deps, parsed: Parsed, isBlocked: boolean): Promise<Result> => {
  const bad = unknownFlags(parsed, ['yes', 'dry-run'])
  const [, ref, ...extra] = parsed.positional

  if (bad || !ref || extra.length > 0) {
    return done(bad ?? `Which key? ${KEY_HELP.split('\n')[isBlocked ? 1 : 2]}`)
  }
  const row = await resolveKey(deps.admin, ref, deps.ownHash)

  if (!row.ok) {
    return done(row.message)
  }
  const { value } = row
  const name = value.alias ?? `${value.hash.slice(0, 8)}…`
  const stop = await confirmed(
    deps,
    parsed,
    [
      `${isBlocked ? 'Block' : 'Unblock'} key "${name}" (${money(value.spend)} spent)`,
      ...(value.hash === deps.ownHash && isBlocked ? ['  warning  this is the key Claude Code is using right now'] : []),
      ...(value.isBlocked === isBlocked ? [`  note     it is already ${isBlocked ? 'blocked' : 'active'}`] : []),
    ],
    isBlocked ? 'Block this key' : 'Unblock this key',
  )

  if (stop) {
    return done(stop)
  }
  const changed = await setBlocked(deps.admin, value.hash, isBlocked)

  return changed.ok ? done(`${isBlocked ? 'Blocked' : 'Unblocked'} key "${name}".`, true) : done(changed.message)
}

const grant = async (deps: Deps, parsed: Parsed): Promise<Result> => {
  const bad = unknownFlags(parsed, ['key', 'user', 'team', 'set', 'yes', 'dry-run'])
  const [rawAmount, ...extra] = parsed.positional

  if (bad || extra.length > 0) {
    return done(bad ?? `Unexpected "${extra[0]}".\n${GRANT_HELP}`)
  }
  const amount = parseMoney(rawAmount, 'The amount')

  if (!amount.ok) {
    return done(`${amount.message}\n${GRANT_HELP}`)
  }
  const targets = (['key', 'user', 'team'] as const).filter(kind => parsed.flags[kind] !== undefined)

  if (targets.length > 1) {
    return done('Pick one target: --key, --user or --team.')
  }
  const kind: Budgeted['kind'] = targets[0] ?? 'key'
  const ref = typeof parsed.flags[kind] === 'string' ? (parsed.flags[kind] as string) : null
  const target = await readTarget(deps.admin, kind, ref, deps.ownHash)

  if (!target.ok) {
    return done(target.message)
  }
  const plan = planGrant(target.value, amount.value, parsed.flags.set === true)

  if (!plan.ok) {
    return done(plan.message)
  }
  if (plan.value.isNoop) {
    return done(`${target.value.label} already has a budget of ${money(plan.value.after)}: nothing to change.`)
  }
  const stop = await confirmed(deps, parsed, plan.value.lines, 'Apply this budget')

  if (stop) {
    return done(stop)
  }
  const updated = await applyBudget(deps.admin, target.value, plan.value.after)

  if (!updated.ok) {
    return done(updated.message)
  }
  const { budget, unread } = updated.value
  const line = `${budget.kind} "${budget.label}" now has a budget of ${money(budget.limit)} (${money(budget.spend)} spent).`

  return done(
    unread === null
      ? line
      : `${line}\nThe proxy accepted the change, but reading it back failed (${unread}). Do not repeat the command: it would add the amount again. Check with /litellm keys.`,
    true,
  )
}

export const runAdmin = async (deps: Deps, command: AdminCommand, input: string): Promise<Result> => {
  const parsed = parseArgs(input, BOOLEANS)
  const [sub = ''] = parsed.positional

  if (command === 'keys' || (command === 'key' && sub === 'list')) {
    return keys(deps, command === 'key' ? { ...parsed, positional: parsed.positional.slice(1) } : parsed)
  }
  if (command === 'key') {
    return sub === 'new' ? keyNew(deps, parsed) : sub === 'block' || sub === 'unblock' ? keyToggle(deps, parsed, sub === 'block') : done(`Usage:\n${KEY_HELP}`)
  }
  if (command === 'grant') {
    return grant(deps, parsed)
  }
  const fallbacks = await readFallbacks(deps.admin)

  return done(fallbacks.ok ? fallbacksText(fallbacks.value, parsed.positional.join(' ')) : fallbacks.message)
}

