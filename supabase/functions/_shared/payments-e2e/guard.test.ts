// Mocked-environment unit test for the payments-e2e production guard
// (design AD-4). No stack, no network — this is the one piece of harness
// code whose failure mode is catastrophic and silent, so it is tested in
// isolation with every relevant env var scrubbed and rebuilt per case.
//
//   deno test -A supabase/functions/_shared/payments-e2e/guard.test.ts

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSafeEnvironment, UnsafeEnvironmentError } from "./guard.ts";

const GUARDED_VARS = [
  "PAYSTACK_SECRET_KEY_GH",
  "PAYSTACK_SECRET_KEY_NG",
  "SUPABASE_URL",
  "PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS",
  "PAYMENTS_E2E_ACK",
];

const SAFE_ENV: Record<string, string> = {
  PAYSTACK_SECRET_KEY_GH: "sk_test_gh_abc123",
  PAYSTACK_SECRET_KEY_NG: "sk_test_ng_abc123",
  SUPABASE_URL: "http://127.0.0.1:54321",
  PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS: "prodrefabc123",
  PAYMENTS_E2E_ACK: "i-am-not-on-production",
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of GUARDED_VARS) previous[key] = Deno.env.get(key);

  try {
    for (const key of GUARDED_VARS) {
      const value = key in overrides ? overrides[key] : SAFE_ENV[key];
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    fn();
  } finally {
    for (const key of GUARDED_VARS) {
      if (previous[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[key]!);
    }
  }
}

Deno.test("passes when every condition holds", () => {
  withEnv({}, () => {
    assertEquals(assertSafeEnvironment(), undefined);
  });
});

Deno.test("throws when a Paystack key is live, not test-mode", () => {
  withEnv({ PAYSTACK_SECRET_KEY_GH: "sk_live_real_money" }, () => {
    assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "not a Paystack test-mode key");
  });
});

Deno.test("throws when the NG key is live even if the GH key is test-mode", () => {
  withEnv({ PAYSTACK_SECRET_KEY_NG: "sk_live_real_money" }, () => {
    assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "PAYSTACK_SECRET_KEY_NG");
  });
});

Deno.test("passes when a Paystack key is simply unset", () => {
  withEnv({ PAYSTACK_SECRET_KEY_NG: undefined }, () => {
    assertEquals(assertSafeEnvironment(), undefined);
  });
});

Deno.test("throws when SUPABASE_URL matches a forbidden project ref", () => {
  withEnv(
    {
      SUPABASE_URL: "https://prodrefabc123.supabase.co",
      PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS: "prodrefabc123",
    },
    () => {
      assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "forbidden project ref");
    },
  );
});

Deno.test("throws when PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS is not set at all", () => {
  withEnv({ PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS: undefined }, () => {
    assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS");
  });
});

Deno.test("throws when the acknowledgement is missing", () => {
  withEnv({ PAYMENTS_E2E_ACK: undefined }, () => {
    assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "PAYMENTS_E2E_ACK");
  });
});

Deno.test("throws when the acknowledgement string is wrong", () => {
  withEnv({ PAYMENTS_E2E_ACK: "yes-i-am-sure" }, () => {
    assertThrows(() => assertSafeEnvironment(), UnsafeEnvironmentError, "PAYMENTS_E2E_ACK");
  });
});

Deno.test("throws with every problem listed when everything is wrong at once", () => {
  withEnv(
    {
      PAYSTACK_SECRET_KEY_GH: "sk_live_x",
      SUPABASE_URL: "https://prodrefabc123.supabase.co",
      PAYMENTS_E2E_ACK: undefined,
    },
    () => {
      try {
        assertSafeEnvironment();
        throw new Error("expected assertSafeEnvironment to throw");
      } catch (error) {
        const message = (error as Error).message;
        assertEquals(message.includes("PAYSTACK_SECRET_KEY_GH"), true);
        assertEquals(message.includes("forbidden project ref"), true);
        assertEquals(message.includes("PAYMENTS_E2E_ACK"), true);
      }
    },
  );
});
