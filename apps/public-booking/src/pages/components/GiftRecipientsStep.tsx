import { AlertTriangle, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Checkbox } from "@ui/checkbox";
import { Badge } from "@ui/badge";
import { PhoneInput } from "@ui/phone-input";
import { getCountryByCode, PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import {
  getCitiesForCountryRegion,
  getRegionsForCountry,
} from "@shared/address-geography";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import type { CartItem, GiftRecipient } from "@/hooks/useBookingCart";
import { useMarketCountries } from "@/hooks/useMarketCountries";

interface GiftRecipientsStepProps {
  giftItems: CartItem[];
  recipients: Record<string, GiftRecipient>;
  onRecipientsChange: (recipients: Record<string, GiftRecipient>) => void;
  sameRecipient: boolean;
  onSameRecipientChange: (value: boolean) => void;
  tenantId: string;
  bookerInfo: { firstName: string; email: string; phone: string };
}

interface IdentityMatch {
  type: "self" | "other";
  firstName: string;
}

interface RecipientFormProps {
  recipient: GiftRecipient;
  onUpdate: (field: string, value: string | boolean) => void;
  selectableCountries: { code: string; name: string }[];
  item?: CartItem;
  tenantId: string;
  bookerInfo: { firstName: string; email: string; phone: string };
}

// Non-blocking — catches the case where a mistyped email/phone happens to
// already belong to someone (the sender's own account, or another existing
// customer of this salon), so a gift doesn't silently go to the wrong
// person. Only the matched first name is shown, never the full identity.
async function checkIdentityMatch(
  tenantId: string,
  bookerInfo: { firstName: string; email: string; phone: string },
  email: string,
  phone: string,
): Promise<IdentityMatch | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();
  if (!normalizedEmail && !normalizedPhone) return null;

  const bookerEmail = bookerInfo.email.trim().toLowerCase();
  const bookerPhone = bookerInfo.phone.trim();
  if (
    (normalizedEmail && normalizedEmail === bookerEmail) ||
    (normalizedPhone && normalizedPhone === bookerPhone)
  ) {
    return { type: "self", firstName: bookerInfo.firstName || "you" };
  }

  // Not .maybeSingle() — this project's PostgREST returns a genuine 406 for
  // zero matching rows rather than a clean null, so a plain array response
  // (data?.[0]) is the only way to treat "no match" as a non-error case.
  const { data: matches } = await supabase
    .rpc("lookup_booking_customer_match" as never, {
      p_tenant_id: tenantId,
      p_email: normalizedEmail || null,
      p_phone: normalizedPhone || null,
    } as never) as { data: { customer_id: string; first_name: string | null }[] | null };
  const match = matches?.[0];

  if (match?.first_name) {
    return { type: "other", firstName: match.first_name };
  }
  return null;
}

const emptyRecipient: GiftRecipient = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  message: "",
  hideSender: false,
};

function RecipientForm({
  recipient,
  onUpdate,
  selectableCountries,
  item,
  tenantId,
  bookerInfo,
}: RecipientFormProps) {
  const [identityMatch, setIdentityMatch] = useState<IdentityMatch | null>(null);
  const [identityMatchDismissed, setIdentityMatchDismissed] = useState(false);

  // Debounced on email/phone change rather than onBlur — PhoneInput doesn't
  // expose a blur handler.
  useEffect(() => {
    setIdentityMatchDismissed(false);
    if (!recipient.email && !recipient.phone) {
      setIdentityMatch(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkIdentityMatch(tenantId, bookerInfo, recipient.email, recipient.phone || "");
      if (!cancelled) setIdentityMatch(result);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient.email, recipient.phone, tenantId]);

  const needsDeliveryAddress = item?.type === "product" && item.fulfillmentType === "delivery";
  const inferredCountryCode =
    item?.eligibleBranches?.find((branch) => branch.id === item.branchId)?.country_code ||
    (item?.eligibleBranches?.length === 1 ? item.eligibleBranches[0].country_code : null) ||
    null;
  const inferredCountryName = inferredCountryCode ? getCountryByCode(inferredCountryCode)?.name || inferredCountryCode : "";
  const regionOptions = getRegionsForCountry(inferredCountryCode);
  const cityOptions = getCitiesForCountryRegion(inferredCountryCode, recipient.address?.state);

  return (
    <div className="space-y-4">
      {item && (
        <Badge variant="secondary" className="mb-2">
          {item.name}
        </Badge>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">First Name *</Label>
          <Input
            value={recipient.firstName}
            onChange={(e) => onUpdate("firstName", e.target.value)}
            placeholder="Jane"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Last Name *</Label>
          <Input
            value={recipient.lastName}
            onChange={(e) => onUpdate("lastName", e.target.value)}
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Email *</Label>
        <Input
          type="email"
          value={recipient.email}
          onChange={(e) => onUpdate("email", e.target.value)}
          placeholder="jane@example.com"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Phone *</Label>
        <PhoneInput
          value={recipient.phone || ""}
          onChange={(value) => onUpdate("phone", value)}
          placeholder="Phone number"
          defaultCountry="NG"
          allowedCountryCodes={selectableCountries.map((country) => country.code)}
        />
      </div>

      {identityMatch && !identityMatchDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 space-y-2">
            <p className="text-sm text-amber-900">
              {identityMatch.type === "self"
                ? "This looks like your own email or phone number — did you mean to gift someone else?"
                : `This looks like ${identityMatch.firstName}'s account — is that who you mean to gift?`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIdentityMatchDismissed(true)}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Yes, that's right
              </button>
              <button
                type="button"
                onClick={() => {
                  // Just one onUpdate call — the parent's updateRecipient/
                  // applySharedRecipient close over `recipients` per call,
                  // so two synchronous calls in the same tick would have
                  // the second (stale) one clobber the first.
                  setIdentityMatchDismissed(true);
                  onUpdate("email", "");
                  setIdentityMatch(null);
                }}
                className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Let me fix this
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Gift Message</Label>
        <Textarea
          value={recipient.message || ""}
          onChange={(e) => onUpdate("message", e.target.value)}
          placeholder="A special message for the recipient..."
          rows={2}
        />
      </div>

      {needsDeliveryAddress && (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <Label className="font-medium text-sm">Delivery Address</Label>
            <p className="text-xs text-muted-foreground">
              This item is being delivered to the gift recipient.
            </p>
          </div>

          {inferredCountryName && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Delivery country: <span className="font-medium text-foreground">{inferredCountryName}</span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Address Line 1 *</Label>
            <Input
              value={recipient.address?.line1 || ""}
              onChange={(e) => onUpdate("address.line1", e.target.value)}
              placeholder="Street address"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Address Line 2</Label>
            <Input
              value={recipient.address?.line2 || ""}
              onChange={(e) => onUpdate("address.line2", e.target.value)}
              placeholder="Apartment, suite, landmark"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">City *</Label>
              <Select
                value={recipient.address?.city || ""}
                onValueChange={(value) => onUpdate("address.city", value)}
                disabled={!recipient.address?.state || cityOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!recipient.address?.state ? "Select state first" : "Select city"} />
                </SelectTrigger>
                <SelectContent>
                  {cityOptions.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">State / Region *</Label>
              <Select
                value={recipient.address?.state || ""}
                onValueChange={(value) => {
                  onUpdate("address.state", value);
                  onUpdate("address.city", "");
                  onUpdate("address.country", inferredCountryName);
                }}
                disabled={regionOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state / region" />
                </SelectTrigger>
                <SelectContent>
                  {regionOptions.map((region) => (
                    <SelectItem key={region.code} value={region.name}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="space-y-1">
              <Label className="text-xs">Postal Code</Label>
              <Input
                value={recipient.address?.postalCode || ""}
                onChange={(e) => onUpdate("address.postalCode", e.target.value)}
                placeholder="Postal code"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Checkbox
          id={`hide-sender-${item?.id || "shared"}`}
          checked={recipient.hideSender}
          onCheckedChange={(checked) => onUpdate("hideSender", !!checked)}
        />
        <div className="space-y-1">
          <Label className="cursor-pointer font-medium text-sm">
            Keep my identity anonymous
          </Label>
          <p className="text-xs text-muted-foreground">
            The recipient will not see your name or contact details.
          </p>
        </div>
      </div>
    </div>
  );
}

export function GiftRecipientsStep({
  giftItems,
  recipients,
  onRecipientsChange,
  sameRecipient,
  onSameRecipientChange,
  tenantId,
  bookerInfo,
}: GiftRecipientsStepProps) {
  const { data: marketCountries } = useMarketCountries();
  const selectableCountries = marketCountries ?? PRODUCT_LIVE_COUNTRIES;

  const updateRecipient = (itemId: string, field: string, value: string | boolean) => {
    const current = recipients[itemId] || emptyRecipient;

    if (field.startsWith("address.")) {
      const addressField = field.replace("address.", "");
      onRecipientsChange({
        ...recipients,
        [itemId]: {
          ...current,
          address: {
            line1: "",
            city: "",
            country: "",
            ...(current.address || {}),
            [addressField]: value,
          },
        },
      });
      return;
    }

    onRecipientsChange({
      ...recipients,
      [itemId]: {
        ...current,
        [field]: value,
      },
    });
  };

  const applySharedRecipient = (field: string, value: string | boolean) => {
    const updated: Record<string, GiftRecipient> = {};
    giftItems.forEach((item) => {
      const current = recipients[item.id] || emptyRecipient;
      if (field.startsWith("address.")) {
        const addressField = field.replace("address.", "");
        updated[item.id] = {
          ...current,
          address: {
            line1: "",
            city: "",
            country: "",
            ...(current.address || {}),
            [addressField]: value,
          },
        };
      } else {
        updated[item.id] = {
          ...current,
          [field]: value,
        };
      }
    });
    onRecipientsChange(updated);
  };

  const sharedRecipient = recipients[giftItems[0]?.id] || emptyRecipient;

  const renderMultipleRecipients = () => (
    <Accordion type="single" collapsible className="w-full">
      {giftItems.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger>{item.name}</AccordionTrigger>
          <AccordionContent>
            <RecipientForm
              recipient={recipients[item.id] || emptyRecipient}
              onUpdate={(field, value) => updateRecipient(item.id, field, value)}
              selectableCountries={selectableCountries}
              item={item}
              tenantId={tenantId}
              bookerInfo={bookerInfo}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  if (giftItems.length === 1) {
    const item = giftItems[0];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h3 className="font-serif text-lg font-semibold">Gift Recipient</h3>
        </div>
        <RecipientForm
          recipient={recipients[item.id] || emptyRecipient}
          onUpdate={(field, value) => updateRecipient(item.id, field, value)}
          selectableCountries={selectableCountries}
          item={item}
          tenantId={tenantId}
          bookerInfo={bookerInfo}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-primary" />
        <h3 className="font-serif text-lg font-semibold">Gift Recipients</h3>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Checkbox
          id="same-gift-recipient"
          checked={sameRecipient}
          onCheckedChange={(checked) => onSameRecipientChange(Boolean(checked))}
        />
        <div className="space-y-1">
          <Label htmlFor="same-gift-recipient" className="cursor-pointer font-medium">
            Gifts belong to same person
          </Label>
          <p className="text-xs text-muted-foreground">
            Keep this checked to use one recipient form for every gift item.
          </p>
        </div>
      </div>

      {sameRecipient ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {giftItems.map((item) => (
              <Badge key={item.id} variant="secondary">
                {item.name}
              </Badge>
            ))}
          </div>
          <RecipientForm
            recipient={sharedRecipient}
            onUpdate={applySharedRecipient}
            selectableCountries={selectableCountries}
            item={giftItems[0]}
            tenantId={tenantId}
            bookerInfo={bookerInfo}
          />
        </div>
      ) : (
        renderMultipleRecipients()
      )}
    </div>
  );
}
