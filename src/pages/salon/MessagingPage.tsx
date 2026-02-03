import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare,
  Mail,
  Phone,
  CreditCard,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Plus,
} from "lucide-react";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { useEmailTemplates, templateTypeLabels, type TemplateType } from "@/hooks/useEmailTemplates";
import { EditTemplateDialog } from "@/components/dialogs/EditTemplateDialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, { bg: string; text: string; icon: any }> = {
  delivered: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  sent: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", icon: Clock },
  failed: { bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
};

export default function MessagingPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [editingTemplate, setEditingTemplate] = useState<TemplateType | null>(null);
  const { credits, messageLogs, stats, isLoading } = useMessagingCredits();
  const { templates, isLoading: templatesLoading, refetch: refetchTemplates } = useEmailTemplates();

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Messaging</h1>
            <p className="text-muted-foreground">
              Manage communication credits, templates, and delivery history.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Buy Credits
          </Button>
        </div>

        {/* Credits Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Credits Remaining</p>
                  <p className="text-3xl font-bold mt-1">{stats.creditsRemaining}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Free allocation: {stats.freeAllocation}/month
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Messages Sent</p>
                  <p className="text-3xl font-bold mt-1">{stats.totalSent}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      <Mail className="w-3 h-3 mr-1" />
                      {stats.emailsSent}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      <Phone className="w-3 h-3 mr-1" />
                      {stats.smsSent}
                    </Badge>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-success/10">
                  <Send className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed Messages</p>
                  <p className="text-3xl font-bold mt-1">{stats.totalFailed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Require attention</p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10">
                  <XCircle className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="history">Delivery History</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* How Credits Work */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">How Credits Work</CardTitle>
                  <CardDescription>
                    Credits are used to send notifications to your customers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3 mb-2">
                        <Mail className="w-5 h-5 text-primary" />
                        <span className="font-medium">Email</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        1 credit per email sent. Includes appointment reminders, confirmations, and receipts.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3 mb-2">
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="font-medium">SMS</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        2 credits per SMS. Best for urgent reminders and time-sensitive notifications.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">Free Monthly Allocation</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Every month, you receive {stats.freeAllocation} free credits. Unused credits don't roll over.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Email Templates</CardTitle>
                  <CardDescription>
                    Customize the messages sent to your customers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-8 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(Object.keys(templateTypeLabels) as TemplateType[]).map((type) => {
                        const template = templates.find((t) => t.template_type === type);
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{templateTypeLabels[type]}</p>
                                {template && (
                                  <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                                    {template.subject}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {template ? (
                                <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                                  Customized
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                              <Button variant="outline" size="sm" onClick={() => setEditingTemplate(type)}>
                                Edit
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Delivery History</CardTitle>
                  <CardDescription>
                    Recent messages sent to customers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface">
                          <div className="flex items-center gap-4">
                            <Skeleton className="w-10 h-10 rounded-full" />
                            <div>
                              <Skeleton className="h-4 w-32 mb-1" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : messageLogs.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-muted-foreground">No messages sent yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messageLogs.map((log) => {
                        const style = statusStyles[log.status] || statusStyles.pending;
                        const StatusIcon = style.icon;

                        return (
                          <div
                            key={log.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center",
                                  log.channel === "email" ? "bg-primary/10" : "bg-purple-500/10"
                                )}
                              >
                                {log.channel === "email" ? (
                                  <Mail className="w-5 h-5 text-primary" />
                                ) : (
                                  <Phone className="w-5 h-5 text-purple-500" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{log.recipient}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span className="capitalize">{log.template_type?.replace(/_/g, " ") || "Custom"}</span>
                                  <span>•</span>
                                  <span>{format(new Date(log.created_at), "MMM d, h:mm a")}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={cn("text-xs", style.bg, style.text)}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {log.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {log.credits_used} credit{log.credits_used !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Template Edit Dialog */}
        <EditTemplateDialog
          open={!!editingTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingTemplate(null);
              refetchTemplates();
            }
          }}
          templateType={editingTemplate}
        />
      </div>
    </SalonSidebar>
  );
}
