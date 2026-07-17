const ARKESEL_API_BASE = "https://sms.arkesel.com/api/v2";
// Country-specific API keys. Ghana (233) uses ARKESEL_API_KEY; Nigeria (234) uses ARKESEL_API_KEY_NG.
const ARKESEL_API_KEY = Deno.env.get("ARKESEL_API_KEY");
const ARKESEL_API_KEY_NG = Deno.env.get("ARKESEL_API_KEY_NG");

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

// Strip leading + and any non-digit characters, keeping the international prefix.
// Arkesel expects e.g. "233XXXXXXXXX" (Ghana) or "234XXXXXXXXX" (Nigeria) — no leading +.
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

// Detect country from E.164 or already-normalized phone number.
function detectCountry(phone: string): "NG" | "GH" | null {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith("234")) return "NG";
  if (normalized.startsWith("233")) return "GH";
  return null;
}

// Select the correct Arkesel API key for the given phone number.
// Nigeria (+234) → ARKESEL_API_KEY_NG; Ghana (+233) and unknown → ARKESEL_API_KEY.
function getApiKeyForPhone(phone: string): string {
  const country = detectCountry(phone);
  if (country === "NG") {
    if (!ARKESEL_API_KEY_NG) throw new Error("ARKESEL_API_KEY_NG not configured");
    return ARKESEL_API_KEY_NG;
  }
  if (!ARKESEL_API_KEY) throw new Error("ARKESEL_API_KEY not configured");
  return ARKESEL_API_KEY;
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
  const apiKey = getApiKeyForPhone(options.to);
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
  // Group recipients by API key (i.e. by country) so each Arkesel call uses the right key.
  const byApiKey = new Map<string, string[]>();
  for (const phone of options.to) {
    const key = getApiKeyForPhone(phone);
    const group = byApiKey.get(key) ?? [];
    group.push(phone);
    byApiKey.set(key, group);
  }

  if (byApiKey.size === 0) throw new Error("No recipients provided");

  let lastResponse: ArkeselSMSResponse | null = null;
  for (const [apiKey, recipients] of byApiKey) {
    const response = await fetch(`${ARKESEL_API_BASE}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: options.from,
        message: options.message,
        recipients: recipients.map(normalizePhone),
      }),
    });
    lastResponse = await handleArkeselResponse(response, "bulk-send");
  }

  return lastResponse!;
}

// Returns the message ID from a single or bulk response for logging.
export function extractArkeselMessageId(response: ArkeselSMSResponse): string | null {
  if (!response.data) return null;
  if (Array.isArray(response.data)) return response.data[0]?.ID ?? null;
  return (response.data as ArkeselSMSResult).ID ?? null;
}
