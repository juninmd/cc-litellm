import type { Admin } from './admin'
import type { Parsed } from './args'

export type Deps = {
  admin: Admin
  /** SHA-256 of the key Claude Code uses, when the last reading found it. */
  ownHash: string | null
  ownUserId: string | null
  ownOrgId: string | null
  /** Drawing surfaces of the session: none means headless, with no dialog and no clipboard. */
  surfaces: readonly string[]
  now: number
  ask: (question: string, options: string[]) => Promise<string>
  copy: (text: string) => Promise<boolean>
}

export type Result = { text: string; isChanged: boolean }

export const done = (text: string, isChanged = false): Result => ({ text, isChanged })

/** Shows the preview and gets a yes: --yes, else the engine's dialog; --dry-run, no dialog and a failed dialog all stop here. */
export const confirmed = async (deps: Deps, parsed: Parsed, preview: readonly string[], verb: string): Promise<string | null> => {
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
