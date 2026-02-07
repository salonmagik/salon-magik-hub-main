import { useState } from "react";
import { Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneInput } from "@/components/ui/phone-input";
import type { CartItem, GiftRecipient } from "@/hooks/booking/useBookingCart";

interface GiftRecipientsStepProps {
  giftItems: CartItem[];
  recipients: Record<string, GiftRecipient>;
  onRecipientsChange: (recipients: Record<string, GiftRecipient>) => void;
}

export function GiftRecipientsStep({
  giftItems,
  recipients,
  onRecipientsChange,
}: GiftRecipientsStepProps) {
  const [sameRecipient, setSameRecipient] = useState<boolean | null>(
    giftItems.length > 1 ? null : true
  );

  const updateRecipient = (itemId: string, field: keyof GiftRecipient, value: string | boolean) => {
    onRecipientsChange({
      ...recipients,
      [itemId]: {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        message: "",
        hideSender: false,
        ...recipients[itemId],
        [field]: value,
      },
    });
  };

  // Apply shared recipient to all items
  const applySharedRecipient = (field: keyof GiftRecipient, value: string | boolean) => {
    const updated: Record<string, GiftRecipient> = {};
    giftItems.forEach((item) => {
      updated[item.id] = {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        message: "",
        hideSender: false,
        ...recipients[item.id],
        [field]: value,
      };
    });
    onRecipientsChange(updated);
  };

  // Get shared recipient for display
  const sharedRecipient = recipients[giftItems[0]?.id] || {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
    hideSender: false,
  };

  const RecipientForm = ({
    recipient,
    onUpdate,
    showItemBadge,
    itemName,
  }: {
    recipient: GiftRecipient;
    onUpdate: (field: keyof GiftRecipient, value: string | boolean) => void;
    showItemBadge?: boolean;
    itemName?: string;
  }) => (
    <div className="space-y-4">
      {showItemBadge && itemName && (
        <Badge variant="secondary" className="mb-2">
          {itemName}
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
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Gift Message</Label>
        <Textarea
          value={recipient.message || ""}
          onChange={(e) => onUpdate("message", e.target.value)}
          placeholder="A special message for the recipient..."
          rows={2}
        />
      </div>

      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30">
        <Checkbox
          id={`hide-sender-${Math.random()}`}
          checked={recipient.hideSender}
          onCheckedChange={(checked) => onUpdate("hideSender", !!checked)}
        />
        <div className="space-y-1">
          <Label className="cursor-pointer font-medium text-sm">
            Keep my identity anonymous
          </Label>
          <p className="text-xs text-muted-foreground">
            The recipient won't see your name or contact details. The salon will still have your information for booking purposes.
          </p>
        </div>
      </div>
    </div>
  );

  // Single gift item - show form directly
  if (giftItems.length === 1) {
    const item = giftItems[0];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Gift Recipient</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter the details of the person receiving <strong>{item.name}</strong>
        </p>
        <RecipientForm
          recipient={recipients[item.id] || sharedRecipient}
          onUpdate={(field, value) => updateRecipient(item.id, field, value)}
        />
      </div>
    );
  }

  // Multiple gift items - ask if same recipient
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Gift Recipients</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        You have {giftItems.length} items marked as gifts
      </p>

      {/* Same recipient question */}
      {sameRecipient === null && (
        <div className="p-4 border rounded-lg space-y-4">
          <Label className="font-medium">Are all gifts for the same person?</Label>
          <RadioGroup
            onValueChange={(value) => setSameRecipient(value === "yes")}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="same-yes" />
              <Label htmlFor="same-yes" className="cursor-pointer">
                Yes, same recipient
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="same-no" />
              <Label htmlFor="same-no" className="cursor-pointer">
                No, different recipients
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Same recipient - single form */}
      {sameRecipient === true && (
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
          />
        </div>
      )}

      {/* Different recipients - tabbed forms */}
      {sameRecipient === false && (
        <Tabs defaultValue={giftItems[0]?.id} className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1">
            {giftItems.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="flex-1">
                {item.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {giftItems.map((item) => (
            <TabsContent key={item.id} value={item.id} className="mt-4">
              <RecipientForm
                recipient={
                  recipients[item.id] || {
                    firstName: "",
                    lastName: "",
                    email: "",
                    phone: "",
                    message: "",
                    hideSender: false,
                  }
                }
                onUpdate={(field, value) => updateRecipient(item.id, field, value)}
                showItemBadge
                itemName={item.name}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
