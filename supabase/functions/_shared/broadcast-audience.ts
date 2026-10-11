export const DERIVED_SEGMENT_FLAGS = {
  vip_customers: "is_vip",
  big_spenders: "is_big_spender",
  regulars: "is_regular",
  loves_packages: "loves_packages",
  lapsed_customers: "is_lapsed",
} as const;

export type DerivedAudiencePreset = keyof typeof DERIVED_SEGMENT_FLAGS;

export type AudienceValidation =
  | { ok: true }
  | {
    ok: false;
    code: "AUDIENCE_EMPTY" | "AUDIENCE_SEGMENT_MISMATCH";
    customerIds?: string[];
  };

/**
 * Validates a browser-provided recipient list against the server-side segment
 * membership query. A valid list may be a subset because the UI supports
 * choosing specific customers from a segment.
 */
export function validateDerivedAudience(
  requestedCustomerIds: readonly string[],
  segmentCustomerIds: ReadonlySet<string>,
): AudienceValidation {
  if (segmentCustomerIds.size === 0) {
    return { ok: false, code: "AUDIENCE_EMPTY" };
  }

  const outsideSegment = requestedCustomerIds.filter((customerId) =>
    !segmentCustomerIds.has(customerId)
  );
  if (outsideSegment.length > 0) {
    return {
      ok: false,
      code: "AUDIENCE_SEGMENT_MISMATCH",
      customerIds: outsideSegment,
    };
  }

  return { ok: true };
}
