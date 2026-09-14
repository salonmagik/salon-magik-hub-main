# Notes — temp-password-entropy

- Built: `_shared/secure-password.ts` (crypto.getRandomValues, rejection-sampled), consolidating
  `send-staff-invitation`, `backoffice-add-tenant-owner`, and `backoffice-add-tenant-co-owner` onto
  it, plus a server-side role whitelist on `send-staff-invitation` (new + resend branches).
  Design: `docs/design/temp-password-entropy.design.md`. Review:
  `.claudespace/s/0739740e-5540-4c70-a82e-ba8a55417027/reports/temp-password-entropy-review.md`.

- **Round 1 finding, since fixed:** the first pass committed `send-co-owner-invitation/index.ts`
  wholesale (518 lines, no prior git history) as a side effect of its own 2-line edit. That file is
  externally-authored WIP for the separate `co-owner-invite` item ("implementation handed to Codex
  externally, outside this pipeline"). A never-tracked file can't be partially committed, so editing
  it in place forced the whole thing onto `origin` under an unrelated security-fix commit, with no
  test coverage. Fixed by `git rm --cached` (commit `21be18c`) to restore it to untracked, on-disk-only
  WIP — same treatment as its sibling co-owner-invite files. Worth remembering for any future item
  that touches a file the design references by exact line number: check `git log --follow` on it
  before assuming it's fair game to commit, since "on disk" and "in this pipeline's history" are not
  the same thing in this shared worktree.

- **Known, deliberately deferred gap:** `send-co-owner-invitation/index.ts` still uses
  `Math.random()` on disk. Not a live vulnerability (never deployed), but whoever brings
  `co-owner-invite` through this pipeline should apply the same fix (delete its local generator,
  import from `_shared/secure-password.ts`) before that file is committed for the first time.

- No other follow-up deferred.
