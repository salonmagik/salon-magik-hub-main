# Notes — Multi-Salon Owner Identity

Design: `multi-salon-owner-identity.design.md`
Review: `.claudespace/s/fabf7e44-523d-44e0-8159-dd198b969ab8/reports/multi-salon-owner-identity-review.md` (verdict: PASS, round 2)

- Built: `owner_multi_salon_grants` as a durable, reviewed exception to the one-salon-per-owner
  trigger (bound or unbound, consumed exactly once), the standing gate that keys the exception on
  every owned salon being `active` with no trial on the target, the backoffice grant flow
  (`backoffice-grant-multi-salon-ownership` + `MultiSalonOwnershipDialog`), and the salon-admin
  representation surface left invisible by the earlier co-owner-role item: `SalonOwnersTab`, the
  sidebar role label, per-user last-tenant persistence surviving sign-out, and branch-vs-business
  guidance in `AddSalonDialog`.
- Round 1 review found one BLOCKER: the backoffice "Grant additional-salon ownership" row action
  defaulted to `tenant.owners[0]`, so a co-owned salon's second owner could never be targeted, and
  nothing in the UI showed which identity would receive the grant. Fixed in `5c2c16c` — a
  `DropdownMenuSub` now lists each owner by name so the reviewer picks explicitly; single-owner
  tenants keep the direct action. Independently re-verified (typecheck via `tsc --noEmit`, not just
  `vite build`, since this workspace has no dedicated typecheck script; lint/test rerun fresh).
- Known, disclosed residual gap (non-blocking, OPTIONAL from round 2): the new grant submenu's owner
  labels can't show email — `useTenants`' bulk query never fetches `auth.users` email, only
  `profiles.full_name` — so two owners of the same tenant who both lack a `full_name` would both
  read "Unnamed owner" in the picker (the underlying grant target is still correct; only the label is
  ambiguous). Follow-up: fetch owner emails for this menu lazily (e.g. via `get_tenant_owners`) on
  submenu open.
- Known, disclosed residual gap (IMPORTANT, both rounds): the DB-level SQL test file
  (`supabase/tests/multi_salon_owner_identity.sql`) and the design's gate-erosion audit query have
  never been run against a live Postgres instance in either implementation or review pass — the only
  local Supabase stack on this machine belongs to a different project ref and holds the same default
  ports. Both passes did a thorough static line-by-line review of the SQL against the migration's
  actual trigger/function logic instead. Follow-up: whoever has a free local Supabase instance (or
  CI) should run `supabase db reset` + the test file + the `co_owner_foundation.sql` regression + the
  gate-erosion query + `supabase gen types typescript --local > packages/supabase-client/src/supabase/types.ts`
  (the last one is why the JS layer still casts around four RPC names with `(supabase.rpc as any)`).
- Notable process finding, not a code issue: the implementer's session flagged a suspected prompt
  injection inside a `Read` tool result while reading the design doc (a fake system-reminder asking
  for a commit-attribution change) and correctly declined to act on it. The reviewer independently
  confirmed the design document on disk contains no such text, so the injection (if real) targeted
  the tool stream, not the repository.
