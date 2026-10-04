#!/usr/bin/env bash
# A PR title must be a Conventional Commit: squash-merge makes it the commit on main, and release-please
# reads that commit to choose the next version. Usage: check-pr-title.sh "<title>" | --self-test
set -euo pipefail

TYPES='feat|fix|perf|refactor|docs|style|test|build|ci|chore|revert'
PATTERN="^(${TYPES})(\([a-z0-9][a-z0-9._/-]*\))?!?: [^[:space:]].*\$"

is_valid() { [[ "$1" =~ $PATTERN ]]; }

if [ "${1:-}" = "--self-test" ]; then
  failed=0
  for title in "feat: add x" "fix(litellm-key): handle a null cap" "feat(litellm-key)!: drop the old option" \
    "chore(deps): Bump actions/checkout from 6 to 7" "chore(main): release litellm-key 0.4.0" "revert: feat: add x" \
    "docs(readme): say it better" "perf(pane): fewer redraws"; do
    is_valid "$title" || { echo "self-test: should pass: $title" >&2; failed=1; }
  done
  for title in "Add x" "feat add x" "feat:x" "feature: x" "Feat: x" "feat(): x" "feat(Scope): x" "feat: " "fix" "" "WIP" "WIP feat: add x"; do
    ! is_valid "$title" || { echo "self-test: should fail: '$title'" >&2; failed=1; }
  done
  [ "$failed" -eq 0 ] && echo "self-test: ok"
  exit "$failed"
fi

title="${1:-}"
if is_valid "$title"; then
  echo "ok: ${title}"
  exit 0
fi
{
  echo "error: the PR title is not a Conventional Commit: '${title}'"
  echo "  expected: <type>(<optional scope>)<! if breaking>: <description>"
  echo "  types:    ${TYPES//|/, }"
  echo "  examples: feat(litellm-key): show the runway of a key"
  echo "            fix: a cap of \$0 read as no cap"
  echo "  what each type releases: RELEASING.md"
} >&2
exit 1
