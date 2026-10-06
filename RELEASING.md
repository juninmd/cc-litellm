# Releasing

Releases are cut by the pipeline from the **Conventional Commits** on `main`. Nobody edits a version by hand and
nobody merges a release PR.

```text
PR with a conventional title ──squash──▶ main ──▶ CI green ──▶ release-please updates ONE release PR
                                                               (new version in 3 files + CHANGELOG)
                 the workflow merges it ──▶ tag litellm-key--vX.Y.Z + GitHub release ──▶ verified
```

The `Release` workflow starts when `CI` finishes on `main` (`workflow_run`), so it only runs for a commit CI passed.
It checks twice (before opening the PR and right before merging it) that `main` holds nothing else CI has not seen,
and stands down if it does: the run for that newer commit releases it. A commit that lands in the seconds between the
second check and the merge can still ride along; without a merge queue that window cannot be closed.

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

## What happens on a merge

1. A PR with a visible type (`feat`, `fix`, `perf`, `refactor`, `revert`) is squash-merged. CI runs on `main`.
2. When CI is green, the `Release` workflow opens or updates the PR `chore(main): release litellm-key X.Y.Z`: it
   bumps `plugin.json`, the marketplace entry and `.release-please-manifest.json`, and writes the CHANGELOG.
3. The same run squash-merges that PR, creates the tag `litellm-key--vX.Y.Z` (the name `claude plugin tag` uses)
   and the GitHub release, and the `verify the release` job checks that the tag, `plugin.json` and the marketplace
   entry say the same version and that the release is not a draft.

Users on the marketplace only receive a new copy when `version` changes, so a visible commit that has not been
released yet is not delivered to anyone. That is why the release follows the merge on its own.

The release PR is merged without a review, and with the built-in token without CI: it only changes versions and the
CHANGELOG, and the code was tested on `main` first. There is no window to polish the CHANGELOG before it ships: fix a wrong entry forward, in a later commit.

CI also checks on every PR that `plugin.json`, the marketplace entry and the manifest agree (`claude plugin tag --dry-run`).

## One-time setup (repo admin)

The workflow needs to open and merge a PR. Pick **one**:

- **The built-in token** (nothing to store, what this repository uses): *Settings → Actions → General → Workflow
  permissions → Allow GitHub Actions to create and approve pull requests*, or
  `gh api -X PUT repos/juninmd/cc-litellm/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`.
  A PR opened or merged this way **does not start other workflows**, so CI does not run on the release PR or on its
  merge commit, which is why the workflow tags the release itself right after the merge.
- **A fine-grained token** (CI runs on the release PR and its merge): create a token for this repository only, with
  *Contents* and *Pull requests* read and write (and *Issues* for the labels), a short expiry, and store it:
  `gh secret set RELEASE_PLEASE_TOKEN`. The workflow uses it when present.

`main` must keep accepting a merge from the workflow: *require a pull request* with 0 approvals works; a required
approval or a required status check on the release PR would stop the merge (the job then fails, see below).

Recommended, so the convention holds:

- *Settings → General → Pull Requests → Allow squash merging → Default to pull request title and description*
  (`squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=PR_BODY`), so the title checked is the commit written.
- *Settings → Branches → `main`*: require the checks `verify (ubuntu-latest)`, `verify (windows-latest)` and `conventional title`.

## When something goes wrong

- **The workflow says GitHub Actions is not permitted to create pull requests:** the one-time setup above was not done.
- **The job fails with `release PR #N did not merge`:** a branch rule blocks the merge (an approval or a check the release
  PR cannot get). Merge the PR by hand once: the push runs CI, and the `Release` workflow that follows tags it. Then fix the rule.
- **Nothing was released after a merge:** check that CI finished green (`Release` waits for it), that the title was a
  visible type, and that the `Release` run did not stand down because `main` moved on (the newer run covers it).
- **The job fails with `the release PR merged but no release was created`:** the PR is merged but not tagged. Re-run the
  failed job: its first step tags the leftover PR.
- **Stop the automation:** disable the `Release` workflow in *Actions*. Merging a release PR by hand still tags it once
  the workflow is enabled again.
- **A commit was not conventional and is missing from the notes:** release-please skips it. Fix forward with a
  conventional commit, or edit the CHANGELOG on the release PR.
- **A bad release was published:** fix forward with a `fix:` commit and release again; users on the bad version update
  to the next one. If it must disappear, `gh release delete litellm-key--vX.Y.Z --cleanup-tag --yes`, then correct
  the version in the three files by hand in a PR (the CI check above keeps them consistent).
- **Tagging by hand** is still possible with `claude plugin tag --push` from a clean `main`, but then release-please does not know
  about it; prefer the pipeline.

Configuration: `release-please-config.json` and `.release-please-manifest.json`; the workflows are
`.github/workflows/release.yml` and `.github/workflows/pr-title.yml`.
