import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatDateRange, periodRange, shouldSendToday } from "./digest-schedule.ts";

const monday = new Date("2026-09-21T07:00:00.000Z");

Deno.test("daily digest is eligible every day", () => {
  assertEquals(shouldSendToday("daily", new Date("2026-09-22T07:00:00.000Z")), true);
});

Deno.test("weekly digest is eligible only on Monday", () => {
  assertEquals(shouldSendToday("weekly", monday), true);
  assertEquals(shouldSendToday("weekly", new Date("2026-09-22T07:00:00.000Z")), false);
});

Deno.test("monthly digest is eligible only on the first day", () => {
  assertEquals(shouldSendToday("monthly", new Date("2026-10-01T07:00:00.000Z")), true);
  assertEquals(shouldSendToday("monthly", new Date("2026-10-02T07:00:00.000Z")), false);
});

Deno.test("period ranges cover the selected UTC reporting period", () => {
  const range = periodRange("weekly", monday);
  assertEquals(range.start.toISOString(), "2026-09-15T00:00:00.000Z");
  assertEquals(range.end.toISOString(), "2026-09-21T23:59:59.999Z");
  assertEquals(formatDateRange("weekly", range.start, range.end), "2026-09-15 – 2026-09-21");
});
