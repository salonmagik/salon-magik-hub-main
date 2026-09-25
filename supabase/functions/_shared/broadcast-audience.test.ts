import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDerivedAudience } from "./broadcast-audience.ts";

Deno.test("rejects a zero-count derived audience", () => {
  assertEquals(
    validateDerivedAudience(["customer-1"], new Set<string>()),
    { ok: false, code: "AUDIENCE_EMPTY" },
  );
});

Deno.test("rejects recipients forged outside the selected segment", () => {
  assertEquals(
    validateDerivedAudience(["vip-1", "forged-1"], new Set(["vip-1"])),
    { ok: false, code: "AUDIENCE_SEGMENT_MISMATCH", customerIds: ["forged-1"] },
  );
});

Deno.test("allows a deliberate subset of a non-empty segment", () => {
  assertEquals(
    validateDerivedAudience(["vip-1"], new Set(["vip-1", "vip-2"])),
    { ok: true },
  );
});
