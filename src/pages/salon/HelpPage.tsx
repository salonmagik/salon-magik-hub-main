import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  Search,
  Book,
  Video,
  MessageCircle,
  Mail,
  ExternalLink,
  ChevronRight,
  Lightbulb,
  Settings,
  Users,
  Calendar,
  CreditCard,
  Scissors,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const gettingStartedSteps = [
  {
    title: "Add your services",
    description: "Create your service catalog with pricing and duration",
    icon: Scissors,
    link: "/salon/services",
    completed: true,
  },
  {
    title: "Set up your team",
    description: "Invite staff members and assign roles",
    icon: Users,
    link: "/salon/staff",
    completed: false,
  },
  {
    title: "Configure business hours",
    description: "Set your opening days and operating hours",
    icon: Calendar,
    link: "/salon/settings",
    completed: true,
  },
  {
    title: "Set up payments",
    description: "Configure payment methods and deposit settings",
    icon: CreditCard,
    link: "/salon/settings",
    completed: false,
  },
  {
    title: "Enable online booking",
    description: "Let customers book appointments online",
    icon: Settings,
    link: "/salon/settings",
    completed: false,
  },
];

const faqs = [
  {
    question: "How do I add a new service?",
    answer:
      "Go to Products & Services, click on the Services tab, then click 'Add Service'. Fill in the service name, price, duration, and any other details. You can also assign services to categories for better organization.",
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
      "Yes! Go to Products & Services, click on the Packages tab, and create a new package. You can bundle multiple services together at a discounted price. The savings will be automatically displayed to customers.",
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
    question: "What are customer purses?",
    answer:
      "Customer purses are digital wallets where customers can store credit. This can be topped up by the customer or as store credit from refunds. Customers can use their purse balance to pay for services.",
  },
  {
    question: "How do I view reports?",
    answer:
      "The Reports page provides insights into your business performance. View revenue trends, appointment statistics, top services, and payment method breakdowns. You can filter by time period (today, week, month).",
  },
];

const resources = [
  {
    title: "Email Support",
    description: "Get help via email",
    icon: Mail,
    link: "mailto:support@salonmagik.com",
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

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
            Find answers, tutorials, and contact our support team.
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
                placeholder="Search for help..."
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Getting Started */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  Getting Started
                </CardTitle>
                <CardDescription>
                  Complete these steps to set up your salon
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {gettingStartedSteps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <a
                        key={index}
                        href={step.link}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-lg transition-colors",
                          step.completed
                            ? "bg-success/5 hover:bg-success/10"
                            : "bg-muted/50 hover:bg-muted"
                        )}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                            step.completed ? "bg-success/10" : "bg-muted"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-5 h-5",
                              step.completed ? "text-success" : "text-muted-foreground"
                            )}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{step.title}</p>
                            {step.completed && (
                              <Badge className="bg-success/10 text-success text-xs">
                                Completed
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredFaqs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No matching questions found
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFaqs.map((faq, index) => (
                      <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger className="text-left">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resources */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {resources.map((resource, index) => {
                  const Icon = resource.icon;
                  return (
                    <a
                      key={index}
                      href={resource.link}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{resource.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {resource.description}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                  );
                })}
              </CardContent>
            </Card>

            {/* Contact */}
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
