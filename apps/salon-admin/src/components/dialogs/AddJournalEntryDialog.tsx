import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Badge } from "@ui/badge";
import { Card, CardContent } from "@ui/card";
import { Separator } from "@ui/separator";
import { DatePicker } from "@ui/date-picker";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Sparkles, 
  Plus, 
  Trash2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomers } from "@/hooks/useCustomers";
import { useProducts } from "@/hooks/useProducts";
import { 
  useJournal, 
  JournalDirection, 
  JournalCategory, 
  PaymentMethod,
  JournalLineItem,
} from "@/hooks/useJournal";
import { cn } from "@shared/utils";

interface AddJournalEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  prefillData?: {
    direction?: JournalDirection;
    category?: JournalCategory;
    amount?: number;
    customer_id?: string;
    appointment_id?: string;
    description?: string;
  };
}

interface ParsedEntry {
  direction: JournalDirection;
  amount: number;
  category: JournalCategory;
  paymentMethod: PaymentMethod;
  description: string;
  confidence: "high" | "medium" | "low";
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  pos: "POS/Terminal",
  transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  card: "Card",
  purse: "Store Credit",
};

const CATEGORY_LABELS: Record<JournalCategory, string> = {
  service_payment: "Service Payment",
  product_sale: "Product Sale",
  expense: "Expense",
  other: "Other",
};

export function AddJournalEntryDialog({
  open,
  onOpenChange,
  onSuccess,
  prefillData,
}: AddJournalEntryDialogProps) {
  const { currentTenant } = useAuth();
  const { customers } = useCustomers();
  const { products } = useProducts();
  const { createEntry } = useJournal();

  const [freeTextInput, setFreeTextInput] = useState("");
  const [parsedEntry, setParsedEntry] = useState<ParsedEntry | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // Form state
  const [direction, setDirection] = useState<JournalDirection>("inflow");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<JournalCategory>("other");
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [customerId, setCustomerId] = useState<string>("");
  const [lineItems, setLineItems] = useState<Partial<JournalLineItem>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFreeTextInput("");
      setParsedEntry(null);
      setShowManualForm(!!prefillData);
      setDirection(prefillData?.direction || "inflow");
      setPaymentMethod("cash");
      setAmount(prefillData?.amount?.toString() || "");
      setDescription(prefillData?.description || "");
      setCategory(prefillData?.category || "other");
      setOccurredAt(new Date());
      setCustomerId(prefillData?.customer_id || "");
      setLineItems([]);
    }
  }, [open, prefillData]);

  // Simple text parsing logic
  const parseText = (text: string) => {
    const lower = text.toLowerCase();
    const parsed: ParsedEntry = {
      direction: "inflow",
      amount: 0,
      category: "other",
      paymentMethod: "cash",
      description: text,
      confidence: "low",
    };

    // Detect direction
    if (lower.includes("spent") || lower.includes("paid for") || lower.includes("bought") || lower.includes("expense")) {
      parsed.direction = "outflow";
    } else if (lower.includes("received") || lower.includes("sold") || lower.includes("payment")) {
      parsed.direction = "inflow";
    }

    // Detect amount
    const amountMatch = text.match(/[$€£₦]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (amountMatch) {
      parsed.amount = parseFloat(amountMatch[1].replace(/,/g, ""));
      parsed.confidence = "medium";
    }

    // Detect payment method
    if (lower.includes("cash")) {
      parsed.paymentMethod = "cash";
    } else if (lower.includes("pos") || lower.includes("terminal") || lower.includes("card")) {
      parsed.paymentMethod = "pos";
    } else if (lower.includes("transfer") || lower.includes("bank")) {
      parsed.paymentMethod = "transfer";
    } else if (lower.includes("momo") || lower.includes("mobile money")) {
      parsed.paymentMethod = "mobile_money";
    }

    // Detect category
    if (lower.includes("service") || lower.includes("haircut") || lower.includes("treatment")) {
      parsed.category = "service_payment";
    } else if (lower.includes("product") || lower.includes("shampoo") || lower.includes("sold")) {
      parsed.category = "product_sale";
    } else if (lower.includes("expense") || lower.includes("supplies") || lower.includes("bought")) {
      parsed.category = "expense";
      parsed.direction = "outflow";
    }

    if (parsed.amount > 0 && parsed.paymentMethod) {
      parsed.confidence = "high";
    }

    return parsed;
  };

  const handleParse = () => {
    if (!freeTextInput.trim()) return;
    const parsed = parseText(freeTextInput);
    setParsedEntry(parsed);
  };

  const applyParsedEntry = () => {
    if (!parsedEntry) return;
    setDirection(parsedEntry.direction);
    setAmount(parsedEntry.amount.toString());
    setCategory(parsedEntry.category);
    setPaymentMethod(parsedEntry.paymentMethod);
    setDescription(parsedEntry.description);
    setShowManualForm(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { product_name: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate total
    if (field === "quantity" || field === "unit_price") {
      const qty = field === "quantity" ? value : updated[index].quantity || 1;
      const price = field === "unit_price" ? value : updated[index].unit_price || 0;
      updated[index].total_price = qty * price;
    }
    
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setIsSubmitting(true);
    try {
      const result = await createEntry({
        direction,
        payment_method: paymentMethod,
        amount: parseFloat(amount),
        currency: currentTenant?.currency || "USD",
        description,
        parsed_summary: parsedEntry?.description,
        category,
        occurred_at: occurredAt.toISOString(),
        customer_id: customerId || undefined,
        appointment_id: prefillData?.appointment_id,
        line_items: category === "product_sale" ? lineItems.map((item) => ({
          product_id: item.product_id || null,
          product_name: item.product_name || "",
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          total_price: item.total_price || 0,
        })) : undefined,
      });
      if (result) {
        onSuccess?.();
      }
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currency = currentTenant?.currency || "USD";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Journal Entry</DialogTitle>
          <DialogDescription>
            Record a cash, POS, or transfer transaction
          </DialogDescription>
        </DialogHeader>

        {/* Free-text input with parse */}
        {!showManualForm && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Describe the transaction</Label>
              <Textarea
                placeholder="e.g., 'Received 5000 cash for haircut service' or 'Spent 2000 on cleaning supplies via transfer'"
                value={freeTextInput}
                onChange={(e) => setFreeTextInput(e.target.value)}
                rows={3}
              />
              <Button onClick={handleParse} disabled={!freeTextInput.trim()} className="w-full">
                <Sparkles className="w-4 h-4 mr-2" />
                Parse Entry
              </Button>
            </div>

            {parsedEntry && (
              <Card className={cn(
                "border-2",
                parsedEntry.confidence === "high" && "border-success",
                parsedEntry.confidence === "medium" && "border-warning",
                parsedEntry.confidence === "low" && "border-destructive"
              )}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Parsed Result</span>
                    <Badge variant={parsedEntry.confidence === "high" ? "default" : "secondary"}>
                      {parsedEntry.confidence} confidence
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      {parsedEntry.direction === "inflow" ? (
                        <ArrowDownLeft className="w-4 h-4 text-success" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-destructive" />
                      )}
                      <span className="capitalize">{parsedEntry.direction}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>{" "}
                      {currency} {parsedEntry.amount.toLocaleString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Method:</span>{" "}
                      {PAYMENT_METHOD_LABELS[parsedEntry.paymentMethod]}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>{" "}
                      {CATEGORY_LABELS[parsedEntry.category]}
                    </div>
                  </div>
                  {parsedEntry.confidence === "low" && (
                    <div className="flex items-center gap-2 text-sm text-warning">
                      <AlertCircle className="w-4 h-4" />
                      Low confidence - please verify and adjust manually
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={applyParsedEntry} className="flex-1">
                      Use This & Edit
                    </Button>
                    <Button variant="outline" onClick={() => setShowManualForm(true)}>
                      Enter Manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button variant="link" onClick={() => setShowManualForm(true)} className="w-full">
              Skip parsing, enter manually
            </Button>
          </div>
        )}

        {/* Manual form */}
        {showManualForm && (
          <div className="space-y-4">
            {/* Direction toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === "inflow" ? "default" : "outline"}
                onClick={() => setDirection("inflow")}
                className="flex-1"
              >
                <ArrowDownLeft className="w-4 h-4 mr-2" />
                Inflow (Money In)
              </Button>
              <Button
                type="button"
                variant={direction === "outflow" ? "default" : "outline"}
                onClick={() => setDirection("outflow")}
                className="flex-1"
              >
                <ArrowUpRight className="w-4 h-4 mr-2" />
                Outflow (Money Out)
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currency}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-12"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as JournalCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={occurredAt}
                  onChange={(date) => date && setOccurredAt(date)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this transaction for?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Link to Customer (optional)</Label>
              <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Line items for product sales */}
            {category === "product_sale" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Products Sold</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Product
                    </Button>
                  </div>
                  {lineItems.map((item, index) => (
                    <div key={index} className="flex items-end gap-2 p-3 bg-muted rounded-lg">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={item.product_id || ""}
                          onValueChange={(v) => {
                            const product = products.find((p) => p.id === v);
                            updateLineItem(index, "product_id", v);
                            updateLineItem(index, "product_name", product?.name || "");
                            updateLineItem(index, "unit_price", product?.price || 0);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} - {currency} {product.price}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20 space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs">Total</Label>
                        <Input
                          value={`${currency} ${(item.total_price || 0).toFixed(2)}`}
                          disabled
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {showManualForm && (
            <Button onClick={handleSubmit} disabled={isSubmitting || !amount || parseFloat(amount) <= 0}>
              {isSubmitting ? "Saving..." : "Save Entry"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
