---
name: dev-pipeline
description: Run a bug/feature through research, planning, implementation, code review, QA, and security review, looping back on failures, then stopping for human sign-off before merge or deploy. Use for "fix SCRUM-14", "work the next Jira bug", or any request to run something through the full pipeline.
---

# Dev pipeline

Six stages: **Research → Plan → Implement → Review → QA → Security**, then **STOP**.
A failing Review, QA, or Security stage loops back to Implement (or, if the
root cause turns out to be misdiagnosed, back to Research) — never straight
to STOP on a failure. Never merge, deploy, or push to `main` at the end of
this skill without the user explicitly saying so in this conversation —
finishing the loop means "ready for human sign-off," not "shipped."

## 0. Resolve the work item

`args` is one of:
- A Jira key (`SCRUM-14`) or URL — fetch it via the `jira` MCP tools.
- `"next"` — query the MVP Dev Work project for the oldest unresolved Bug
  not already commented on by this pipeline (JQL: `project = SCRUM AND
  issuetype = Bug AND resolution = Unresolved ORDER BY created ASC`), skip
  anything that's a Feature/Idea (those need a product decision, not a fix
  — see step 6b).
- Free text — treat it as the bug report directly, no Jira involved.

If nothing matches, say so and stop. Don't invent a task.

## 1. Research

Spawn `Explore` (or `general-purpose` for anything needing broader
reasoning) agents — in parallel if the bug plausibly touches independent
areas. Each agent gets a self-contained brief: what's reported, what to
find (exact files/lines, the working reference pattern if one exists
elsewhere in the codebase, the actual root cause — not just where the
symptom shows). Research-only, no edits.

If research surfaces that this needs a product/design decision rather than
a code fix (no destination page exists, ambiguous UX direction, etc.) —
stop here. Report the finding, don't guess at product direction. This
happened for real on SCRUM-5 in this repo's history; it's not a failure
mode, it's a correct stop.

## 2. Plan

For a well-scoped, single-cause bug: skip formal plan mode, just state the
fix in a sentence or two before implementing.

For anything multi-file, architecturally ambiguous, or where research
turned up more than one viable approach: use the `Plan` subagent or plan
mode properly, and if there's a real tradeoff a human should weigh in on,
use `AskUserQuestion` before implementing — don't silently pick.

## 3. Implement

Done by the orchestrator directly (not a spawned agent — see the skill
description's rationale). Follow this repo's established conventions:
Node 24, pnpm workspace, `turbo build`/`turbo lint` per affected app. Never
stage `.mcp.json`. No `Co-Authored-By` trailer. Keep commits scoped to one
logical fix each, not one giant commit per pipeline run.

## 4. Review

Run `/code-review` on the diff. Default to `medium`; use `high` for
anything touching payments, auth, or RLS. Apply `--fix` for the findings
worth auto-applying; anything requiring judgment gets fixed by hand.

**Fail → loop to step 3** with the findings as the brief.

## 5. QA

Run the `verify` skill. This means what it's meant all session: real
builds, real `tsc --noEmit`, and wherever possible actual runtime
verification — drive the real app, don't just trust that tests pass.

Concretely, in this repo:
- **Frontend change**: start the relevant app's dev server (`npx vite`,
  correct port per its `vite.config.ts`), drive it with Playwright using
  the system-installed Chrome (`/Applications/Google Chrome.app/Contents/
  MacOS/Google Chrome` as `executablePath` — the Playwright-bundled
  Chromium can't be downloaded in this sandbox, no network path to
  `cdn.playwright.dev`), screenshot the actual result. Kill the dev server
  and delete any throwaway scripts when done.
- **Backend/RLS/edge-function change**: verify against the real dev
  Supabase project (`yqahjtsizbqwxdbjzsli`), not assumptions. A migration
  needs `supabase db push --linked` and then a real authenticated REST
  call (magic-link session via a temporary `--no-verify-jwt` diagnostic
  edge function, generate the link, exchange it for a real session token,
  make the actual request an authenticated user's session would make) —
  RLS bugs don't show up any other way. An edge function needs at least a
  real `supabase functions deploy` to catch bundling/import errors; only
  invoke it live if doing so has no real-world side effect (an SMS/email
  broadcast function does — don't trigger those against real numbers).
  Always delete diagnostic functions and test rows afterward, and revoke
  any session token you minted.

**Fail → loop to step 3** (or step 1, if QA reveals the diagnosis itself
was wrong).

## 6. Security

Run `/security-review`. Pay particular attention to anything this repo's
history shows recurring: RLS policies that silently reference tables the
caller's role can't read (`auth.users` is the known repeat offender here),
allowlist gaps on `platform_settings`, and payment amount/channel fields
that could be attacker-influenced.

**Fail → loop to step 3.**

## Loop cap

Three passes through Review→QA→Security max. On a third consecutive
failure of the same stage, stop and hand the failure to the user instead
of continuing — that's a sign the plan itself is wrong, not that one more
iteration will fix it.

## 7. STOP — human sign-off

Once Review, QA, and Security all pass in the same pass:

- Summarize what changed and the real evidence gathered (screenshots,
  authenticated query results, build/lint output) — not "tests pass."
- If sourced from Jira: comment on the ticket with the fix summary and
  evidence, move it to **Testing** (not Done — Done is the human's call
  after they've looked at it themselves).
- Show the diff / commits and stop. Wait for explicit merge/deploy/push
  approval — this is a live payments platform; the human sign-off step is
  not optional even when every stage passed clean.
