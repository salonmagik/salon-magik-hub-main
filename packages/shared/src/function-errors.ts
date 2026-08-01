// Supabase Edge Function errors: when a function returns a non-2xx status,
// supabase-js throws a FunctionsHttpError whose `.message` is the unhelpful
// "Edge Function returned a non-2xx status code" and whose real payload lives
// in `.context` (the raw Response). This helper pulls the actual `{ error }`
// message out of the response body so the UI never surfaces the generic string.

const GENERIC_FUNCTION_ERROR = "Edge Function returned a non-2xx status code";

interface MaybeFunctionError {
  context?: {
    json?: () => Promise<{ error?: string; message?: string } | null>;
  };
  message?: string;
}

/**
 * Resolves a user-facing message from a supabase.functions.invoke error.
 * Reads the response body for the function's `{ error }` / `{ message }`, and
 * never returns the generic "Edge Function returned…" string.
 */
export async function getFunctionErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): Promise<string> {
  if (!error) return fallback;
  const err = error as MaybeFunctionError;

  if (err.context?.json) {
    try {
      const body = await err.context.json();
      const bodyMessage = body?.error || body?.message;
      if (bodyMessage) return String(bodyMessage);
    } catch {
      // body wasn't JSON — fall through to the message check
    }
  }

  if (err.message && !err.message.includes(GENERIC_FUNCTION_ERROR)) {
    return err.message;
  }

  return fallback;
}
