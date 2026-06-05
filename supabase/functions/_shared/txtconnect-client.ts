const TXTCONNECT_API_BASE = Deno.env.get("TXTCONNECT_API_BASE") || "https://api.txtconnect.net/dev/api";
const TXTCONNECT_API_KEY = Deno.env.get("TXTCONNECT_API_KEY");

export interface TxtconnectSMSResponse {
  messageId: string;
  msg: string;
  data?: {
    status_code?: string;
    message?: string;
    in_error?: boolean;
    reason?: string;
    data?: unknown[];
    point_in_time?: string;
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function resolveUnicodeType(message: string) {
  return /[^\x00-\x7F]/.test(message) ? "unicode" : "regular";
}

function ensureApiKey() {
  if (!TXTCONNECT_API_KEY) {
    throw new Error("TXTCONNECT_API_KEY not configured");
  }
  return TXTCONNECT_API_KEY;
}

async function handleTxtconnectResponse(response: Response, operation: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || `Txtconnect ${operation} failed with status ${response.status}`);
  }
  if (body?.data?.in_error === true) {
    throw new Error(body?.data?.reason || body?.msg || `Txtconnect ${operation} failed`);
  }
  return body as TxtconnectSMSResponse;
}

export async function sendTxtconnectSMS(options: {
  to: string;
  from: string;
  sms: string;
  unicode?: "unicode" | "regular";
}) {
  const apiKey = ensureApiKey();
  const response = await fetch(`${TXTCONNECT_API_BASE}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: normalizePhone(options.to),
      from: options.from,
      unicode: options.unicode || resolveUnicodeType(options.sms),
      sms: options.sms,
    }),
  });
  return handleTxtconnectResponse(response, "send");
}

export async function getTxtconnectSMSStatus(messageId: string) {
  const apiKey = ensureApiKey();
  const response = await fetch(`${TXTCONNECT_API_BASE}/sms/getstatus/${messageId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  return handleTxtconnectResponse(response, "getstatus");
}
