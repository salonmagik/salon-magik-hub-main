const ARKESEL_API_BASE = "https://sms.arkesel.com/api/v2";
const ARKESEL_API_KEY = Deno.env.get("ARKESEL_API_KEY");

export interface ArkeselSMSResult {
  ID: string;
  status: string;
  sender: string;
  recipient: string;
  message: string;
  message_count: number;
  sent_at_time: string;
}

export interface ArkeselSMSResponse {
  status: "success" | "error";
  data: ArkeselSMSResult | ArkeselSMSResult[];
}

function ensureApiKey(): string {
  if (!ARKESEL_API_KEY) {
    throw new Error("ARKESEL_API_KEY not configured");
  }
  return ARKESEL_API_KEY;
}

// Strip leading + and any non-digit characters, keeping the international prefix.
// Arkesel expects e.g. "233XXXXXXXXX" (Ghana) or "234XXXXXXXXX" (Nigeria) — no leading +.
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

async function handleArkeselResponse(response: Response, operation: string): Promise<ArkeselSMSResponse> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  console.log(`[arkesel] ${operation} HTTP ${response.status}:`, JSON.stringify(body));
  if (!response.ok) {
    throw new Error(
      (body?.message as string) ||
        `Arkesel ${operation} failed with HTTP ${response.status}`,
    );
  }
  if ((body?.status as string) !== "success") {
    throw new Error((body?.message as string) || `Arkesel ${operation} returned status: ${body?.status}`);
  }
  return body as ArkeselSMSResponse;
}

export async function sendArkeselSMS(options: {
  to: string;
  from: string;
  message: string;
}): Promise<ArkeselSMSResponse> {
  const apiKey = ensureApiKey();
  const response = await fetch(`${ARKESEL_API_BASE}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: options.from,
      message: options.message,
      recipients: [normalizePhone(options.to)],
    }),
  });
  return handleArkeselResponse(response, "send");
}

export async function sendArkeselBulkSMS(options: {
  to: string[];
  from: string;
  message: string;
}): Promise<ArkeselSMSResponse> {
  const apiKey = ensureApiKey();
  const response = await fetch(`${ARKESEL_API_BASE}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: options.from,
      message: options.message,
      recipients: options.to.map(normalizePhone),
    }),
  });
  return handleArkeselResponse(response, "bulk-send");
}

// Returns the message ID from a single or bulk response for logging.
export function extractArkeselMessageId(response: ArkeselSMSResponse): string | null {
  if (!response.data) return null;
  if (Array.isArray(response.data)) return response.data[0]?.ID ?? null;
  return (response.data as ArkeselSMSResult).ID ?? null;
}
