export type DigestFrequency = "daily" | "weekly" | "monthly";

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/** The cron runs daily; this decides whether a tenant's selected cadence fires. */
export function shouldSendToday(frequency: DigestFrequency, now: Date): boolean {
  if (frequency === "daily") return true;
  if (frequency === "weekly") return now.getUTCDay() === 1;
  return now.getUTCDate() === 1;
}

export function periodRange(
  frequency: DigestFrequency,
  now: Date,
): { start: Date; end: Date; label: string } {
  const end = endOfUtcDay(now);
  if (frequency === "daily") {
    return { start: startOfUtcDay(now), end, label: "today" };
  }
  if (frequency === "weekly") {
    const start = startOfUtcDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    return { start, end, label: "this week" };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end, label: "this month" };
}

export function formatDateRange(frequency: DigestFrequency, start: Date, end: Date): string {
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  if (frequency === "daily") return fmt(end);
  return `${fmt(start)} – ${fmt(end)}`;
}
