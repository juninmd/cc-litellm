# Security policy

## Reporting a vulnerability

Please report it **privately**: [open a security advisory](https://github.com/juninmd/cc-litellm/security/advisories/new). Do not open a public issue for anything that could leak or misuse a key.

Include what you saw, the steps to reproduce it, the plugin version and the Claude Code version. Leave real keys out of the report; a masked key (`sk-...abcd`) is enough. This is a one-person project, so replies are best effort.

## What matters most here

The plugin holds a LiteLLM virtual key and, optionally, an admin key. The promises worth testing:

- A key is never printed, logged or put in the transcript. A new key goes to the clipboard, and `--reveal` is the only way to print one, with a warning.
- The admin key goes only to the proxy that accepted the session key, and a change of URL or key makes the plugin ask again first.
- A proxy error that echoes a key is masked before it reaches the screen.
- Every write (create a key, block it, grant budget) shows a preview and asks for confirmation, unless you pass `--yes`; `--dry-run` stops at the preview.

## Supported versions

Only the latest release gets fixes.
