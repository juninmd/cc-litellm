# Releasing

Releases are cut by the pipeline from the **Conventional Commits** on `main`. Nobody edits a version by hand.

```text
PR with a conventional title ──squash──▶ main ──▶ release-please keeps ONE release PR up to date
                                                   (new version in 3 files + CHANGELOG)
                  you merge the release PR ──▶ tag litellm-key--vX.Y.Z + GitHub release ──▶ verified
```

## What a commit does

The PR title is the commit on `main` (squash merge), so the **PR title** is what has to be conventional.
The `conventional title` check fails otherwise (`dev/check-pr-title.sh`).

| Title | Release | CHANGELOG section |
| --- | --- | --- |
| `feat(scope): …` | minor (`0.3.0` → `0.4.0`) | Added |
| `fix: …`, `perf: …`, `refactor: …`, `revert: …` | patch (`0.4.0` → `0.4.1`) | Fixed, Performance, Changed, Reverted |
| `feat!: …` or a `BREAKING CHANGE:` footer in the body | minor while the version is `0.x`, major from `1.0.0` | with the type it carries |
| `docs`, `test`, `ci`, `build`, `chore`, `style` | none by themselves; they ride along in the next release | hidden |

No release PR is opened until at least one commit of a visible type lands. To force a version, put `Release-As: 1.0.0`
in the body of a commit.

## Cutting a release

1. Merge work as usual. After each merge to `main`, the `Release` workflow opens or updates the PR
   `chore(main): release litellm-key X.Y.Z`: it bumps `plugin.json`, the marketplace entry and
   `.release-please-manifest.json`, and writes the CHANGELOG.
2. Read it. The CHANGELOG entry can be polished on that branch before you merge.
3. Merge the release PR. The workflow then creates the tag `litellm-key--vX.Y.Z` (the name `claude plugin tag`
   uses) and the GitHub release, and the `verify the release` job checks that the tag, `plugin.json` and the
   marketplace entry say the same version and that the release is not a draft.

CI also checks on every PR that `plugin.json`, the marketplace entry and the manifest agree (`claude plugin tag --dry-run`).

## One-time setup (repo admin)

The workflow needs to open a PR. Pick **one**:

- **The built-in token** (nothing to store): *Settings → Actions → General → Workflow permissions → Allow GitHub
  Actions to create and approve pull requests*, or
  `gh api -X PUT repos/juninmd/cc-litellm/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`.
  A PR opened this way **does not start other workflows**, so CI does not run on the release PR (it only changes
  versions and the CHANGELOG, and the code was already tested on `main`).
- **A fine-grained token** (CI runs on the release PR): create a token for this repository only, with
  *Contents* and *Pull requests* read and write (and *Issues* for the labels), a short expiry, and store it:
  `gh secret set RELEASE_PLEASE_TOKEN`. The workflow uses it when present.

Recommended, so the convention holds:

- *Settings → General → Pull Requests → Allow squash merging → Default to pull request title and description*
  (`squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=PR_BODY`), so the title checked is the commit written.
- *Settings → Branches → `main`*: require the checks `verify (ubuntu-latest)`, `verify (windows-latest)` and `conventional title`.

## When something goes wrong

- **The workflow says GitHub Actions is not permitted to create pull requests:** the one-time setup above was not done.
- **A commit was not conventional and is missing from the notes:** release-please skips it. Fix forward with a
  conventional commit, or edit the CHANGELOG on the release PR.
- **A bad release was published:** fix forward with a `fix:` commit and release again; users on the bad version update
  to the next one. If it must disappear, `gh release delete litellm-key--vX.Y.Z --cleanup-tag --yes`, then correct
  the version in the three files by hand in a PR (the CI check above keeps them consistent).
- **Tagging by hand** is still possible with `claude plugin tag --push` from a clean `main`, but then release-please does not know
  about it; prefer the release PR.

Configuration: `release-please-config.json` and `.release-please-manifest.json`; the workflows are
`.github/workflows/release.yml` and `.github/workflows/pr-title.yml`.
