# Git Workflow (local — no PR)

> Model: `main` + short-lived task branches, committed and merged by `/wrap-up`.
> Referenced from the root `CLAUDE.md`. AI agents follow the same rules as the human.

## 1. Branches

- **No code or rule change lands on `main` directly.** Every such task starts with
  `git switch main && git switch -c <type>/<short-name>`. "Rule" = CLAUDE.md, `docs/conventions/`,
  `.claude/`, `scripts/`, `docs/stats-contract.md`.
- **Exception — record-only doc edits go straight to `main`** (`docs:` commit right away,
  `bash scripts/verify.sh` green first, no `/wrap-up` needed): PROGRESS updates (state, session
  log, 후보 일감, a decision-log entry recording a decision already made), and typo or stale-line
  fixes in `docs/` records. If the edit changes what anyone must do, it is a rule change — use a branch.
- **Naming**: `<type>/<short-name>`, type = the commit type of the work
  (`feat/` `fix/` `refactor/` `test/` `docs/` `chore/`). Throwaway or side-by-side candidates
  the user will pick from use `experiment/<name>`.
- **Branch from `main`**, never from another task branch — a stacked branch drags the
  base branch's unmerged work into its diff.
- One task = one branch = one commit (CLAUDE.md). A follow-up found mid-task goes to
  후보 일감, not onto the same branch.

## 2. Commits

- **Commit task branches only at `/wrap-up`.** When the work is done, report it and leave it
  uncommitted: the user's review fixes then land in the same commit instead of a `fix:` right
  behind it. If a session must stop before `/wrap-up`, a `wip: <요약>` commit on the task branch
  is allowed; `/wrap-up` folds it into the task commit (`git reset --soft $(git merge-base main HEAD)`).
  Loop mode (ralph) commits per item — there is no human to call `/wrap-up`.
- Format: `type: 한국어 요약`, then `- ` bullet lines (CLAUDE.md).
- `bash scripts/verify.sh` is green before every commit.
- A harness rule change is its own `chore:` commit/branch, merged before the work that needs it.

## 3. Merging

- **The user calling `/wrap-up` is the approval.** `/wrap-up` commits and merges in one go —
  no separate question. Before that, nothing is merged.
- **Exception — `experiment/` is never merged by `/wrap-up`.** It commits on the branch and
  stops; only the candidate the user picks is merged, on their explicit word.
- Method: `git switch main && git merge --ff-only <branch>`. If `main` moved and the
  fast-forward fails, rebase the branch onto `main`, re-run `bash scripts/verify.sh`, then merge.
- Delete the local branch after merging (`git branch -d`). Losing candidates are kept.
- After merging, `git log --oneline -3 main` must show the commit.

## 4. Remote

- Push only when the user asks.
- No force push to `main`. A task branch that was pushed is force-pushed only with
  `--force-with-lease`.
