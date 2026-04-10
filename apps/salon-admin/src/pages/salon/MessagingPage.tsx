import { useState, useEffect } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { Switch } from "@ui/switch";
import { Alert, AlertDescription } from "@ui/alert";
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
  Users,
  Edit,
  Settings,
  AlertCircle,
} from "lucide-react";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { useEmailTemplates, templateTypeLabels, type TemplateType } from "@/hooks/useEmailTemplates";
import { useSMSTemplates, smsTemplateTypeLabels, type SMSTemplateType } from "@/hooks/useSMSTemplates";
import { useWhatsAppTemplates, whatsappTemplateTypeLabels, type WhatsAppTemplateType } from "@/hooks/useWhatsAppTemplates";
import { EditTemplateDialog } from "@/components/dialogs/EditTemplateDialog";
import { EditSMSTemplateDialog } from "@/components/messaging/EditSMSTemplateDialog";
import { EditWhatsAppTemplateDialog } from "@/components/messaging/EditWhatsAppTemplateDialog";
import { BulkSendSMSDialog } from "@/components/messaging/BulkSendSMSDialog";
import { BulkSendWhatsAppDialog } from "@/components/messaging/BulkSendWhatsAppDialog";
import { SetSenderNameDialog } from "@/components/messaging/SetSenderNameDialog";
import { ConfigureWhatsAppDialog } from "@/components/messaging/ConfigureWhatsAppDialog";
import { CreditPurchaseDialog } from "@/components/billing/CreditPurchaseDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { cn } from "@shared/utils";
import { toast } from "@ui/ui/use-toast";

const statusStyles: Record<string, { bg: string; text: string; icon: any }> = {
  delivered: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  sent: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", icon: Clock },
  failed: { bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
};

export default function MessagingPage() {
  const { currentTenant } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [editingTemplate, setEditingTemplate] = useState<TemplateType | null>(null);
  const [editingSMSTemplate, setEditingSMSTemplate] = useState<SMSTemplateType | null>(null);
  const [editingWhatsAppTemplate, setEditingWhatsAppTemplate] = useState<WhatsAppTemplateType | null>(null);
  const [bulkSendDialogOpen, setBulkSendDialogOpen] = useState(false);
  const [bulkSendWhatsAppDialogOpen, setBulkSendWhatsAppDialogOpen] = useState(false);
  const [senderNameDialogOpen, setSenderNameDialogOpen] = useState(false);
  const [whatsappDeviceConfigOpen, setWhatsappDeviceConfigOpen] = useState(false);
  const [creditPurchaseDialogOpen, setCreditPurchaseDialogOpen] = useState(false);
  const [senderIdStatus, setSenderIdStatus] = useState<"not_set" | "pending" | "approved" | "rejected">("not_set");
  const [senderId, setSenderId] = useState<string | null>(null);
  const [whatsappDeviceId, setWhatsappDeviceId] = useState<string | null>(null);
  const [isLoadingSenderConfig, setIsLoadingSenderConfig] = useState(true);
  
  const { credits, messageLogs, stats, isLoading, refetch: refetchCredits } = useMessagingCredits();
  const { templates, isLoading: templatesLoading, refetch: refetchTemplates } = useEmailTemplates();
  const { templates: smsTemplates, isLoading: smsTemplatesLoading, refetch: refetchSMSTemplates, upsertTemplate: upsertSMSTemplate } = useSMSTemplates();
  const { templates: whatsappTemplates, isLoading: whatsappTemplatesLoading, refetch: refetchWhatsAppTemplates } = useWhatsAppTemplates();

  // Handle URL params for payment success/failure
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseStatus = params.get('purchase');
    
    if (purchaseStatus === 'success') {
      toast({
        title: "Credits purchased successfully!",
        description: "Your credits have been added to your balance.",
      });
      // Clean URL and refetch credits
      window.history.replaceState({}, '', '/salon/messaging');
      refetchCredits();
    } else if (purchaseStatus === 'cancelled') {
      toast({
        title: "Purchase cancelled",
        description: "Your credit purchase was cancelled.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/salon/messaging');
    }
  }, [refetchCredits]);

  // Fetch sender ID configuration
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchSenderConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("termii_sender_id, termii_sender_id_status, termii_device_id")
          .eq("id", currentTenant.id)
          .single();

        if (error) throw error;

        setSenderId(data.termii_sender_id);
        setSenderIdStatus(data.termii_sender_id_status || "not_set");
        setWhatsappDeviceId(data.termii_device_id || null);
      } catch (err) {
        console.error("Error fetching sender config:", err);
      } finally {
        setIsLoadingSenderConfig(false);
      }
    };

    fetchSenderConfig();
  }, [currentTenant?.id]);

  const handleSenderConfigChange = async () => {
    // Refetch sender config after changes
    if (!currentTenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("termii_sender_id, termii_sender_id_status, termii_device_id")
        .eq("id", currentTenant.id)
        .single();

      if (error) throw error;

      setSenderId(data.termii_sender_id);
      setSenderIdStatus(data.termii_sender_id_status || "not_set");
      setWhatsappDeviceId(data.termii_device_id || null);
    } catch (err) {
      console.error("Error refetching sender config:", err);
    }
  };

  const getSenderButtonText = () => {
    if (isLoadingSenderConfig) return "Loading...";
    switch (senderIdStatus) {
      case "approved":
        return "Sender Name (Approved)";
      case "pending":
        return "Sender Name (Pending)";
      case "rejected":
        return "Sender Name (Rejected)";
      default:
        return "Configure Sender Name";
    }
  };

  const getSenderButtonVariant = () => {
    switch (senderIdStatus) {
      case "approved":
        return "default" as const;
      case "pending":
        return "secondary" as const;
      case "rejected":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

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
          <div className="flex items-center gap-2">
            <Button
              variant={getSenderButtonVariant()}
              onClick={() => setSenderNameDialogOpen(true)}
              className="gap-2"
              disabled={isLoadingSenderConfig}
            >
              <Settings className="w-4 h-4" />
              {getSenderButtonText()}
            </Button>
            <Button onClick={() => setCreditPurchaseDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Buy Credits
            </Button>
          </div>
        </div>

        {/* Sender ID Alert */}
        {!isLoadingSenderConfig && senderIdStatus === "not_set" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>
                  Configure your SMS Sender Name to personalize your messages. Messages will use the default "SalonMagik" sender until configured.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSenderNameDialogOpen(true)}
                  className="ml-4"
                >
                  Configure Now
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

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
            <TabsTrigger value="sms-templates">SMS Templates</TabsTrigger>
            <TabsTrigger value="email-templates">Email Templates</TabsTrigger>
            <TabsTrigger value="whatsapp-templates">Whatsapp Templates</TabsTrigger>
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

            {/* SMS Templates Tab */}
            <TabsContent value="sms-templates" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">SMS Templates</CardTitle>
                    <CardDescription>
                      Manage SMS templates with auto-send triggers and bulk sending
                    </CardDescription>
                    {/* Sender Name Display */}
                    {!isLoadingSenderConfig && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">SMS from:</span>
                        <Badge
                          variant={senderIdStatus === "approved" ? "default" : "secondary"}
                          className={cn(
                            "text-xs",
                            senderIdStatus === "approved" && "bg-success/10 text-success",
                            senderIdStatus === "pending" && "bg-warning-bg text-warning-foreground",
                            senderIdStatus === "rejected" && "bg-destructive/10 text-destructive"
                          )}
                        >
                          {senderId || "SalonMagik"} {senderIdStatus === "not_set" && "(Default)"}
                          {senderIdStatus === "pending" && " (Pending)"}
                          {senderIdStatus === "approved" && " (Approved)"}
                          {senderIdStatus === "rejected" && " (Rejected)"}
                        </Badge>
                        {senderIdStatus !== "approved" && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => setSenderNameDialogOpen(true)}
                          >
                            Configure
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <Button onClick={() => setBulkSendDialogOpen(true)} className="gap-2">
                    <Users className="w-4 h-4" />
                    Bulk Send Custom SMS
                  </Button>
                </CardHeader>
                <CardContent>
                  {smsTemplatesLoading ? (
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
                      {(Object.keys(smsTemplateTypeLabels) as SMSTemplateType[]).map((type) => {
                        const template = smsTemplates.find((t) => t.template_type === type);
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <Phone className="w-4 h-4 text-purple-500" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{smsTemplateTypeLabels[type]}</p>
                                {template && (
                                  <p className="text-sm text-muted-foreground truncate max-w-[400px]">
                                    {template.message}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {template ? (
                                <>
                                  {template.auto_send_enabled && (
                                    <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                                      Auto-send ON
                                    </Badge>
                                  )}
                                  {template.is_active ? (
                                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">
                                      Inactive
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingSMSTemplate(type)}
                                className="gap-2"
                              >
                                <Edit className="w-3 h-3" />
                                Edit
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  // TODO: Open manual send dialog with this template
                                  setBulkSendDialogOpen(true);
                                }}
                                className="gap-2"
                              >
                                <Send className="w-3 h-3" />
                                Bulk Send
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

            {/* Email Templates Tab */}
            <TabsContent value="email-templates" className="mt-0">
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

            {/* Whatsapp Templates Tab */}
            <TabsContent value="whatsapp-templates" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">WhatsApp Templates</CardTitle>
                    <CardDescription>
                      Manage WhatsApp templates with auto-send triggers and bulk sending
                    </CardDescription>
                    {/* Device ID Display */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">WhatsApp Device:</span>
                      <Badge variant={whatsappDeviceId ? "default" : "secondary"} className="text-xs">
                        {whatsappDeviceId || "Not configured"}
                      </Badge>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setWhatsappDeviceConfigOpen(true)}
                      >
                        {whatsappDeviceId ? "Change" : "Configure"}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    onClick={() => setBulkSendWhatsAppDialogOpen(true)} 
                    className="gap-2"
                    disabled={!whatsappDeviceId}
                  >
                    <Users className="w-4 h-4" />
                    Bulk Send WhatsApp
                  </Button>
                </CardHeader>
                <CardContent>
                  {/* Device ID Alert */}
                  {!whatsappDeviceId && (
                    <Alert className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex items-center justify-between">
                          <span>
                            Configure your WhatsApp device to enable messaging.
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setWhatsappDeviceConfigOpen(true)}
                            className="ml-4"
                          >
                            Configure Now
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Templates List */}
                  {whatsappTemplatesLoading ? (
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
                      {(Object.keys(whatsappTemplateTypeLabels) as WhatsAppTemplateType[]).map((type) => {
                        const template = whatsappTemplates.find((t) => t.template_name === type);
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <MessageSquare className="w-4 h-4 text-green-500" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{whatsappTemplateTypeLabels[type]}</p>
                                {template && template.template_content && (
                                  <p className="text-sm text-muted-foreground truncate max-w-[400px]">
                                    {template.template_content}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {template ? (
                                <>
                                  {template.status === "approved" ? (
                                    <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                                      Approved
                                    </Badge>
                                  ) : template.status === "pending" ? (
                                    <Badge variant="secondary" className="text-xs bg-warning-bg text-warning-foreground">
                                      Pending
                                    </Badge>
                                  ) : template.status === "rejected" ? (
                                    <Badge variant="destructive" className="text-xs">
                                      Rejected
                                    </Badge>
                                  ) : null}
                                </>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingWhatsAppTemplate(type)}
                                className="gap-2"
                                disabled={!whatsappDeviceId}
                              >
                                <Edit className="w-3 h-3" />
                                Edit
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setBulkSendWhatsAppDialogOpen(true);
                                }}
                                className="gap-2"
                                disabled={!whatsappDeviceId || template?.status !== "approved"}
                              >
                                <Send className="w-3 h-3" />
                                Bulk Send
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

        {/* SMS Template Edit Dialog */}
        <EditSMSTemplateDialog
          open={!!editingSMSTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingSMSTemplate(null);
              refetchSMSTemplates();
            }
          }}
          templateType={editingSMSTemplate}
        />

        {/* WhatsApp Template Edit Dialog */}
        <EditWhatsAppTemplateDialog
          open={!!editingWhatsAppTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingWhatsAppTemplate(null);
              refetchWhatsAppTemplates();
            }
          }}
          templateType={editingWhatsAppTemplate}
        />

        {/* Bulk Send SMS Dialog */}
        <BulkSendSMSDialog
          open={bulkSendDialogOpen}
          onOpenChange={setBulkSendDialogOpen}
        />

        {/* Bulk Send WhatsApp Dialog */}
        <BulkSendWhatsAppDialog
          open={bulkSendWhatsAppDialogOpen}
          onOpenChange={setBulkSendWhatsAppDialogOpen}
        />

        {/* Set Sender Name Dialog */}
        <SetSenderNameDialog
          open={senderNameDialogOpen}
          onOpenChange={setSenderNameDialogOpen}
          currentSenderId={senderId}
          currentStatus={senderIdStatus}
          onStatusChange={handleSenderConfigChange}
        />

        {/* Configure WhatsApp Dialog */}
        <ConfigureWhatsAppDialog
          open={whatsappDeviceConfigOpen}
          onOpenChange={setWhatsappDeviceConfigOpen}
          currentDeviceId={whatsappDeviceId}
          onDeviceIdChange={handleSenderConfigChange}
        />

        {/* Credit Purchase Dialog */}
        <CreditPurchaseDialog
          open={creditPurchaseDialogOpen}
          onOpenChange={(open) => {
            setCreditPurchaseDialogOpen(open);
            if (!open) {
              // Refetch credits when dialog closes
              refetchCredits();
            }
          }}
        />
      </div>
    </SalonSidebar>
  );
}
