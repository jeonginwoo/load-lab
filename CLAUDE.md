# load-lab — load-test bots + live dashboard for our game servers (game-hub · whiteboard-3d · rinfish)

<!-- Admission test for every line in this file — keep a line only if all three hold:
     (1) always true  (2) needed every session  (3) not derivable from the code.
     Fails one → delete it or move it under docs/. State rules as must/never, not "is".
     No empty sections, no speculative parts: a section appears when its pain is felt. -->

Node + TypeScript (type stripping, no build) + `ws`. A measuring tool that connects to other repos' servers
from the outside — it is NOT part of any game, and no game imports it.

## Session start

Read `docs/PROGRESS.md` first — current state, decision log, work queue, next task.

## Commands

```bash
bash scripts/verify.sh            # full verification (--quick: fast tier)
                                  # full log → build/last-verify.log; on FAIL read only the failing part
bash scripts/ralph.sh 2           # autonomous queue loop — only with a human watching
npm install                       # once after clone, and whenever package-lock.json changes
npm run load -- <target> [--ui]   # targets: game-hub · whiteboard · rinfish (options: src/run.ts header, README.md)
npm run ui -- --allow-remote      # = npm run load -- --ui: measure deployed servers (address field defaults to the deployed page;
                                  # stats token from .env LOAD_STATS_TOKEN or the dashboard). Plain `npm run ui` = local servers
```

## Structure rules (invariants — never write code that violates them)

1. Everything that differs per server (URL, hello, movement, probe, expected-rate formula) lives in that server's
   `src/targets/<name>.ts` behind the `Target` interface; `src/run.ts` and `src/core/` never branch on a target id.
2. Never import another repo's code (game-hub, whiteboard-3d, rinfish). A target re-states only the message shapes
   it sends and reads, naming the source file it mirrors in its header comment — update it when that protocol changes.
3. Bots send only messages the real client sends, within the server's own limits (room cap, rate limits) —
   the load must look like real players, never a malformed-input or flood test.
4. Server-side numbers come only through `docs/stats-contract.md` (`GET /__stats`). Changing its shape is a
   contract version bump, and the servers that carry it (game-hub, whiteboard-3d) change in the same session.
5. Never point bots at a non-localhost server without `--allow-remote` (the gate stays in `src/run.ts`), and
   never at someone else's deployed server (rinfish) unless the user says its owner agreed.

## Way of working

- One task = one session = one commit. Keep the unit small enough to review in one diff.
- Git: `docs/conventions/git-workflow.md`. **Never do code work on `main`** — record-only doc edits excepted,
  committed right away. **Commit branch work only at `/wrap-up`**: when the work is done, report it and leave it
  uncommitted. `/wrap-up` (= the user's approval) commits one commit and merges the branch into `main`.
- Never claim a task done unless `bash scripts/verify.sh` passes. On FAIL, read only
  the failing part of `build/last-verify.log` (grep/tail) — never the whole log.
- Say what you could NOT verify (a target never run against a live server, dashboard visuals, numbers measured
  with bots and server on the same PC) instead of implying it works.
- Work discovered mid-task goes to 후보 일감 in `docs/PROGRESS.md` — never done silently.
- Decisions that change or contradict a document go to the PROGRESS decision log with 근거,
  and the contradicted document is fixed in the same session.
- Harness parts are added only when their pain is felt — no empty sections, no speculative parts.
  A harness rule change is its own `chore:` commit, landed before the work that needs it.
- The `reviewer` agent never runs on the author's model — its `model:` stays pinned to a
  different family (blind-spot separation; `scripts/verify.sh` checks it).
- Language: instruction files (this file, commands, agents, scripts) in English;
  records (`docs/`, README) and code comments in Korean.
- Commit message: `type: 한국어 요약` (+ `- ` bullet lines). Types: `feat` `fix` `refactor` `test` `docs` `chore`.
