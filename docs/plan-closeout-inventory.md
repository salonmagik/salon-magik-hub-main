# Plan Closeout Inventory

This checklist tracks outstanding cross-plan work and current completion status.

## Track 1 — Security & Access (Backoffice)
- [x] Add role-template assignment flow for non-super admins.
- [x] Add role-template create/edit/deactivate UI with page/action matrix (`AdminsPage`).
- [x] Enforce page/permission guards on protected routes for key sensitive pages (`/admins`, `/tenants`, `/feature-flags`, `/sales`).
- [x] Filter sidebar navigation by effective page/permission access.
- [ ] Add effective-permission diff preview UI for assignment changes.
- [ ] Add dedicated audit rows for template CRUD and assignment updates.

## Track 2 — Sales/Revenue
- [x] Add baseline sales ops dashboard cards for promo redemptions and commission ledger.
- [x] Add webhook finalization RPC contract (`finalize_sales_conversion_from_webhook`).
- [x] Invoke conversion finalization from payment webhook for paid/failed events.
- [x] Add annual lock-in evaluator RPC (`evaluate_tenant_annual_lockin_offer`).
- [x] Add platform-wide annual "Pay Now" eligibility banner in salon app.
- [ ] Add campaign manager and agent KYC review interface in Backoffice.
- [ ] Add full reversal logic for refunded/reversed payments tied to commission payouts.

## Track 3 — Growth Ops UX
- [ ] Add reactivation composer modal (channel/template/voucher/preview/send).
- [ ] Add operational queue pages for imports, assistance requests, and reactivation campaigns.
- [ ] Add tenant gifted-trial override UI (create/revoke/list).
- [ ] Remove remaining hardcoded trial copy in all user-facing templates.

## Track 4 — Market/Flag Propagation
- [x] Replace hardcoded onboarding country selectors with market-driven lists (`BusinessStep`, `LocationsStep`).
- [x] Keep add-salon 11+ gate blocked via unlock request path.
- [ ] Remove all remaining hardcoded country fallbacks in non-onboarding forms.
- [ ] Switch CI deploy workflows to immutable artifact promotion (dev -> staging -> prod manifest reuse).

## Deploy + Smoke Criteria
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `supabase db push --include-all`
- [ ] `supabase functions deploy ...`
- [ ] Backoffice UAT: template restrictions + feature flags + sales dashboards
- [ ] Salon UAT: 11+ unlock flow + annual lock-in banner behavior

