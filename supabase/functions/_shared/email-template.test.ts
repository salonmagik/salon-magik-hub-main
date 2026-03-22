import {
  buildFromAddress,
  getSenderName,
  sanitizeEmailDisplayName,
} from "./email-template.ts";
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("getSenderName keeps exact product branding", () => {
  assertEquals(getSenderName({ mode: "product" }), "Salon Magik");
});

Deno.test("getSenderName keeps salon name characters", () => {
  assertEquals(
    getSenderName({ mode: "salon", salonName: "L'Étoile & Co." }),
    "L'Étoile & Co. via Salon Magik",
  );
});

Deno.test("sanitizeEmailDisplayName only strips control/header-breaking chars", () => {
  assertEquals(
    sanitizeEmailDisplayName("  L'Étoile & Co.\n\r<>  "),
    "L'Étoile & Co.",
  );
});

Deno.test("buildFromAddress uses sanitized display name", () => {
  const fromAddress = buildFromAddress({
    mode: "salon",
    salonName: "A&B\r\n<Studios>",
    fromEmail: "noreply@salonmagik.com",
  });

  assertStringIncludes(fromAddress, "A&BStudios via Salon Magik");
  assertStringIncludes(fromAddress, "<noreply@salonmagik.com>");
});
