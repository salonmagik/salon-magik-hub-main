import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { DatePicker } from "@ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Plus, Trash2, FileText } from "lucide-react";
import { useInvoices } from "@/hooks/useInvoices";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@supabase-client";

type Service = Tables<"services">;
type Product = Tables<"products">;

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  onSuccess?: () => void;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  serviceId?: string;
  productId?: string;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  customerId,
  onSuccess,
}: CreateInvoiceDialogProps) {
  const { currentTenant } = useAuth();
  const { createInvoice } = useInvoices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [itemType, setItemType] = useState<"custom" | "service" | "product">("custom");

  const currency = currentTenant?.currency || "USD";

  // Fetch services for dropdown
  const { data: services = [] } = useQuery({
    queryKey: ["services", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return (data as Service[]) || [];
    },
    enabled: Boolean(currentTenant?.id && open),
  });

  // Fetch products for dropdown
  const { data: products = [] } = useQuery({
    queryKey: ["products", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return (data as Product[]) || [];
    },
    enabled: Boolean(currentTenant?.id && open),
  });

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleServiceSelect = (itemId: string, serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (service) {
      updateLineItem(itemId, "serviceId", serviceId);
      updateLineItem(itemId, "description", service.name);
      updateLineItem(itemId, "unitPrice", Number(service.price));
    }
  };

  const handleProductSelect = (itemId: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      updateLineItem(itemId, "productId", productId);
      updateLineItem(itemId, "description", product.name);
      updateLineItem(itemId, "unitPrice", Number(product.price));
    }
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validItems = lineItems.filter(
        (item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0
      );

      if (validItems.length === 0) {
        throw new Error("Please add at least one valid line item");
      }

      await createInvoice({
        customerId,
        items: validItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          serviceId: item.serviceId,
          productId: item.productId,
        })),
        notes: notes.trim() || undefined,
        dueDate: dueDate ? dueDate.toISOString() : undefined,
      });

      // Reset form
      setLineItems([{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 }]);
      setNotes("");
      setDueDate(undefined);
      setItemType("custom");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error creating invoice:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const total = calculateTotal();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>
            Create a new invoice for this customer with custom line items.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Item Type Selector */}
          <div className="space-y-2">
            <Label>Item Type</Label>
            <Select value={itemType} onValueChange={(value: "custom" | "service" | "product") => setItemType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Items</SelectItem>
                <SelectItem value="service">Services</SelectItem>
                <SelectItem value="product">Products</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={item.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Item {index + 1}</span>
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  {itemType === "service" ? (
                    <div className="space-y-2">
                      <Label>Service</Label>
                      <Select
                        value={item.serviceId || ""}
                        onValueChange={(value) => handleServiceSelect(item.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name} - {currency} {Number(service.price).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : itemType === "product" ? (
                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select
                        value={item.productId || ""}
                        onValueChange={(value) => handleProductSelect(item.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} - {currency} {Number(product.price).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Price ({currency})</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                        required
                        disabled={itemType !== "custom"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total ({currency})</Label>
                      <Input
                        type="text"
                        value={(item.quantity * item.unitPrice).toFixed(2)}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total:</span>
                <span>{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes for this invoice"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date (Optional)</Label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Select due date"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <FileText className="w-4 h-4 mr-2" />
              {isSubmitting ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
