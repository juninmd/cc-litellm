import type { Deps } from './admin-commands'
import { resolveCredentials } from './credentials'
import type { Ports } from './ports'
import type { Session } from './session'
import { sourcesOf } from './settings'
import { failureText } from './summary'

const ADMIN_REQUEST_MS = 15_000

/** What the admin commands need from the engine besides the proxy. */
export type AdminIo = {
  surfaces: () => Promise<readonly string[]>
  ask: Deps['ask']
  copy: Deps['copy']
}

// Admin calls use litellm_admin_key when set, else the virtual key itself, and only ever go to the root that answered /key/info.
export const adminLink = async (session: Session, ports: Ports, io: AdminIo): Promise<{ deps: Deps } | { text: string }> => {
  const { state } = session

  await session.ensureFresh(ports)
  const now = await ports.now()
  const resolved = resolveCredentials(await sourcesOf(state.config, ports), now)

  if (!resolved.ok) {
    return { text: failureText(resolved.failure) }
  }
  if (state.pinnedRoot !== null && !session.isPinnedFor(resolved.credentials)) {
    // the URL or the key changed since a proxy answered: ask again before trusting any root
    await session.load(ports, 'force')
  }
  if (!session.isPinnedFor(resolved.credentials) || state.pinnedRoot === null) {
    // the admin key only goes to a proxy that already accepted this session's own key
    return {
      text: state.latest.failure
        ? `${failureText(state.latest.failure)}\nAdmin commands wait until the proxy accepts this session's key; use another session or the LiteLLM UI to fix it.`
        : 'The proxy has not answered yet. Try again in a moment.',
    }
  }
  const { credentials } = resolved
  const { adminKey } = state.config
  // with an admin key nothing of the virtual key's headers goes along: x-litellm-api-key would win over authorization
  const headers: Record<string, string> = adminKey
    ? { accept: 'application/json', authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }
    : { ...credentials.headers, 'content-type': 'application/json' }

  return {
    deps: {
      admin: {
        root: state.pinnedRoot,
        headers,
        send: (url, init) => ports.fetch(url, init, ADMIN_REQUEST_MS),
        secrets: adminKey ? [credentials.key, adminKey] : [credentials.key],
        isOwnKey: adminKey === null,
      },
      ownHash: state.latest.snapshot?.key.keyHash ?? null,
      ownUserId: state.latest.snapshot?.key.userId ?? null,
      surfaces: await io.surfaces(),
      now,
      ask: io.ask,
      copy: io.copy,
    },
  }
}
