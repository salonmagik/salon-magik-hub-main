import { useState } from "react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Alert, AlertDescription } from "@ui/alert";
import { Link, Copy, CheckCircle2, ExternalLink } from "lucide-react";
import type { Tables } from "@supabase-client";
import { useInvoices } from "@/hooks/useInvoices";

type Invoice = Tables<"invoices">;

interface InvoicePaymentLinkProps {
  invoice: Invoice;
}

export function InvoicePaymentLink({ invoice }: InvoicePaymentLinkProps) {
  const { generatePaymentLink } = useInvoices();
  const [isGenerating, setIsGenerating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(invoice.payment_link || null);
  const [copied, setCopied] = useState(false);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    const url = await generatePaymentLink(invoice.id);
    if (url) {
      setPaymentUrl(url);
    }
    setIsGenerating(false);
  };

  const handleCopyLink = () => {
    if (paymentUrl) {
      navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenLink = () => {
    if (paymentUrl) {
      window.open(paymentUrl, "_blank");
    }
  };

  // Don't show if invoice is already paid or void
  if (invoice.status === "paid" || invoice.status === "void") {
    return null;
  }

  // Show existing payment link
  if (paymentUrl) {
    return (
      <div className="space-y-3">
        <Alert>
          <Link className="h-4 w-4" />
          <AlertDescription>
            Payment link is ready to share with your customer
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Input
            value={paymentUrl}
            readOnly
            className="font-mono text-sm"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopyLink}
            title="Copy link"
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleOpenLink}
            title="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Show generate button
  return (
    <Button
      onClick={handleGenerateLink}
      disabled={isGenerating}
      variant="outline"
      className="w-full"
    >
      <Link className="h-4 w-4 mr-2" />
      {isGenerating ? "Generating..." : "Generate Payment Link"}
    </Button>
  );
}
