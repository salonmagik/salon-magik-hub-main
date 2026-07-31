import { useEffect, useMemo, useState } from "react";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { HelpCircle, Mail, MessageCircle, LifeBuoy, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";

const TICKET_STATUS_TOOLTIPS: Record<string, string> = {
  open: "We've received your request and it's waiting to be picked up.",
  in_progress: "Someone on our team is actively working on this.",
  resolved: "We consider this resolved — reply if it isn't.",
  closed: "This ticket is closed and no longer being tracked.",
};
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

const faqs = [
  {
    question: "How do I change or cancel a booking?",
    answer:
      "Open the booking from your Bookings page. If the salon still allows changes, you can cancel or notify the salon that you are running late directly from the booking details screen.",
  },
  {
    question: "Why do I see store credits or refunds here?",
    answer:
      "Salon Magik keeps your paid balance, store credit, voucher activity, packages, and salon-issued refunds visible for every salon linked to your account.",
  },
  {
    question: "Why am I being asked to set a password after OTP verification?",
    answer:
      "OTP verifies your identity the first time. Setting a password secures your customer account so you can manage bookings, credits, and support requests more safely going forward.",
  },
  {
    question: "How do I contact a salon about a booking issue?",
    answer:
      "Use the support form below, choose the relevant salon, and select a booking-related issue type. Salon Magik will notify the salon inside their admin app and by email.",
  },
  {
    question: "Why did I stop receiving booking updates?",
    answer:
      "Check your communication preferences in Profile & Security. If SMS or email updates are disabled, salons may not be able to send booking reminders through Salon Magik.",
  },
];

type SupportTicket = {
  id: string;
  issue_type: string;
  subject: string;
  status: string;
  created_at: string;
  tenant_id: string | null;
};

export default function ClientHelpPage() {
  const { customers } = useClientAuth();
  const [issueType, setIssueType] = useState("booking_change");
  const [salonInQuestion, setSalonInQuestion] = useState("platform");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const salonOptions = useMemo(
    () =>
      customers.map((customer) => ({
        tenantId: customer.tenant_id,
        name: customer.tenant.name,
      })),
    [customers],
  );

  useEffect(() => {
    const fetchTickets = async () => {
      const { data, error } = await (supabase
        .from("support_tickets" as any)
        .select("id, issue_type, subject, status, created_at, tenant_id")
        .order("created_at", { ascending: false })
        .limit(10) as any);
      if (error) {
        console.error("Failed to load support tickets", error);
        return;
      }
      setTickets((data ?? []) as SupportTicket[]);
    };

    fetchTickets();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-support-ticket", {
        body: {
          issueType,
          salonInQuestion,
          subject: subject.trim(),
          body: body.trim(),
          sourceApp: "client_portal",
        },
      });

      if (error || data?.error) {
        toast({ title: "Failed to submit support request", description: data?.error || error?.message, variant: "destructive" });
        return;
      }

      setSubject("");
      setBody("");
      toast({ title: "Support ticket created", description: "We have sent your request to the right team." });
      setTickets((prev) => [
        {
          id: data.ticketId,
          issue_type: issueType,
          subject: subject.trim(),
          status: "open",
          created_at: new Date().toISOString(),
          tenant_id: salonInQuestion === "platform" ? null : salonInQuestion,
        },
        ...prev,
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Help & Support</h1>
          <p className="mt-1 text-muted-foreground">Find answers quickly or send a support request to Salon Magik and the relevant salon.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <Card className="border-primary/15 bg-gradient-to-br from-background to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Frequently Asked Questions
              </CardTitle>
              <CardDescription>Quick answers to the most common client-account and booking questions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={faq.question} value={`faq-${index}`}>
                    <AccordionTrigger className="text-sm font-medium">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-primary" />
                Contact Support
              </CardTitle>
              <CardDescription>We send platform issues to Salon Magik support and salon-related issues to the selected salon as well.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Issue Type</Label>
                  <Select value={issueType} onValueChange={setIssueType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booking_change">Booking change</SelectItem>
                      <SelectItem value="refund_credit">Refund or store credit</SelectItem>
                      <SelectItem value="account_access">Account access</SelectItem>
                      <SelectItem value="notification_issue">Notification issue</SelectItem>
                      <SelectItem value="general_support">General support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Salon in Question</Label>
                  <Select value={salonInQuestion} onValueChange={setSalonInQuestion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform">Salon Magik / Not salon specific</SelectItem>
                      {salonOptions.map((salon) => (
                        <SelectItem key={salon.tenantId} value={salon.tenantId}>
                          {salon.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-subject">Subject</Label>
                  <Input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-body">Message</Label>
                  <Textarea
                    id="support-body"
                    rows={6}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Describe the issue, booking, or account problem in as much detail as possible."
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Submitting..." : "Submit support ticket"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Recent Support Requests
            </CardTitle>
            <CardDescription>Your most recent support tickets across Salon Magik and visited salons.</CardDescription>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have not opened any support tickets yet.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => {
                  const salonName =
                    ticket.tenant_id === null
                      ? "Salon Magik"
                      : salonOptions.find((salon) => salon.tenantId === ticket.tenant_id)?.name || "Salon";
                  return (
                    <div key={ticket.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{ticket.subject}</p>
                          <p className="text-sm text-muted-foreground">
                            {salonName} · {new Date(ticket.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="cursor-default">{ticket.status.replace(/_/g, " ")}</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            {TICKET_STATUS_TOOLTIPS[ticket.status] || "Current status of this support request."}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientSidebar>
  );
}
