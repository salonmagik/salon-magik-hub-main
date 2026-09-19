// Integration regression for the settle-step attempt_count corruption
// (reviewer BLOCKER, notification-settings-missing-per-tenant review pass):
// when a collapsed group (AD-5) contains offsets with *different* prior
// attempt_count values, the settle step used to overwrite every offset row
// in the group with a single group-derived attempt_count, silently jumping
// a less-attempted offset (typically the 30-minute one) past its own true
// attempt history and toward premature exhaustion.
//
// reminder-state.test.ts cannot catch this: it only exercises the pure
// nextReminderState function, and the bug was entirely in how index.ts
// wrote that result back to appointment_reminder_sends. This test drives
// the real HTTP-served function against a live local Supabase stack, the
// only way to observe the actual database write.
//
// Requires a running local stack:
//   supabase start
//   supabase db push --local
//   deno test -A supabase/functions/send-appointment-reminders/index.integration.test.ts
//
// Not run by CI (ci.yml runs pnpm test only; no deno step).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

interface Fixture {
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>;
  tenantId: string;
  locationId: string;
  customerId: string;
  appointmentId: string;
}

/**
 * Seeds a tenant whose one appointment is 20 minutes out (so both the
 * derived 24h and 30-minute offsets are simultaneously due — AD-5 collapse)
 * with a pre-existing dispatch row for only the long offset, so the group
 * has divergent prior attempt_count values across its two rows.
 */
async function seedDivergentGroup(tag: string): Promise<Fixture> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stamp = `${tag}-${Date.now()}`;

  const { data: tenant, error: tErr } = await admin.from("tenants")
    .insert({ name: `Reminder Collapse Repro ${stamp}`, country: "GH", currency: "GHS" })
    .select("id").single();
  if (tErr) throw tErr;

  const { error: nsErr } = await admin.from("notification_settings")
    .update({ reminder_hours_before: 24, email_appointment_reminders: true, sms_appointment_reminders: false })
    .eq("tenant_id", tenant.id);
  if (nsErr) throw nsErr;

  const { data: location, error: lErr } = await admin.from("locations")
    .insert({ tenant_id: tenant.id, name: "Main", country: "GH", city: "Accra" })
    .select("id").single();
  if (lErr) throw lErr;

  const { data: customer, error: cErr } = await admin.from("customers")
    .insert({ tenant_id: tenant.id, full_name: `Repro Customer ${stamp}`, email: `${stamp}@example.test` })
    .select("id").single();
  if (cErr) throw cErr;

  const scheduledStart = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const scheduledEnd = new Date(Date.now() + 80 * 60 * 1000).toISOString();
  const { data: appointment, error: aErr } = await admin.from("appointments")
    .insert({
      tenant_id: tenant.id,
      location_id: location.id,
      customer_id: customer.id,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      status: "scheduled",
    })
    .select("id").single();
  if (aErr) throw aErr;

  // The long offset (1440 min) has already been attempted once; the
  // 30-minute offset has no row yet (attempt_count 0 once the RPC returns
  // it) — this divergence is what the bug required to manifest.
  const { error: drErr } = await admin.from("appointment_reminder_sends").insert({
    appointment_id: appointment.id,
    tenant_id: tenant.id,
    offset_minutes: 1440,
    attempt_count: 1,
    last_attempt_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  });
  if (drErr) throw drErr;

  return { admin, tenantId: tenant.id, locationId: location.id, customerId: customer.id, appointmentId: appointment.id };
}

async function teardown(f: Fixture) {
  await f.admin.from("message_logs").delete().eq("customer_id", f.customerId);
  await f.admin.from("appointment_reminder_sends").delete().eq("appointment_id", f.appointmentId);
  await f.admin.from("appointments").delete().eq("id", f.appointmentId);
  await f.admin.from("customers").delete().eq("id", f.customerId);
  await f.admin.from("locations").delete().eq("id", f.locationId);
  await f.admin.from("notification_settings").delete().eq("tenant_id", f.tenantId);
  await f.admin.from("notifications").delete().eq("tenant_id", f.tenantId);
  await f.admin.from("tenants").delete().eq("id", f.tenantId);
}

Deno.test("settle keeps each offset's own attempt_count independent across a collapsed group", async () => {
  const f = await seedDivergentGroup("collapse-attempt-count");

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-appointment-reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEquals(res.status, 200, `expected 200, got ${res.status}: ${await res.text()}`);

    const { data: rows, error } = await f.admin
      .from("appointment_reminder_sends")
      .select("offset_minutes, attempt_count")
      .eq("appointment_id", f.appointmentId)
      .order("offset_minutes", { ascending: true });
    if (error) throw error;

    assertEquals(rows?.length, 2, "both offsets should have a dispatch row after the run");

    const byOffset = Object.fromEntries((rows ?? []).map((r) => [r.offset_minutes, r.attempt_count]));

    // The bug forced both rows to the group's max post-claim value (2).
    // The 30-minute offset had no prior attempts, so its own claimed value
    // must be 1, not 2 — independent of the long offset reaching 2.
    assertEquals(byOffset[30], 1, "the 30-minute offset's own attempt history must not be corrupted by the group's");
    assertEquals(byOffset[1440], 2, "the long offset's own attempt history must still increment normally");
  } finally {
    await teardown(f);
  }
});
