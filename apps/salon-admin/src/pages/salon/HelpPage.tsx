import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useWalkthroughDataFlags } from "@/hooks/useWalkthroughDataFlags";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
import { useIsDesktopViewport } from "@/components/onboarding/ProductTourProvider";
import { getAvailableWalkthroughsBySection } from "@/lib/walkthroughs";
import { CHECKLIST_META } from "@/pages/salon/SalonDashboard";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import {
  HelpCircle,
  Search,
  Mail,
  ChevronRight,
  Check,
  Play,
  Video,
  LifeBuoy,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const videoTutorials = [
  {
    title: "Getting Started",
    description: "Learn the basics of Salon Magik",
    duration: "5 min",
  },
  {
    title: "Adding Services",
    description: "Create and manage your service catalog",
    duration: "3 min",
  },
  {
    title: "Staff Management",
    description: "Invite staff and manage permissions",
    duration: "4 min",
  },
  {
    title: "Payment Setup",
    description: "Configure deposits and payment methods",
    duration: "6 min",
  },
];

const faqs = [
  {
    question: "How do I add a new service?",
    answer:
      "Go to Services and Products, click on the Services tab, then click 'Add Service'. Fill in the service name, price, duration, and any other details. You can also assign services to categories for better organization.",
  },
  {
    question: "How do I manage customer appointments?",
    answer:
      "Navigate to the Appointments page to see all scheduled appointments. You can start, pause, complete, or cancel appointments from there. Use the Calendar view for a visual overview of your schedule.",
  },
  {
    question: "How do communication credits work?",
    answer:
      "Credits are used to send notifications (emails and SMS) to your customers. You get 30 free credits each month. Emails use 1 credit, SMS uses 2 credits. You can purchase additional credits if needed.",
  },
  {
    question: "Can I offer packages and bundles?",
    answer:
      "Yes! Go to Services and Products, click on the Packages tab, and create a new package. You can bundle multiple services together at a discounted price. The savings will be automatically displayed to customers.",
  },
  {
    question: "How do I process refunds?",
    answer:
      "Refund requests can be initiated from the Payments page. Select the transaction you want to refund, provide a reason, and submit the request. Managers and owners can approve or reject refund requests.",
  },
  {
    question: "How do I invite staff members?",
    answer:
      "Go to the Staff page and click 'Invite Staff'. Enter their email address and select their role (Manager, Supervisor, Receptionist, or Staff). They'll receive an email invitation to join your team.",
  },
  {
    question: "What is Salon Balance?",
    answer:
      "Salon Balance combines a customer's paid funds and salon-issued store credit for one salon. Customers can add funds, claim eligible gift vouchers, receive refund credit, and use the available balance when booking.",
  },
  {
    question: "How do I view reports?",
    answer:
      "The Reports page provides insights into your business performance. View revenue trends, appointment statistics, top services, and payment method breakdowns. You can filter by time period (today, week, month).",
  },
];

interface SupportTicketRow {
  id: string;
  issue_type: string;
  subject: string;
  status: string;
  created_at: string;
}

function buildReplayUrl(path: string, walkthroughId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}walkthrough=${encodeURIComponent(walkthroughId)}`;
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { currentTenant, canUseOwnerHub } = useAuth();
  const { hasPermission } = usePermissions();
  // Help's Walkthroughs tab lists everything, so unlike a single trigger
  // page it always needs both flags regardless of pageNeedsDataFlags.
  const { hasCustomers, hasCatalog } = useWalkthroughDataFlags(true);
  const { isEnabled: staffOperationsEnabled } = useStaffOperationsAddon();
  const isDesktop = useIsDesktopViewport();
  const navigate = useNavigate();

  const { checklistItems, checklistProgress, isChecklistComplete } = useDashboardStats();

  const walkthroughSections = getAvailableWalkthroughsBySection({
    hasPermission,
    canUseOwnerHub,
    hasCustomers,
    hasCatalog,
    staffOperationsEnabled,
  });
  const totalWalkthroughs = walkthroughSections.reduce((sum, s) => sum + s.items.length, 0);

  const { data: supportTickets = [] } = useQuery({
    queryKey: ["salon-support-tickets", currentTenant?.id],
    enabled: Boolean(currentTenant?.id),
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("support_tickets" as any)
        .select("id, issue_type, subject, status, created_at")
        .eq("tenant_id", currentTenant?.id)
        .order("created_at", { ascending: false })
        .limit(10) as any);
      if (error) throw error;
      return (data ?? []) as SupportTicketRow[];
    },
  });

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Help & Support</h1>
          <p className="text-muted-foreground">
            Find answers, walkthroughs, and contact our support team.
          </p>
        </div>

        {/* Search */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="text-center mb-4">
              <HelpCircle className="w-12 h-12 text-primary mx-auto mb-2" />
              <h2 className="text-lg font-semibold">How can we help you?</h2>
            </div>
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search FAQs..."
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="walkthroughs">
              <TabsList className="scrollbar-hide h-auto w-full justify-start overflow-x-auto overscroll-x-contain rounded-full bg-[#eee9e1] p-1 lg:w-fit">
                <TabsTrigger value="start" className="h-10 shrink-0 rounded-full px-5 sm:px-6">
                  Getting Started
                </TabsTrigger>
                <TabsTrigger value="walkthroughs" className="h-10 shrink-0 rounded-full px-5 sm:px-6">
                  Walkthroughs
                  {totalWalkthroughs > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{totalWalkthroughs}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="faq" className="h-10 shrink-0 rounded-full px-5 sm:px-6">
                  FAQs
                </TabsTrigger>
                <TabsTrigger value="support" className="h-10 shrink-0 rounded-full px-5 sm:px-6">
                  Tutorials & Support
                </TabsTrigger>
              </TabsList>

              {/* ── Getting Started ── */}
              <TabsContent value="start" className="mt-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">Complete your salon setup</h3>
                      <p className="text-sm text-muted-foreground">
                        {isChecklistComplete
                          ? "You've completed every setup step."
                          : `${checklistProgress}% complete`}
                      </p>
                    </div>
                    {checklistItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Nothing to set up right now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {checklistItems.map((step) => {
                          const meta = CHECKLIST_META[step.id];
                          if (!meta) return null;
                          const Icon = meta.icon;
                          return (
                            <a
                              key={step.id}
                              href={step.href}
                              className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                                step.completed ? "bg-success/5 hover:bg-success/10" : "bg-muted/50 hover:bg-muted"
                              }`}
                            >
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  step.completed ? "bg-success/10" : meta.iconBg
                                }`}
                              >
                                {step.completed ? (
                                  <Check className="w-5 h-5 text-success" />
                                ) : (
                                  <Icon className={`w-5 h-5 ${meta.iconColor}`} />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{step.label}</p>
                                  {step.completed && (
                                    <Badge className="bg-success/10 text-success text-xs">Completed</Badge>
                                  )}
                                </div>
                                {!step.completed && (
                                  <p className="text-sm text-muted-foreground">{meta.description}</p>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Walkthroughs ── */}
              <TabsContent value="walkthroughs" className="mt-6">
                {walkthroughSections.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground text-sm">
                      No walkthroughs available for your role yet.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        {walkthroughSections.map((section, sectionIndex) => {
                          const SectionIcon = section.sectionIcon;
                          return (
                            <div key={section.section}>
                              {sectionIndex > 0 && <div className="h-px bg-border -mx-6 mb-6" />}
                              <div className="flex items-center gap-2.5 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <SectionIcon className="w-4 h-4 text-primary" />
                                </div>
                                <h4 className="font-semibold text-sm">{section.section}</h4>
                              </div>
                              <div className="space-y-1">
                                {section.items.map((walkthrough) => {
                                  const step = walkthrough.buildStep({ isDesktop });
                                  return (
                                    <button
                                      key={walkthrough.id}
                                      type="button"
                                      onClick={() => navigate(buildReplayUrl(step.path, walkthrough.id))}
                                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/60"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{walkthrough.label}</p>
                                        <p className="text-xs text-muted-foreground">{walkthrough.description}</p>
                                      </div>
                                      <span className="flex items-center gap-1 text-xs font-semibold text-primary flex-shrink-0">
                                        Start
                                        <ArrowRight className="w-3 h-3" />
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── FAQs ── */}
              <TabsContent value="faq" className="mt-6">
                <Card>
                  <CardContent className="p-6">
                    {filteredFaqs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No matching questions found</div>
                    ) : (
                      <Accordion type="single" collapsible className="w-full">
                        {filteredFaqs.map((faq, index) => (
                          <AccordionItem key={index} value={`item-${index}`}>
                            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Tutorials & Support ── */}
              <TabsContent value="support" className="mt-6 space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-center gap-2">
                      <Video className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-semibold">Video Tutorials</h3>
                        <p className="text-sm text-muted-foreground">Watch step-by-step guides</p>
                      </div>
                    </div>
                    <Accordion type="single" collapsible className="w-full">
                      {videoTutorials.map((video, index) => (
                        <AccordionItem key={index} value={`video-${index}`}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Play className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{video.title}</p>
                                <p className="text-xs text-muted-foreground">{video.duration}</p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-2">
                              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-3">
                                <div className="text-center">
                                  <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground">Video coming soon</p>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">{video.description}</p>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-center gap-2">
                      <LifeBuoy className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-semibold">Client Support Tickets</h3>
                        <p className="text-sm text-muted-foreground">
                          Recent support requests submitted by clients for this salon.
                        </p>
                      </div>
                    </div>
                    {supportTickets.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No support tickets for this salon yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {supportTickets.map((ticket) => (
                          <div key={ticket.id} className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{ticket.subject}</p>
                                <p className="text-sm text-muted-foreground">
                                  {ticket.issue_type.replace(/_/g, " ")} ·{" "}
                                  {new Date(ticket.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <Badge variant="secondary">{ticket.status.replace(/_/g, " ")}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact — merged from the previous two duplicate cards, both of which linked to the same address */}
            <Card className="border-primary/20">
              <CardContent className="p-6 text-center">
                <Mail className="w-10 h-10 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Need more help?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our support team is here to assist you
                </p>
                <Button className="w-full" asChild>
                  <a href="mailto:support@salonmagik.com">Email Support</a>
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">System Status</p>
                    <p className="text-xs text-success">All systems operational</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
