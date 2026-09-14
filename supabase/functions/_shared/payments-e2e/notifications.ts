// Captures outbound receipt/notification sends so "exactly once" is
// assertable (design section 9). processWebhook calls Resend directly via
// `fetch("https://api.resend.com/emails", ...)` and also invokes
// send-invoice/send-appointment-notification over HTTP — capture works by
// pointing RESEND_API_KEY at nothing reachable (or a capture inbox) and
// recording how many attempts happened, not by stubbing the functions
// themselves, which would stop testing them (design section 9: "not by
// stubbing the functions").
//
// This module does not send anything or intercept `fetch` globally — doing
// that would change the very code path under test. Instead it reads from
// whatever capture surface the operator has wired up for the run (a capture
// endpoint, or Mailpit for local Resend-equivalent testing) and exposes a
// uniform count. When no capture surface is configured, callers record the
// notification sub-assertion as `n/a` (design section 9) rather than
// claiming a count they cannot see.

export interface NotificationCaptureConfig {
  /**
   * A message-search API compatible with Mailpit's `/api/v1/search` shape.
   * processWebhook calls the real Resend HTTPS API directly, not local SMTP,
   * so this only captures anything if the operator points RESEND_API_KEY at
   * a proxy/sandbox that lands messages here — Mailpit itself sees nothing
   * from this path unset.
   */
  inboxApiUrl?: string;
}

export function loadNotificationCaptureConfig(): NotificationCaptureConfig {
  return {
    inboxApiUrl: Deno.env.get("PAYMENTS_E2E_INBOX_API_URL") ?? undefined,
  };
}

export interface CapturedSendCount {
  count: number | null;
  reason?: string;
}

/**
 * Counts messages sent to a given recipient address since `sinceIso`, via
 * the configured inbox capture API. Returns `count: null` with a reason when
 * no capture surface is configured — callers must record that sub-assertion
 * as `n/a`, never assume 0.
 */
export async function countCapturedSendsTo(
  config: NotificationCaptureConfig,
  recipient: string,
  sinceIso: string,
): Promise<CapturedSendCount> {
  if (!config.inboxApiUrl) {
    return { count: null, reason: "no notification capture surface configured (PAYMENTS_E2E_INBOX_API_URL unset)" };
  }

  try {
    const url = `${config.inboxApiUrl}/search?query=${encodeURIComponent(`to:${recipient}`)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { count: null, reason: `inbox capture query failed with HTTP ${res.status}` };
    }
    const body = await res.json();
    const messages: Array<{ Created?: string }> = body.messages ?? [];
    const since = new Date(sinceIso).getTime();
    const count = messages.filter((m) => !m.Created || new Date(m.Created).getTime() >= since).length;
    return { count };
  } catch (error) {
    return { count: null, reason: `inbox capture query threw: ${error instanceof Error ? error.message : String(error)}` };
  }
}
