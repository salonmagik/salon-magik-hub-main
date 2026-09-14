// Production-safety guard for the payments-e2e harness (AD-4).
//
// assertSafeEnvironment() is the one place every harness entry point passes
// through before touching a database or Paystack. It fails closed: unless
// every Paystack key in the environment is a test-mode key, the Supabase
// project is not a forbidden (production) ref, and the operator has typed an
// explicit acknowledgement, nothing runs. There is no override and no
// warn-and-continue path — see design AD-4 for why.

const ACK_VALUE = "i-am-not-on-production";

export class UnsafeEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeEnvironmentError";
  }
}

// The design (AD-4) calls for this list to default to "the prod ref". No
// production Supabase project ref is recorded anywhere this harness can read
// it from (not in the PRD, the Technical Brief, or this repo's committed
// config — supabase/config.toml's project_id is the *local* dev stack's
// container-naming ref, not a verified production ref, and guessing wrong
// here would make the fail-closed guarantee a lie). So there is no hardcoded
// default: PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS must be set explicitly, and
// its absence is itself a reason to fail closed rather than run unguarded.
function forbiddenProjectRefs(): string[] {
  const raw = Deno.env.get("PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS");
  if (!raw) return [];
  return raw.split(",").map((ref) => ref.trim()).filter(Boolean);
}

function paystackKeyEnvVars(): string[] {
  return ["PAYSTACK_SECRET_KEY_GH", "PAYSTACK_SECRET_KEY_NG"];
}

/**
 * Throws unless all three hold:
 *  1. Every Paystack secret key present in the environment starts with
 *     `sk_test_` (a key that isn't set at all is fine — that currency's
 *     cells simply can't run, which is a different, non-fatal problem).
 *  2. SUPABASE_URL does not reference a forbidden (production) project ref.
 *  3. PAYMENTS_E2E_ACK is exactly the required acknowledgement string.
 */
export function assertSafeEnvironment(): void {
  const problems: string[] = [];

  for (const envVar of paystackKeyEnvVars()) {
    const value = Deno.env.get(envVar);
    if (value && !value.startsWith("sk_test_")) {
      problems.push(`${envVar} is not a Paystack test-mode key (must start with sk_test_)`);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const forbidden = forbiddenProjectRefs();
  if (forbidden.length === 0) {
    problems.push(
      "PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS is not set — no production ref is recorded anywhere " +
        "this harness can verify, so it must be supplied explicitly rather than assumed",
    );
  } else {
    const matchedForbiddenRef = forbidden.find((ref) => ref.length > 0 && supabaseUrl.includes(ref));
    if (matchedForbiddenRef) {
      problems.push(`SUPABASE_URL (${supabaseUrl}) matches forbidden project ref "${matchedForbiddenRef}"`);
    }
  }

  if (Deno.env.get("PAYMENTS_E2E_ACK") !== ACK_VALUE) {
    problems.push(`PAYMENTS_E2E_ACK must be set to "${ACK_VALUE}"`);
  }

  if (problems.length > 0) {
    throw new UnsafeEnvironmentError(
      `Refusing to run payments-e2e harness — unsafe environment:\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }
}
