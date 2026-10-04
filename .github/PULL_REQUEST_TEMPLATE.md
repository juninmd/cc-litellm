## What and why

<!-- One or two sentences: the change, and the reason for it. -->

## Checks

<!-- CI runs these on every PR; tick what you ran yourself, and say so when one does not apply. -->

- [ ] `claude plugin test plugins/litellm-key`
- [ ] `claude plugin validate plugins/litellm-key --strict`
- [ ] `tsc -p plugins/litellm-key/.claude-plugin/types/tsconfig.json --noEmit`
- [ ] `bash dev/check-file-size.sh` (no file over 300 lines)
- [ ] A behavior change comes with a test that fails without it
- [ ] README, its translations and the CHANGELOG say the same thing as the code
- [ ] A UI change comes with a screenshot from the evidence harness (`dev/evidence`)
- [ ] No key, token or real hostname in the diff, the tests or the screenshots

## Rollback

<!-- Usually `git revert`. Say so if it is anything else. -->
