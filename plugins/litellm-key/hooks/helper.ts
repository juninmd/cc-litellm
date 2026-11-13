import { redact, truncate } from './format'

export type RunResult = { exitCode: number | null; stdout: string; stderr: string }
export type Run = (argv: string[], timeoutMs: number) => Promise<RunResult>
export type Helped = { key: string } | { error: string }

/** Claude Code re-runs the helper every 5 minutes by default; the plugin reads on a faster timer, so it keeps the answer as long. */
export const HELPER_TTL_MS = 5 * 60_000
export const HELPER_TIMEOUT_MS = 10_000

const kept = new Map<string, { key: string; at: number }>()

/** Forgets what the helper answered (a test, or a changed command). */
export const forgetHelper = (): void => kept.clear()

/**
 * Runs the `apiKeyHelper` of settings.json the way Claude Code does (through a shell, the trimmed stdout is the key).
 * It is the person's own command, already trusted to run by Claude Code; its output is never printed, only used as the key.
 */
export const helperKey = async (command: string, run: Run, now: number): Promise<Helped> => {
  const hit = kept.get(command)

  if (hit && now - hit.at < HELPER_TTL_MS) {
    return { key: hit.key }
  }
  try {
    const result = await run(['sh', '-c', command], HELPER_TIMEOUT_MS)
    const key = result.stdout.trim()

    if (result.exitCode !== 0) {
      const why = truncate(redact(result.stderr.trim().split(/\r?\n/)[0] ?? ''), 80)

      return { error: `apiKeyHelper ${result.exitCode === null ? 'timed out' : `exited with ${result.exitCode}`}${why ? `: ${why}` : ''}` }
    }
    if (!key) {
      return { error: 'apiKeyHelper printed nothing' }
    }
    kept.set(command, { key, at: now })

    return { key }
  } catch (error) {
    return { error: `apiKeyHelper did not run: ${truncate(redact(error instanceof Error ? error.message : String(error)), 80)}` }
  }
}
