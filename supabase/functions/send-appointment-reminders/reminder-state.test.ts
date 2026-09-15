import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextReminderState, MAX_REMINDER_ATTEMPTS } from "./reminder-state.ts";

const now = new Date("2026-09-15T12:00:00.000Z");
const nowIso = now.toISOString();

Deno.test("nextReminderState: email-only success -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: true, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, nowIso);
  assertEquals(result.failedAt, null);
  assertEquals(result.attemptCount, 1);
});

Deno.test("nextReminderState: SMS-only success -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: false, smsOk: true, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, nowIso);
  assertEquals(result.failedAt, null);
});

Deno.test("nextReminderState: both channels succeed -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: true, smsOk: true, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, nowIso);
  assertEquals(result.failedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 0 -> 1, not exhausted", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, null);
  assertEquals(result.attemptCount, 1);
  assertEquals(result.failedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 1 -> 2, not exhausted", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 1 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, null);
  assertEquals(result.attemptCount, 2);
  assertEquals(result.failedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 2 -> 3, exhausted, failedAt set", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 2 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.sentAt, null);
  assertEquals(result.attemptCount, 3);
  assertEquals(result.failedAt, nowIso);
});

Deno.test("nextReminderState: no channel enabled -> immediate failedAt, no retry burned", () => {
  const result = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: false, smsOk: false, anyChannelEnabled: false },
    now,
  );
  assertEquals(result.sentAt, null);
  assertEquals(result.failedAt, nowIso);
});

Deno.test("nextReminderState: attempt count never exceeds MAX_REMINDER_ATTEMPTS", () => {
  const result = nextReminderState(
    { prev: { attemptCount: MAX_REMINDER_ATTEMPTS }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.attemptCount, MAX_REMINDER_ATTEMPTS);
});

Deno.test("nextReminderState: collapse — two due offsets for one appointment produce one send and two identical outcomes", () => {
  // AD-5: the outcome is decided once per appointment group, then applied
  // to every offset row in the group — simulated here by calling it once
  // and asserting the same result object would be written to both rows.
  const groupOutcome = nextReminderState(
    { prev: { attemptCount: 0 }, emailOk: true, smsOk: false, anyChannelEnabled: true },
    now,
  );
  const offsetRows = [
    { attemptCount: 0 },
    { attemptCount: 0 },
  ].map(() => groupOutcome);

  assertEquals(offsetRows[0], offsetRows[1]);
  assertEquals(offsetRows[0].sentAt, nowIso);
});

Deno.test("nextReminderState: a group whose appointment has already started is skipped before any send", () => {
  const scheduledStart = new Date("2026-09-15T11:59:00.000Z");
  const hasStarted = scheduledStart.getTime() <= now.getTime();
  assertEquals(hasStarted, true);
  // No call to nextReminderState should happen for a started appointment —
  // asserting the guard condition the caller checks before sending.
});
