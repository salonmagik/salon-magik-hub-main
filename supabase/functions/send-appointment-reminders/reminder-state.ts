// Pure retry-decision logic for send-appointment-reminders (AD-3/AD-7),
// unit-testable without a database. Field names are dispatch-shaped
// (appointment_reminder_sends), not appointment-shaped: this decides the
// outcome for one send attempt covering every offset due for an
// appointment in a run (AD-5 collapse), not one appointment row.

export const MAX_REMINDER_ATTEMPTS = 3;

export interface ReminderAttemptState {
  attemptCount: number;
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
  sentAt: string | null;
  lastAttemptAt: string;
  attemptCount: number;
  failedAt: string | null;
}

/**
 * Decides the single dispatch-row outcome after both channel attempts for
 * one send (AD-5/AD-8). `now` is passed in rather than read internally so
 * the truth table is deterministic in tests. Applied identically to every
 * offset row in a collapsed group.
 */
export function nextReminderState(input: ReminderAttemptInput, now: Date): ReminderAttemptResult {
  const nowIso = now.toISOString();
  const anySucceeded = input.emailOk || input.smsOk;

  if (anySucceeded) {
    return {
      sentAt: nowIso,
      lastAttemptAt: nowIso,
      attemptCount: Math.min(input.prev.attemptCount + 1, MAX_REMINDER_ATTEMPTS),
      failedAt: null,
    };
  }

  // No channel enabled at all (no customer email/phone, or both toggles
  // off) — there is nothing to retry into, so it's a terminal failure on
  // the first pass rather than burning three empty attempts.
  if (!input.anyChannelEnabled) {
    return {
      sentAt: null,
      lastAttemptAt: nowIso,
      attemptCount: Math.min(input.prev.attemptCount + 1, MAX_REMINDER_ATTEMPTS),
      failedAt: nowIso,
    };
  }

  const nextAttemptCount = Math.min(input.prev.attemptCount + 1, MAX_REMINDER_ATTEMPTS);
  const exhausted = nextAttemptCount >= MAX_REMINDER_ATTEMPTS;

  return {
    sentAt: null,
    lastAttemptAt: nowIso,
    attemptCount: nextAttemptCount,
    failedAt: exhausted ? nowIso : null,
  };
}
