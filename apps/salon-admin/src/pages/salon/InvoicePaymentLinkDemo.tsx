import { useState } from "react";
import { InvoicePaymentLink } from "@/components/billing/InvoicePaymentLink";
import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@ui/alert";

export default function InvoicePaymentLinkDemo() {
  const { invoices, isLoading } = useInvoices();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl p-3 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Payment Link Demo</CardTitle>
          <CardDescription>
            Select an invoice to generate or view its payment link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {invoices.length === 0 ? (
            <Alert>
              <AlertDescription>
                No invoices found. Create an invoice first to test the payment link component.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Invoice</label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} - {invoice.status} - ${invoice.total}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedInvoice && (
                <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Invoice Number:</span>
                      <p className="font-medium">{selectedInvoice.invoice_number}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <p className="font-medium capitalize">{selectedInvoice.status}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span>
                      <p className="font-medium">
                        ${selectedInvoice.total} {selectedInvoice.currency}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created:</span>
                      <p className="font-medium">
                        {new Date(selectedInvoice.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h3 className="text-sm font-medium mb-3">Payment Link Component:</h3>
                    <InvoicePaymentLink invoice={selectedInvoice} />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
