// Live homologation of litellm-key against a real LiteLLM proxy. Runs the plugin's own modules (no mocks):
//   LITELLM_URL=http://127.0.0.1:4000 LITELLM_ADMIN_KEY=sk-... bun dev/litellm/smoke.ts
// It creates keys named smoke-*, spends a few tokens, and deletes the keys at the end.
import type { Admin, Send } from '../../plugins/litellm-key/hooks/admin'
import { runAdmin } from '../../plugins/litellm-key/hooks/admin-commands'
import type { Deps } from '../../plugins/litellm-key/hooks/admin-commands'
import { maskKey } from '../../plugins/litellm-key/hooks/format'
import { fetchSnapshot } from '../../plugins/litellm-key/hooks/litellm'
import type { Credentials, Http } from '../../plugins/litellm-key/hooks/litellm'
import { statusText, summaryText } from '../../plugins/litellm-key/hooks/summary'

const URL_ = (process.env.LITELLM_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '')
const ADMIN_KEY = process.env.LITELLM_ADMIN_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-local-master-key'
const MODEL = process.env.SMOKE_MODEL ?? 'cloud/auto'
const RUN = Date.now().toString(36)
const alias = (name: string): string => `smoke-${name}-${RUN}`

let failures = 0
const say = (line = ''): void => console.log(line)
const check = (label: string, passed: boolean, detail = ''): void => {
  failures += passed ? 0 : 1
  say(`  ${passed ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`)
}
const step = (title: string): void => say(`\n\x1b[1m${title}\x1b[0m`)

const send: Send = async (url, init) => {
  const response = await fetch(url, { method: init.method, headers: init.headers, ...(init.body ? { body: init.body } : {}), signal: AbortSignal.timeout(30_000) })

  return { status: response.status, text: await response.text() }
}
const http: Http = (url, headers) => send(url, { method: 'GET', headers })

const adminOf = (key: string, isOwnKey: boolean): Admin => ({
  root: URL_,
  headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${key}` },
  send,
  secrets: [key],
  isOwnKey,
})

const credentialsOf = (key: string): Credentials => ({
  roots: [URL_],
  host: new globalThis.URL(URL_).host,
  key,
  keySource: 'smoke',
  headers: { accept: 'application/json', authorization: `Bearer ${key}` },
})

const snapshotOf = async (key: string) => {
  const result = await fetchSnapshot({ credentials: credentialsOf(key), http, now: Date.now(), pinnedRoot: null, wantRelated: true, wantUsage: true, refreshSlow: true, previous: null })

  return result
}

const chat = async (key: string, body: Record<string, unknown>) => {
  const response = await fetch(`${URL_}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Reply with one word: pong' }], max_tokens: 24, ...body }),
    signal: AbortSignal.timeout(120_000),
  })

  return { status: response.status, headers: response.headers, json: (await response.json().catch(() => ({}))) as Record<string, any> }
}

const deps = (clipboard: string[], ownHash: string | null): Deps => ({
  admin: adminOf(ADMIN_KEY, false),
  ownHash,
  ownUserId: null,
  surfaces: ['terminal'],
  now: Date.now(),
  ask: async () => 'Apply',
  copy: async text => {
    clipboard.push(text)

    return true
  },
})

const main = async (): Promise<void> => {
  say(`\x1b[1mlitellm-key live smoke\x1b[0m  ${URL_}  model ${MODEL}  run ${RUN}`)
  const clipboard: string[] = []
  const created: string[] = []

  step('1. /litellm key new  (the secret reaches the clipboard, not the output)')
  const made = await runAdmin(deps(clipboard, null), 'key', `new ${alias('main')} --budget 2 --every 30d --user smoke-${RUN} --rpm 120 --yes`)

  say(made.text.split('\n').map(line => `    ${line}`).join('\n'))
  const secret = clipboard[0] ?? ''

  created.push(alias('main'))
  check('key created and copied', made.isChanged && secret.startsWith('sk-'))
  check('secret not in the answer', !made.text.includes(secret))

  step('2. what Claude Code would show for that key (real /key/info, /user/info, /v1/models, daily activity)')
  const first = await snapshotOf(secret)

  check('snapshot read', first.ok, first.ok ? '' : first.failure.message)
  if (!first.ok) {
    return
  }
  const ownHash = first.snapshot.key.keyHash

  say(summaryText(first.snapshot, Date.now(), 80).split('\n').map(line => `    ${line}`).join('\n'))
  say(`    status line: ${statusText(first.snapshot, null, Date.now())}`)
  check('alias, budget and rpm parsed', first.snapshot.key.alias === alias('main') && first.snapshot.key.budget.limit === 2 && first.snapshot.key.limits.rpm === 120)
  check('models listed', (first.snapshot.models ?? []).includes(MODEL), `${first.snapshot.models?.length ?? 0} models`)
  check('no user record is not a problem', first.snapshot.notes.length === 0, first.snapshot.notes.join('; '))

  step(`3. spend through ${MODEL} with that key`)
  const answered = await chat(secret, {})
  const spent = answered.json.usage?.total_tokens ?? 0

  check(`${MODEL} answered`, answered.status === 200, `HTTP ${answered.status} · ${spent} tokens · served by ${answered.json.model ?? '?'}`)
  // LiteLLM writes spend to its database in batches (about every 10s), so the plugin lags by that much
  let second = await snapshotOf(secret)

  for (let waited = 0; waited < 25 && second.ok && second.snapshot.key.budget.spend === 0; waited += 2) {
    await Bun.sleep(2000)
    second = await snapshotOf(secret)
  }
  check('spend moved', second.ok && second.snapshot.key.budget.spend > 0)
  if (second.ok) {
    say(`    status line: ${statusText(second.snapshot, null, Date.now())}`)
  }

  step('4. /litellm grant 3 --key  (extra budget)')
  const granted = await runAdmin(deps(clipboard, ownHash), 'grant', `3 --key ${alias('main')} --yes`)

  say(granted.text.split('\n').map(line => `    ${line}`).join('\n'))
  const third = await snapshotOf(secret)

  check('budget raised from $2 to $5', third.ok && third.snapshot.key.budget.limit === 5)
  check('the raw key is not in the answer', !granted.text.includes(secret))

  step('5. /litellm key block / unblock')
  const blocked = await runAdmin(deps(clipboard, ownHash), 'key', `block ${alias('main')} --yes`)
  const afterBlock = await snapshotOf(secret)

  say(`    ${blocked.text}`)
  check('a blocked key is named as blocked', !afterBlock.ok && afterBlock.failure.kind === 'blocked', !afterBlock.ok ? afterBlock.failure.message : 'still readable')
  const unblocked = await runAdmin(deps(clipboard, ownHash), 'key', `unblock ${alias('main')} --yes`)

  say(`    ${unblocked.text}`)
  check('readable again', (await snapshotOf(secret)).ok)

  step('6. /litellm keys --all, /litellm fallbacks')
  const listing = await runAdmin(deps(clipboard, ownHash), 'keys', '--all')

  say(listing.text.split('\n').slice(0, 8).map(line => `    ${line}`).join('\n'))
  check('the new key is listed', listing.text.includes(alias('main')))
  const fallbacks = await runAdmin(deps(clipboard, ownHash), 'fallbacks', '')

  say(fallbacks.text.split('\n').slice(0, 14).map(line => `    ${line}`).join('\n'))
  check('fallback chains read from the router', fallbacks.text.includes('→'))

  step('7. the router really falls back')
  const broken = await chat(secret, { model: 'demo/always-429' })

  check('a failing model falls back to cloud/auto', broken.status === 200 && broken.headers.get('x-litellm-model-group') === 'cloud/auto', `HTTP ${broken.status} · attempted fallbacks ${broken.headers.get('x-litellm-attempted-fallbacks') ?? 'n/a'} · group ${broken.headers.get('x-litellm-model-group') ?? '?'}`)
  const forced = await chat(secret, { mock_testing_fallbacks: true })

  check('cloud/auto forced to fail walks its chain to cloud/auto-long', forced.status === 200 && forced.headers.get('x-litellm-model-group') === 'cloud/auto-long', `HTTP ${forced.status} · served by ${forced.json.model ?? '?'} · group ${forced.headers.get('x-litellm-model-group') ?? '?'}`)

  step('8. failure modes the status line must name')
  const wrong = await snapshotOf('sk-not-a-real-key-000000')

  check('a wrong key is rejected, not echoed', !wrong.ok && wrong.failure.kind === 'auth' && !JSON.stringify(wrong).includes('sk-not-a-real-key-000000'))
  const refused = await runAdmin({ ...deps(clipboard, ownHash), admin: adminOf(secret, true) }, 'keys', '')

  say(refused.text.split('\n').map(line => `    ${line}`).join('\n'))
  check('a non-admin key is told to set litellm_admin_key', refused.text.includes('litellm_admin_key'))

  step('9. cleanup')
  for (const name of created) {
    const row = await runAdmin(deps(clipboard, ownHash), 'keys', '--all')

    check(`${name} still listed before delete`, row.text.includes(name))
    const found = await fetch(`${URL_}/key/delete`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ key_aliases: [name] }) })

    check(`${name} deleted`, found.status === 200, `key ${maskKey(secret)}`)
  }
  say(`\n${failures === 0 ? '\x1b[32mall checks passed\x1b[0m' : `\x1b[31m${failures} check(s) failed\x1b[0m`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

await main()
