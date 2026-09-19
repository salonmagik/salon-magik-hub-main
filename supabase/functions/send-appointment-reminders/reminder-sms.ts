/**
 * Reminder SMS pricing follows the existing bulk-SMS pricing contract:
 * two communication credits per provider SMS segment. Keeping this in a
 * shared, pure helper makes the scheduled path auditable and testable.
 */
export const SMS_CREDITS_PER_SEGMENT = 2;

export function getSmsSegments(message: string): number {
  return Math.max(1, Math.ceil(Math.max(message.trim().length, 1) / 160));
}

export function getReminderSmsCredits(message: string): number {
  return getSmsSegments(message) * SMS_CREDITS_PER_SEGMENT;
}
