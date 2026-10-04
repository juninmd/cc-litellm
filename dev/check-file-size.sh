#!/usr/bin/env bash
# Fails when a source file of the plugin has more lines than the cap: a file near it is a missing boundary.
set -eu
cap="${1:-300}"
cd "$(dirname "$0")/../plugins/litellm-key"
bad=0
while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$cap" ]; then
    echo "too long ($lines > $cap): $file"
    bad=1
  fi
done < <(find hooks tests types -type f \( -name '*.ts' -o -name '*.tsx' \) | sort)
[ "$bad" -eq 0 ] && echo "ok: every file is at most $cap lines"
exit "$bad"
