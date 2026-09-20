import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getReminderSmsCredits,
  getSmsSegments,
  SMS_CREDITS_PER_SEGMENT,
} from "./reminder-sms.ts";

Deno.test("appointment reminder SMS uses the same two-credit rate as bulk SMS", () => {
  assertEquals(getReminderSmsCredits("Your appointment is tomorrow"), SMS_CREDITS_PER_SEGMENT);
});

Deno.test("appointment reminder SMS charges every 160-character segment", () => {
  const message = "x".repeat(321);
  assertEquals(getSmsSegments(message), 3);
  assertEquals(getReminderSmsCredits(message), 3 * SMS_CREDITS_PER_SEGMENT);
});

Deno.test("empty reminder content still has one provider segment", () => {
  assertEquals(getSmsSegments("   "), 1);
  assertEquals(getReminderSmsCredits("   "), SMS_CREDITS_PER_SEGMENT);
});
