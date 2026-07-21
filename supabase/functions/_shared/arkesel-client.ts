const ARKESEL_API_BASE = "https://sms.arkesel.com/api/v2";
// Country-specific API keys. Ghana (233) uses ARKESEL_API_KEY_GH; Nigeria (234) uses ARKESEL_API_KEY_NG.
const ARKESEL_API_KEY_GH = Deno.env.get("ARKESEL_API_KEY_GH");
const ARKESEL_API_KEY_NG = Deno.env.get("ARKESEL_API_KEY_NG");
// Registered sender IDs per country. Each must match what's approved on the Arkesel dashboard.
const ARKESEL_SENDER_ID_GH = Deno.env.get("ARKESEL_SENDER_ID_GH") ?? "SalonMagik";
const ARKESEL_SENDER_ID_NG = Deno.env.get("ARKESEL_SENDER_ID_NG") ?? "Salon Magik";

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

// Resolve the sender ID to use for a given recipient phone number.
// Tenant override takes precedence; otherwise falls back to the country-registered sender name.
export function resolveArkeselSenderId(recipientPhone: string, tenantSenderId?: string | null): string {
  if (tenantSenderId?.trim()) return tenantSenderId.trim();
  return detectCountry(recipientPhone) === "NG" ? ARKESEL_SENDER_ID_NG : ARKESEL_SENDER_ID_GH;
}

// Select the correct Arkesel API key for the given phone number.
// Nigeria (+234) → ARKESEL_API_KEY_NG; Ghana (+233) and unknown → ARKESEL_API_KEY_GH.
function getApiKeyForPhone(phone: string): string {
  const country = detectCountry(phone);
  if (country === "NG") {
    if (!ARKESEL_API_KEY_NG) throw new Error("ARKESEL_API_KEY_NG not configured");
    return ARKESEL_API_KEY_NG;
  }
  if (!ARKESEL_API_KEY_GH) throw new Error("ARKESEL_API_KEY_GH not configured");
  return ARKESEL_API_KEY_GH;
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

// Build the request body for an Arkesel send call.
// Nigeria (NG) requires use_case; Ghana does not. Omitting it from GH calls keeps payloads clean.
function buildSendBody(
  sender: string,
  message: string,
  recipients: string[],
  country: "NG" | "GH" | null,
  useCase: "transactional" | "promotional",
): Record<string, unknown> {
  const body: Record<string, unknown> = { sender, message, recipients };
  if (country === "NG") body.use_case = useCase;
  return body;
}

export async function sendArkeselSMS(options: {
  to: string;
  from: string;
  message: string;
  useCase?: "transactional" | "promotional";
}): Promise<ArkeselSMSResponse> {
  const country = detectCountry(options.to);
  const apiKey = getApiKeyForPhone(options.to);
  const response = await fetch(`${ARKESEL_API_BASE}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(
      buildSendBody(options.from, options.message, [normalizePhone(options.to)], country, options.useCase ?? "transactional"),
    ),
  });
  return handleArkeselResponse(response, "send");
}

export async function sendArkeselBulkSMS(options: {
  to: string[];
  from: string;
  message: string;
  useCase?: "transactional" | "promotional";
}): Promise<ArkeselSMSResponse> {
  // Group recipients by country so each Arkesel call uses the right API key and payload shape.
  const byKey = new Map<string, { apiKey: string; country: "NG" | "GH" | null; phones: string[] }>();
  for (const phone of options.to) {
    const country = detectCountry(phone);
    const apiKey = getApiKeyForPhone(phone);
    const group = byKey.get(apiKey) ?? { apiKey, country, phones: [] };
    group.phones.push(phone);
    byKey.set(apiKey, group);
  }

  if (byKey.size === 0) throw new Error("No recipients provided");

  let lastResponse: ArkeselSMSResponse | null = null;
  for (const { apiKey, country, phones } of byKey.values()) {
    const response = await fetch(`${ARKESEL_API_BASE}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(
        buildSendBody(options.from, options.message, phones.map(normalizePhone), country, options.useCase ?? "transactional"),
      ),
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
