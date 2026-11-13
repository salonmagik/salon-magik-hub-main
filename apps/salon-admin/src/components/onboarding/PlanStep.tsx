// Solo/Studio/Chain are now derived labels (location/seat counts), not a
// tier a signup picks between — there is one base price. The explicit
// 3-card plan picker this file used to export was never actually wired
// into the onboarding flow (OnboardingPage.tsx only ever auto-selects
// "solo" vs "chain" from location count) and would show the wrong, now-
// deleted Studio/Chain prices if it ever were, so it's removed rather than
// left as dead, incorrect code. The type stays, since the solo/studio/chain
// label is still used throughout the app.
export type SubscriptionPlan = "solo" | "studio" | "chain";
