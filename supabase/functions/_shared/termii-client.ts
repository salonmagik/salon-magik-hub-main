/**
 * Termii API Client for Supabase Edge Functions
 * 
 * Provides functions to send SMS and WhatsApp messages via Termii API.
 * 
 * API Documentation: https://developers.termii.com/
 */

const TERMII_API_BASE = Deno.env.get("TERMII_API_BASE");
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");

if (!TERMII_API_KEY) {
  console.warn("TERMII_API_KEY not set - Termii functionality will not work");
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TermiiSMSRequest {
  to: string; // Phone number in international format WITHOUT + (e.g., 2347880234567)
  from: string; // Sender ID (alphanumeric 3-11 chars)
  sms: string; // Message content (max 160 chars plain, 70 chars unicode)
  type: "plain" | "unicode";
  channel: "generic" | "dnd"; // 'generic' for normal, 'dnd' for DND numbers
  api_key: string;
  media_url?: string; // Optional media URL
  media_caption?: string; // Optional caption for media
}

export interface TermiiWhatsAppTemplateRequest {
  api_key: string;
  device_id: string; // Termii WhatsApp device ID
  phone_number: string; // Recipient phone number in international format WITHOUT + (e.g., 2347880234567)
  template_id: string; // Approved template ID from Termii
  data: Record<string, string>; // Template variable values (e.g., { "1": "John", "2": "3pm" })
  media?: {
    url: string; // Media URL (image, video, document)
    caption?: string; // Optional caption
  };
}

export interface TermiiBulkSMSRequest {
  to: string[]; // Array of phone numbers (max 100)
  from: string; // Sender ID
  sms: string; // Message content
  type: "plain" | "unicode";
  channel: "generic" | "dnd";
  api_key: string;
}

export interface TermiiResponse {
  message: string;
  message_id: string; // Termii message ID for tracking
  balance?: number; // Remaining Termii account balance
  user?: string; // Account email
  code?: string; // Error code (e.g., "ok", "insufficient_balance")
  error?: string; // Error message
}

export interface TermiiBulkSMSResponse {
  code: string; // "ok" or error code
  message_id: string; // Bulk message ID
  message: string; // Status message
  balance: number; // Remaining Termii account balance
  user: string; // Account email
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates and formats a phone number for Termii API
 * Removes + prefix if present, validates international format
 * @throws Error if phone number is invalid
 */
export function validatePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Remove + prefix if present (Termii expects no +)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Validate: should be 10-15 digits
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error(`Invalid phone number format: ${phone}. Expected international format without + (e.g., 2347880234567)`);
  }

  // Validate: should start with country code (first digit 1-9)
  if (!/^[1-9]/.test(cleaned)) {
    throw new Error(`Invalid phone number: ${phone}. Must start with country code (e.g., 234 for Nigeria)`);
  }

  return cleaned;
}

/**
 * Validates SMS message length based on character type
 * @throws Error if message exceeds limits
 */
export function validateSMSContent(message: string, type: "plain" | "unicode"): void {
  const maxLength = type === "plain" ? 160 : 70;

  if (message.length > maxLength) {
    throw new Error(`SMS message too long. ${type} messages are limited to ${maxLength} characters (current: ${message.length})`);
  }

  if (message.trim().length === 0) {
    throw new Error("SMS message cannot be empty");
  }
}

/**
 * Detects if message contains unicode characters
 */
export function detectMessageType(message: string): "plain" | "unicode" {
  // Check for non-ASCII characters
  return /[^\x00-\x7F]/.test(message) ? "unicode" : "plain";
}

/**
 * Handles Termii API error responses
 * @throws Error with descriptive message based on status code
 */
async function handleTermiiError(response: Response, operation: string): Promise<never> {
  const status = response.status;
  let errorMessage = `Termii API error during ${operation}`;

  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || errorMessage;
  } catch {
    // If JSON parsing fails, use generic error
    errorMessage = `${errorMessage}: ${response.statusText}`;
  }

  switch (status) {
    case 400:
      throw new Error(`Bad Request: ${errorMessage}. Check phone number format and request parameters.`);
    case 401:
      throw new Error(`Authentication failed: ${errorMessage}. Check TERMII_API_KEY environment variable.`);
    case 403:
      throw new Error(`Forbidden: ${errorMessage}. Your API key may not have permission for this operation.`);
    case 422:
      throw new Error(`Validation error: ${errorMessage}. Check template ID, device ID, and template variables.`);
    case 429:
      throw new Error(`Rate limit exceeded: ${errorMessage}. Too many requests to Termii API. Please retry later.`);
    case 500:
    case 502:
    case 503:
      throw new Error(`Termii service error: ${errorMessage}. Please try again later.`);
    default:
      throw new Error(`${errorMessage} (HTTP ${status})`);
  }
}

// ============================================================================
// SMS FUNCTIONS
// ============================================================================

/**
 * Sends a single SMS message via Termii API
 * 
 * @param options SMS request options
 * @returns Termii API response with message_id for tracking
 * @throws Error if API call fails or validation fails
 * 
 * @example
 * ```typescript
 * const response = await sendTermiiSMS({
 *   to: "2347880234567",
 *   from: "SalonMagik",
 *   sms: "Your appointment is confirmed for tomorrow at 3pm",
 *   type: "plain",
 *   channel: "generic",
 *   api_key: TERMII_API_KEY
 * });
 * console.log("Message ID:", response.message_id);
 * ```
 */
export async function sendTermiiSMS(
  options: Omit<TermiiSMSRequest, "api_key"> & { api_key?: string }
): Promise<TermiiResponse> {
  const apiKey = options.api_key || TERMII_API_KEY;

  if (!apiKey) {
    throw new Error("TERMII_API_KEY not configured. Set TERMII_API_KEY environment variable.");
  }

  // Validate phone number
  const phoneNumber = validatePhoneNumber(options.to);

  // Auto-detect message type if not specified
  const messageType = options.type || detectMessageType(options.sms);

  // Validate SMS content length
  validateSMSContent(options.sms, messageType);

  // Build request body
  const requestBody: TermiiSMSRequest = {
    to: phoneNumber,
    from: options.from,
    sms: options.sms,
    type: messageType,
    channel: options.channel || "generic",
    api_key: apiKey,
  };

  // Add optional media fields
  if (options.media_url) {
    requestBody.media_url = options.media_url;
  }
  if (options.media_caption) {
    requestBody.media_caption = options.media_caption;
  }

  // Send request to Termii API
  const response = await fetch(`${TERMII_API_BASE}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    await handleTermiiError(response, "sendTermiiSMS");
  }

  const data: TermiiResponse = await response.json();

  // Check for API-level errors (Termii returns 200 even for some errors)
  if (data.error || (data.code && data.code !== "ok")) {
    throw new Error(`Termii API error: ${data.error || data.message}`);
  }

  return data;
}

/**
 * Sends a WhatsApp message using an approved template via Termii API
 * 
 * WhatsApp messages must use pre-approved templates. Free-form messages are not allowed.
 * 
 * @param options WhatsApp template request options
 * @returns Termii API response with message_id for tracking
 * @throws Error if API call fails, template not approved, or device not found
 * 
 * @example
 * ```typescript
 * const response = await sendTermiiWhatsAppTemplate({
 *   device_id: "abc123",
 *   phone_number: "2347880234567",
 *   template_id: "template_xyz",
 *   data: {
 *     "1": "John Doe",
 *     "2": "3:00 PM"
 *   },
 *   media: {
 *     url: "https://example.com/image.jpg",
 *     caption: "Your appointment details"
 *   }
 * });
 * console.log("Message ID:", response.message_id);
 * ```
 */
export async function sendTermiiWhatsAppTemplate(
  options: Omit<TermiiWhatsAppTemplateRequest, "api_key"> & { api_key?: string }
): Promise<TermiiResponse> {
  const apiKey = options.api_key || TERMII_API_KEY;

  if (!apiKey) {
    throw new Error("TERMII_API_KEY not configured. Set TERMII_API_KEY environment variable.");
  }

  // Validate required fields
  if (!options.device_id) {
    throw new Error("device_id is required for WhatsApp messages. Configure Termii device ID in tenant settings.");
  }

  if (!options.template_id) {
    throw new Error("template_id is required for WhatsApp messages. WhatsApp requires pre-approved templates.");
  }

  // Validate phone number
  const phoneNumber = validatePhoneNumber(options.phone_number);

  // Build request body
  const requestBody: TermiiWhatsAppTemplateRequest = {
    api_key: apiKey,
    device_id: options.device_id,
    phone_number: phoneNumber,
    template_id: options.template_id,
    data: options.data || {},
  };

  // Add optional media
  if (options.media) {
    requestBody.media = options.media;
  }

  // Send request to Termii WhatsApp API
  const response = await fetch(`${TERMII_API_BASE}/send/template`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    await handleTermiiError(response, "sendTermiiWhatsAppTemplate");
  }

  const data: TermiiResponse = await response.json();

  // Check for API-level errors
  if (data.error) {
    // Provide helpful error messages for common WhatsApp errors
    if (data.error.includes("device")) {
      throw new Error(`Termii device not found: ${data.error}. Check device_id in tenant settings.`);
    }
    if (data.error.includes("template")) {
      throw new Error(`WhatsApp template error: ${data.error}. Ensure template is approved in Termii dashboard.`);
    }
    throw new Error(`Termii WhatsApp error: ${data.error}`);
  }

  return data;
}

/**
 * Sends bulk SMS messages to multiple recipients via Termii API
 * 
 * Termii supports up to 100 recipients per bulk request.
 * For larger batches, split into multiple requests.
 * 
 * @param options Bulk SMS request options
 * @returns Termii API response with message_id for tracking the bulk operation
 * @throws Error if API call fails, recipient count exceeds 100, or validation fails
 * 
 * @example
 * ```typescript
 * const response = await sendTermiiBulkSMS({
 *   to: ["2347880234567", "2348012345678"],
 *   from: "SalonMagik",
 *   sms: "Special promotion: 20% off this weekend!",
 *   type: "plain",
 *   channel: "generic"
 * });
 * console.log("Bulk Message ID:", response.message_id);
 * ```
 */
export async function sendTermiiBulkSMS(
  options: Omit<TermiiBulkSMSRequest, "api_key"> & { api_key?: string }
): Promise<TermiiBulkSMSResponse> {
  const apiKey = options.api_key || TERMII_API_KEY;

  if (!apiKey) {
    throw new Error("TERMII_API_KEY not configured. Set TERMII_API_KEY environment variable.");
  }

  // Validate recipient count (Termii max: 100)
  if (!options.to || options.to.length === 0) {
    throw new Error("Recipient list cannot be empty");
  }

  if (options.to.length > 100) {
    throw new Error(`Too many recipients: ${options.to.length}. Termii bulk SMS supports max 100 recipients per request. Split into smaller batches.`);
  }

  // Validate and format all phone numbers
  const phoneNumbers = options.to.map(phone => {
    try {
      return validatePhoneNumber(phone);
    } catch (error) {
      throw new Error(`Invalid phone number in bulk list: ${phone}. ${error instanceof Error ? error.message : ""}`);
    }
  });

  // Auto-detect message type if not specified
  const messageType = options.type || detectMessageType(options.sms);

  // Validate SMS content length
  validateSMSContent(options.sms, messageType);

  // Build request body
  const requestBody: TermiiBulkSMSRequest = {
    to: phoneNumbers,
    from: options.from,
    sms: options.sms,
    type: messageType,
    channel: options.channel || "generic",
    api_key: apiKey,
  };

  // Send request to Termii Bulk SMS API
  const response = await fetch(`${TERMII_API_BASE}/sms/send/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    await handleTermiiError(response, "sendTermiiBulkSMS");
  }

  const data: TermiiBulkSMSResponse = await response.json();

  // Check for API-level errors
  if (data.code !== "ok") {
    throw new Error(`Termii bulk SMS error: ${data.message || "Unknown error"}`);
  }

  return data;
}
