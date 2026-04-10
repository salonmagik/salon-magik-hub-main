import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { DatePicker, dateToString, stringToDate } from "@ui/date-picker";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { ScrollArea } from "@ui/scroll-area";
import { Plus, Trash2, FileText, Send, CheckCircle, XCircle, AlertCircle, Loader2, Copy, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@ui/alert";
import { useInvoices, type InvoiceWithItems, type UpdateInvoiceData } from "@/hooks/useInvoices";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@shared/currency";
import { toast } from "@ui/ui/use-toast";

interface InvoiceManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  onSuccess?: () => void;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export function InvoiceManagementDialog({
  open,
  onOpenChange,
  invoiceId,
  onSuccess,
}: InvoiceManagementDialogProps) {
  const { currentTenant } = useAuth();
  const {
    fetchInvoice,
    updateInvoice,
    sendInvoice,
    markAsPaid,
    voidInvoice,
  } = useInvoices();

  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Form state
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const currency = currentTenant?.currency || "USD";

  // Fetch invoice when dialog opens
  useEffect(() => {
    if (open && invoiceId) {
      loadInvoice();
    } else {
      resetForm();
    }
  }, [open, invoiceId]);

  const loadInvoice = async () => {
    if (!invoiceId) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await fetchInvoice(invoiceId);
      if (data) {
        setInvoice(data);
        setNotes(data.notes || "");
        setDueDate(data.due_date ? new Date(data.due_date) : undefined);
        setLineItems(
          (data.invoice_line_items || []).map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: Number(item.unit_price),
          }))
        );
      }
    } catch (err) {
      console.error("Error loading invoice:", err);
      setErrorMessage("Failed to load invoice");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setInvoice(null);
    setNotes("");
    setDueDate(undefined);
    setLineItems([]);
    setIsEditing(false);
    setErrorMessage("");
  };

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

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  };

  const handleUpdate = async () => {
    if (!invoiceId) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const validItems = lineItems.filter(
        (item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0
      );

      if (validItems.length === 0) {
        setErrorMessage("Please add at least one valid line item");
        setIsSubmitting(false);
        return;
      }

      const updateData: UpdateInvoiceData = {
        items: validItems,
        notes: notes.trim() || undefined,
        dueDate: dueDate ? dueDate.toISOString() : undefined,
      };

      const success = await updateInvoice(invoiceId, updateData);
      if (success) {
        setIsEditing(false);
        await loadInvoice(); // Reload to get updated data
        onSuccess?.();
      }
    } catch (err) {
      console.error("Error updating invoice:", err);
      setErrorMessage("Failed to update invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = async () => {
    if (!invoiceId) return;

    setIsSubmitting(true);
    try {
      const success = await sendInvoice(invoiceId);
      if (success) {
        await loadInvoice();
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!invoiceId) return;

    setIsSubmitting(true);
    try {
      const success = await markAsPaid(invoiceId);
      if (success) {
        await loadInvoice();
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!invoiceId) return;

    setIsSubmitting(true);
    try {
      const success = await voidInvoice(invoiceId);
      if (success) {
        await loadInvoice();
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPaymentLink = () => {
    if (invoice?.pdf_url) {
      navigator.clipboard.writeText(invoice.pdf_url);
      toast({ title: "Copied", description: "Payment link copied to clipboard" });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: string; className: string }> = {
      draft: { variant: "secondary", className: "bg-muted" },
      sent: { variant: "default", className: "bg-blue-500/10 text-blue-700" },
      paid: { variant: "default", className: "bg-success/10 text-success" },
      void: { variant: "destructive", className: "bg-destructive/10 text-destructive" },
    };

    const config = variants[status] || variants.draft;
    return (
      <Badge className={config.className}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const total = isEditing ? calculateTotal() : Number(invoice?.total || 0);
  const canEdit = invoice?.status === "draft";
  const canSend = invoice?.status === "draft" || invoice?.status === "sent";
  const canMarkPaid = invoice?.status === "sent";
  const canVoid = invoice?.status !== "void" && invoice?.status !== "paid";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                {invoice?.invoice_number || "Invoice"}
              </DialogTitle>
              <DialogDescription>
                {isEditing ? "Edit invoice details" : "View and manage invoice"}
              </DialogDescription>
            </div>
            {invoice && getStatusBadge(invoice.status)}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* Invoice Details */}
                {invoice && !isEditing && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">Invoice Number</Label>
                        <p className="font-medium">{invoice.invoice_number}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(invoice.status)}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p>{new Date(invoice.created_at).toLocaleDateString()}</p>
                      </div>
                      {invoice.due_date && (
                        <div>
                          <Label className="text-muted-foreground">Due Date</Label>
                          <p>{new Date(invoice.due_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {invoice.sent_at && (
                        <div>
                          <Label className="text-muted-foreground">Sent At</Label>
                          <p>{new Date(invoice.sent_at).toLocaleDateString()}</p>
                        </div>
                      )}
                      {invoice.paid_at && (
                        <div>
                          <Label className="text-muted-foreground">Paid At</Label>
                          <p>{new Date(invoice.paid_at).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>

                    {invoice.pdf_url && (
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <ExternalLink className="w-4 h-4" />
                        <span className="text-sm flex-1 truncate">{invoice.pdf_url}</span>
                        <Button size="sm" variant="ghost" onClick={copyPaymentLink}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {/* Line Items */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    {isEditing && (
                      <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Item
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Item {index + 1}</span>
                          {isEditing && lineItems.length > 1 && (
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

                        {isEditing ? (
                          <>
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Input
                                placeholder="Item description"
                                value={item.description}
                                onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-2">
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
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
                          </>
                        ) : (
                          <div className="grid grid-cols-4 gap-2 text-sm">
                            <div className="col-span-2">
                              <Label className="text-muted-foreground">Description</Label>
                              <p>{item.description}</p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">Qty × Price</Label>
                              <p>{item.quantity} × {formatCurrency(item.unitPrice, currency)}</p>
                            </div>
                            <div className="text-right">
                              <Label className="text-muted-foreground">Total</Label>
                              <p className="font-medium">
                                {formatCurrency(item.quantity * item.unitPrice, currency)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Total:</span>
                      <span>{formatCurrency(total, currency)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  {isEditing ? (
                    <Textarea
                      placeholder="Add any additional notes for this invoice"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {invoice?.notes || "No notes"}
                    </p>
                  )}
                </div>

                {/* Due Date */}
                {isEditing && (
                  <div className="space-y-2">
                    <Label>Due Date (Optional)</Label>
                    <DatePicker
                      value={dueDate}
                      onChange={setDueDate}
                      placeholder="Select due date"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!isEditing ? (
            <>
              <div className="flex-1 flex gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    disabled={isSubmitting}
                  >
                    Edit
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {canVoid && (
                  <Button
                    variant="destructive"
                    onClick={handleVoid}
                    disabled={isSubmitting}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Void
                  </Button>
                )}
                {canMarkPaid && (
                  <Button
                    variant="outline"
                    onClick={handleMarkAsPaid}
                    disabled={isSubmitting}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark Paid
                  </Button>
                )}
                {canSend && (
                  <Button onClick={handleSend} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Send Invoice
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  loadInvoice(); // Reload to reset changes
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
