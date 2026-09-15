import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendResendEmail } from "./salon-notifications.ts";

function mockSupabase(insertedRows: Record<string, unknown>[], options?: { insertThrows?: boolean }) {
  return {
    from(table: string) {
      assertEquals(table, "message_logs");
      return {
        insert: (rows: Record<string, unknown>[]) => {
          if (options?.insertThrows) {
            return Promise.resolve({ error: new Error("insert failed") });
          }
          insertedRows.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function baseInput(overrides: Partial<Parameters<typeof sendResendEmail>[0]> = {}) {
  return {
    resendApiKey: "test-key",
    fromEmail: "noreply@salonmagik.com",
    to: ["owner@example.com"],
    subject: "Test subject",
    htmlContent: "<p>Hello</p>",
    salonName: "Test Salon",
    log: {
      supabase: mockSupabase([]),
      tenantId: "tenant-1",
      templateType: "low_balance_alert" as const,
    },
    ...overrides,
  };
}

Deno.test("sendResendEmail: success returns sent:true and writes a sent row per recipient", async () => {
  const rows: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({ log: { supabase: mockSupabase(rows), tenantId: "tenant-1", templateType: "low_balance_alert" } }),
    );

    assertEquals(result, { sent: true, messageId: "msg_123" });
    assertEquals(rows.length, 1);
    assertEquals(rows[0].status, "sent");
    assertEquals(rows[0].credits_used, 0);
    assertEquals(rows[0].initiated_by, "system");
    assertEquals(rows[0].provider, "resend");
    assertEquals(rows[0].channel, "email");
    assertEquals(rows[0].content, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: Resend 422 -> errorKind 'recipient' and a failed row per recipient", async () => {
  const rows: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("Invalid `to` field", { status: 422 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({ log: { supabase: mockSupabase(rows), tenantId: "tenant-1", templateType: "low_balance_alert" } }),
    );

    assertEquals(result.sent, false);
    assertEquals(result.errorKind, "recipient");
    assertEquals(rows.length, 1);
    assertEquals(rows[0].status, "failed");
    assert((rows[0].error_message as string).startsWith("recipient:"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: Resend 401 -> errorKind 'auth'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("Unauthorized", { status: 401 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(baseInput());
    assertEquals(result.sent, false);
    assertEquals(result.errorKind, "auth");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: Resend 500 -> errorKind 'provider'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("Server error", { status: 500 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(baseInput());
    assertEquals(result.sent, false);
    assertEquals(result.errorKind, "provider");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: fetch rejects -> errorKind 'network'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("connection reset"))) as typeof fetch;

  try {
    const result = await sendResendEmail(baseInput());
    assertEquals(result.sent, false);
    assertEquals(result.errorKind, "network");
    assert(result.error?.startsWith("network: connection reset"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: missing API key -> errorKind 'config' and a row IS written (the regression this work exists to prevent)", async () => {
  const rows: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({
        resendApiKey: undefined,
        log: { supabase: mockSupabase(rows), tenantId: "tenant-1", templateType: "low_balance_alert" },
      }),
    );

    assertEquals(result.sent, false);
    assertEquals(result.errorKind, "config");
    assert(!fetchCalled, "must not call Resend when the key is absent");
    assertEquals(rows.length, 1);
    assertEquals(rows[0].status, "failed");
    assertEquals(rows[0].error_message, "config: RESEND_API_KEY not configured");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: empty/whitespace `to[]` -> sent:false and no row written", async () => {
  const rows: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({
        to: ["  ", ""],
        log: { supabase: mockSupabase(rows), tenantId: "tenant-1", templateType: "low_balance_alert" },
      }),
    );

    assertEquals(result, { sent: false, error: "recipient: no recipients" });
    assertEquals(rows.length, 0);
    assert(!fetchCalled);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: message_logs insert throws while the send succeeded -> still sent:true", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ id: "msg_ok" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({
        log: { supabase: mockSupabase([], { insertThrows: true }), tenantId: "tenant-1", templateType: "low_balance_alert" },
      }),
    );

    assertEquals(result.sent, true);
    assertEquals(result.messageId, "msg_ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendResendEmail: error_message truncated at 1000 chars", async () => {
  const rows: Record<string, unknown>[] = [];
  const longBody = "x".repeat(2000);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(longBody, { status: 500 }))) as typeof fetch;

  try {
    const result = await sendResendEmail(
      baseInput({ log: { supabase: mockSupabase(rows), tenantId: "tenant-1", templateType: "low_balance_alert" } }),
    );

    assertEquals(result.sent, false);
    assertExists(rows[0].error_message);
    assertEquals((rows[0].error_message as string).length, 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
