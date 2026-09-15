// Pure retry-decision logic for send-appointment-reminders (AD-7/AD-8),
// unit-testable without a database.

export const MAX_REMINDER_ATTEMPTS = 3;

export interface ReminderAttemptState {
  reminderAttemptCount: number;
}

export interface ReminderAttemptInput {
  prev: ReminderAttemptState;
  /** true if the email leg was attempted and succeeded */
  emailOk: boolean;
  /** true if the SMS leg was attempted and succeeded */
  smsOk: boolean;
  /** true if at least one channel was enabled and attempted this run */
  anyChannelEnabled: boolean;
}

export interface ReminderAttemptResult {
  lastReminderSentAt: string | null;
  lastReminderAttemptAt: string;
  reminderAttemptCount: number;
  reminderFailedAt: string | null;
}

/**
 * Decides the single end-of-appointment state update after both channel
 * attempts for one reminders-job run (AD-8). `now` is passed in rather than
 * read internally so the truth table is deterministic in tests.
 */
export function nextReminderState(input: ReminderAttemptInput, now: Date): ReminderAttemptResult {
  const nowIso = now.toISOString();
  const anySucceeded = input.emailOk || input.smsOk;

  if (anySucceeded) {
    return {
      lastReminderSentAt: nowIso,
      lastReminderAttemptAt: nowIso,
      reminderAttemptCount: Math.min(input.prev.reminderAttemptCount + 1, MAX_REMINDER_ATTEMPTS),
      reminderFailedAt: null,
    };
  }

  // No channel enabled at all (no customer email/phone, or both toggles
  // off) — there is nothing to retry into, so it's a terminal failure on
  // the first pass rather than burning three empty attempts.
  if (!input.anyChannelEnabled) {
    return {
      lastReminderSentAt: null,
      lastReminderAttemptAt: nowIso,
      reminderAttemptCount: Math.min(input.prev.reminderAttemptCount + 1, MAX_REMINDER_ATTEMPTS),
      reminderFailedAt: nowIso,
    };
  }

  const nextAttemptCount = Math.min(input.prev.reminderAttemptCount + 1, MAX_REMINDER_ATTEMPTS);
  const exhausted = nextAttemptCount >= MAX_REMINDER_ATTEMPTS;

  return {
    lastReminderSentAt: null,
    lastReminderAttemptAt: nowIso,
    reminderAttemptCount: nextAttemptCount,
    reminderFailedAt: exhausted ? nowIso : null,
  };
}
