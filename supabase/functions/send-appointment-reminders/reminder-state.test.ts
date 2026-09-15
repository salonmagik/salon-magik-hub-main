import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextReminderState, MAX_REMINDER_ATTEMPTS } from "./reminder-state.ts";

const now = new Date("2026-09-15T12:00:00.000Z");
const nowIso = now.toISOString();

Deno.test("nextReminderState: email-only success -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 0 }, emailOk: true, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, nowIso);
  assertEquals(result.reminderFailedAt, null);
  assertEquals(result.reminderAttemptCount, 1);
});

Deno.test("nextReminderState: SMS-only success -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 0 }, emailOk: false, smsOk: true, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, nowIso);
  assertEquals(result.reminderFailedAt, null);
});

Deno.test("nextReminderState: both channels succeed -> sent, no retry", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 0 }, emailOk: true, smsOk: true, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, nowIso);
  assertEquals(result.reminderFailedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 0 -> 1, not exhausted", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 0 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, null);
  assertEquals(result.reminderAttemptCount, 1);
  assertEquals(result.reminderFailedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 1 -> 2, not exhausted", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 1 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, null);
  assertEquals(result.reminderAttemptCount, 2);
  assertEquals(result.reminderFailedAt, null);
});

Deno.test("nextReminderState: both fail, attempt 2 -> 3, exhausted, reminderFailedAt set", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 2 }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.lastReminderSentAt, null);
  assertEquals(result.reminderAttemptCount, 3);
  assertEquals(result.reminderFailedAt, nowIso);
});

Deno.test("nextReminderState: no channel enabled -> immediate reminderFailedAt, no retry burned", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: 0 }, emailOk: false, smsOk: false, anyChannelEnabled: false },
    now,
  );
  assertEquals(result.lastReminderSentAt, null);
  assertEquals(result.reminderFailedAt, nowIso);
});

Deno.test("nextReminderState: attempt count never exceeds MAX_REMINDER_ATTEMPTS", () => {
  const result = nextReminderState(
    { prev: { reminderAttemptCount: MAX_REMINDER_ATTEMPTS }, emailOk: false, smsOk: false, anyChannelEnabled: true },
    now,
  );
  assertEquals(result.reminderAttemptCount, MAX_REMINDER_ATTEMPTS);
});
