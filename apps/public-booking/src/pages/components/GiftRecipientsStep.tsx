import { AlertTriangle, Check, Gift, Loader2, Mail, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { validateE164Phone } from "@shared/validation";
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
import { Button } from "@ui/button";
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
import { useCheckedEmail } from "@/hooks/useCheckedEmail";

export type RecipientIdentityStatus = "pending" | "exists" | "new";

interface GiftRecipientsStepProps {
  giftItems: CartItem[];
  recipients: Record<string, GiftRecipient>;
  onRecipientsChange: (recipients: Record<string, GiftRecipient>) => void;
  sameRecipient: boolean;
  onSameRecipientChange: (value: boolean) => void;
  bookerInfo: { firstName: string; email: string; phone: string };
  /** Fires per cart item whenever its recipient's email-identity check state changes, so the wizard can block "Continue" while any recipient is still "pending" (unchecked or re-checking). */
  onRecipientStatusChange?: (itemId: string, status: RecipientIdentityStatus) => void;
}

interface RecipientFormProps {
  itemId: string;
  recipient: GiftRecipient;
  onUpdate: (field: string, value: string | boolean) => void;
  selectableCountries: { code: string; name: string }[];
  item?: CartItem;
  bookerInfo: { firstName: string; email: string; phone: string };
  onStatusChange?: (itemId: string, status: RecipientIdentityStatus) => void;
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
  itemId,
  recipient,
  onUpdate,
  selectableCountries,
  item,
  bookerInfo,
  onStatusChange,
}: RecipientFormProps) {
  // Cheap, client-side, and checked before the backend identity lookup —
  // gifting yourself is always a mistake regardless of what
  // customer_identity_exists would say.
  const [selfMatch, setSelfMatch] = useState(false);
  // "unknown" = still on the email-first ask; "exists" = a Salon Magik
  // account already owns this email (name/phone are never asked for or
  // shown — the recipient's own account covers that, and asking would just
  // be a phishing-shaped request for someone else's details); "new" = no
  // account, so collect the rest of the form normally.
  const [resolution, setResolution] = useState<"unknown" | "exists" | "new">("unknown");
  // Snapshot of the email when it was last (re)confirmed — the "Continue"/
  // recheck button only shows once they've actually changed it since then,
  // not the instant they reopen it.
  const emailAtLastCheckRef = useRef("");

  const emailCheck = useCheckedEmail((exists) => {
    setResolution(exists ? "exists" : "new");
    emailAtLastCheckRef.current = recipient.email;
    if (exists) {
      onUpdate("firstName", "");
      onUpdate("lastName", "");
      onUpdate("phone", "");
    }
  });

  const identityStatus: RecipientIdentityStatus =
    resolution === "unknown" || emailCheck.phase === "editable" || emailCheck.phase === "checking"
      ? "pending"
      : resolution;

  useEffect(() => {
    onStatusChange?.(itemId, identityStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, identityStatus]);

  const handleEmailCheck = () => {
    const email = recipient.email.trim().toLowerCase();
    const bookerEmail = bookerInfo.email.trim().toLowerCase();
    if (email && bookerEmail && email === bookerEmail) {
      setSelfMatch(true);
      return;
    }
    setSelfMatch(false);
    void emailCheck.check(recipient.email);
  };

  const emailHasChangedSinceCheck = recipient.email.trim() !== emailAtLastCheckRef.current.trim();
  const phoneValidation = validateE164Phone(recipient.phone || "");
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

      <div className="space-y-1">
        <Label className="text-xs">Email *</Label>
        <div className="relative">
          <Input
            type="email"
            value={recipient.email}
            onChange={(e) => {
              onUpdate("email", e.target.value);
              setSelfMatch(false);
            }}
            placeholder="jane@example.com"
            disabled={emailCheck.isLocked}
            className="pr-10"
          />
          {emailCheck.phase === "checking" && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {emailCheck.phase === "confirmed" && (
            <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
          )}
          {emailCheck.phase === "locked" && (
            <button
              type="button"
              onClick={emailCheck.startEdit}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Edit email"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {selfMatch && (
          <p className="text-xs text-amber-700">
            This looks like your own email — did you mean to gift someone else?
          </p>
        )}
      </div>

      {emailCheck.phase === "editable" && emailHasChangedSinceCheck && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleEmailCheck}
          disabled={!recipient.email.trim()}
        >
          <Mail className="w-3.5 h-3.5 mr-1.5" />
          Continue
        </Button>
      )}

      {resolution !== "unknown" && (
        <>
          {resolution === "exists" ? (
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                This belongs to an existing Salon Magik account — we'll deliver the gift to them directly, no need to re-enter their details.
              </p>
            </div>
          ) : (
            <>
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
                <Label className="text-xs">Phone *</Label>
                <PhoneInput
                  value={recipient.phone || ""}
                  onChange={(value) => onUpdate("phone", value)}
                  placeholder="Phone number"
                  defaultCountry="NG"
                  allowedCountryCodes={selectableCountries.map((country) => country.code)}
                  hasError={!phoneValidation.isValid}
                />
                {!phoneValidation.isValid && (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {phoneValidation.error}
                  </p>
                )}
              </div>
            </>
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
        </>
      )}

      {resolution !== "unknown" && needsDeliveryAddress && (
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
  bookerInfo,
  onRecipientStatusChange,
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
              itemId={item.id}
              recipient={recipients[item.id] || emptyRecipient}
              onUpdate={(field, value) => updateRecipient(item.id, field, value)}
              selectableCountries={selectableCountries}
              item={item}
              bookerInfo={bookerInfo}
              onStatusChange={onRecipientStatusChange}
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
          itemId={item.id}
          recipient={recipients[item.id] || emptyRecipient}
          onUpdate={(field, value) => updateRecipient(item.id, field, value)}
          selectableCountries={selectableCountries}
          item={item}
          bookerInfo={bookerInfo}
          onStatusChange={onRecipientStatusChange}
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
            itemId={giftItems[0]?.id || "shared"}
            recipient={sharedRecipient}
            onUpdate={applySharedRecipient}
            selectableCountries={selectableCountries}
            item={giftItems[0]}
            bookerInfo={bookerInfo}
            onStatusChange={(_, status) => {
              giftItems.forEach((item) => onRecipientStatusChange?.(item.id, status));
            }}
          />
        </div>
      ) : (
        renderMultipleRecipients()
      )}
    </div>
  );
}
