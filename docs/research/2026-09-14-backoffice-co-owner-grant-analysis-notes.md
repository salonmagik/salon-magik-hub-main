# Notes — backoffice-co-owner-grant-broken

**Design/analysis:** [`2026-09-14-backoffice-co-owner-grant-analysis.md`](./2026-09-14-backoffice-co-owner-grant-analysis.md)
**Implementer report:** `backoffice-co-owner-grant-broken-implementer-report.md`
**Review verdict:** PASS

- Built exactly the decided fix: `get_tenant_owners`'s self-gate now admits `auth.role() is distinct
  from 'service_role'`, leaving `index.ts` untouched. Verified live (repro test, extended pgTAP T-8
  case, and the 12 pre-existing unit tests) against a fresh local Supabase stack — all green.
- The commit (`df71415`) also swept in several pre-existing, never-committed docs (`co-owner-invite`
  PRD/design/research, the analyst's own doc) that were sitting untracked in this shared worktree.
  The implementer's report explains this was deliberate — legitimate pipeline documentation staged
  alongside the fix — and that the unrelated, externally (Codex-)authored `co-owner-invite`
  application code was correctly left uncommitted for its own review pass. Confirmed by diffing
  `df71415` against `HEAD~1`: only doc artifacts and the fix files landed; no app code did.
- Nothing else pending from this item; `co-owner-invite`'s own implementation is a separate,
  not-yet-reviewed piece of work (see `docs/backlog-open-followups.md`).
