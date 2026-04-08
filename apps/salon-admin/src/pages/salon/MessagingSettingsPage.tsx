import { useState, useEffect } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Separator } from "@ui/separator";
import {
  MessageSquare,
  Settings,
  CreditCard,
  ExternalLink,
  Loader2,
  Save,
  CheckCircle,
  Mail,
  Phone,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import { format } from "date-fns";
import { cn } from "@shared/utils";
import { WhatsAppTemplateManager } from "@/components/messaging/WhatsAppTemplateManager";
import { CreditPurchaseDialog } from "@/components/billing/CreditPurchaseDialog";

interface TermiiConfig {
  termii_device_id: string | null;
  termii_sender_id: string | null;
}

interface CreditBalance {
  balance: number;
}

interface CreditPurchase {
  id: string;
  credits: number;
  amount: number;
  currency: string;
  paid_via: string;
  created_at: string;
}

interface MessageLog {
  id: string;
  channel: string;
  provider: string | null;
  credits_used: number;
  created_at: string;
  customer_id: string | null;
  customers: {
    full_name: string;
  } | null;
}

export default function MessagingSettingsPage() {
  const { currentTenant, user } = useAuth();
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [senderId, setSenderId] = useState("");

  const [creditBalance, setCreditBalance] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [creditPurchases, setCreditPurchases] = useState<CreditPurchase[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [recentMessages, setRecentMessages] = useState<MessageLog[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  const [creditPurchaseDialogOpen, setCreditPurchaseDialogOpen] = useState(false);

  const currency = currentTenant?.currency || "USD";

  // Fetch Termii configuration
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("termii_device_id, termii_sender_id")
          .eq("id", currentTenant.id)
          .single();

        if (error) throw error;

        const config = data as TermiiConfig;
        setDeviceId(config.termii_device_id || "");
        setSenderId(config.termii_sender_id || "SalonMagik");
      } catch (err) {
        console.error("Error fetching Termii config:", err);
        toast({
          title: "Error",
          description: "Failed to load Termii configuration",
          variant: "destructive",
        });
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchConfig();
  }, [currentTenant?.id]);

  // Fetch credit balance
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchBalance = async () => {
      try {
        const { data, error } = await supabase
          .from("communication_credits")
          .select("balance")
          .eq("tenant_id", currentTenant.id)
          .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows

        setCreditBalance((data as CreditBalance)?.balance || 0);
      } catch (err) {
        console.error("Error fetching credit balance:", err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [currentTenant?.id, creditPurchaseDialogOpen]); // Refetch when dialog closes

  // Fetch recent credit purchases
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchPurchases = async () => {
      try {
        const { data, error } = await supabase
          .from("messaging_credit_purchases")
          .select("id, credits, amount, currency, paid_via, created_at")
          .eq("tenant_id", currentTenant.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) throw error;

        setCreditPurchases(data as CreditPurchase[]);
      } catch (err) {
        console.error("Error fetching credit purchases:", err);
      } finally {
        setIsLoadingPurchases(false);
      }
    };

    fetchPurchases();
  }, [currentTenant?.id, creditPurchaseDialogOpen]); // Refetch when dialog closes

  // Fetch recent message logs
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("message_logs")
          .select("id, channel, provider, credits_used, created_at, customer_id, customers:customer_id(full_name)")
          .eq("tenant_id", currentTenant.id)
          .not("credits_used", "is", null)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;

        setRecentMessages(data as MessageLog[]);
      } catch (err) {
        console.error("Error fetching recent messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [currentTenant?.id]);

  const handleSaveConfig = async () => {
    if (!currentTenant?.id) return;

    // Validate sender ID (alphanumeric, 3-11 chars)
    if (senderId && (senderId.length < 3 || senderId.length > 11 || !/^[a-zA-Z0-9]+$/.test(senderId))) {
      toast({
        title: "Invalid Sender ID",
        description: "Sender ID must be alphanumeric and between 3-11 characters",
        variant: "destructive",
      });
      return;
    }

    setIsSavingConfig(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          termii_device_id: deviceId || null,
          termii_sender_id: senderId || "SalonMagik",
        })
        .eq("id", currentTenant.id);

      if (error) throw error;

      toast({
        title: "Configuration Saved",
        description: "Termii configuration has been updated successfully",
      });
    } catch (err) {
      console.error("Error saving Termii config:", err);
      toast({
        title: "Error",
        description: "Failed to save Termii configuration",
        variant: "destructive",
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const formatCurrency = (amount: number, curr: string) => {
    const symbols: Record<string, string> = {
      USD: "$",
      GHS: "₵",
      NGN: "₦",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[curr] || curr} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <Phone className="h-4 w-4" />;
      case "whatsapp":
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getProviderLabel = (provider: string | null) => {
    if (!provider) return "Unknown";
    const labels: Record<string, string> = {
      resend: "Resend",
      termii_sms: "Termii SMS",
      termii_whatsapp: "Termii WhatsApp",
      meta_whatsapp: "Meta WhatsApp",
    };
    return labels[provider] || provider;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* <SalonSidebar /> */}

      <div className="lg:pl-64">
        <div className="p-4 lg:p-8">
          {/* Breadcrumb */}
          <div className="mb-6">
            <div className="flex items-center text-sm text-muted-foreground">
              <Settings className="h-4 w-4 mr-2" />
              <span>Settings</span>
              <span className="mx-2">/</span>
              <span className="text-foreground">Messaging</span>
            </div>
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Messaging Settings</h1>
            <p className="text-muted-foreground">
              Configure Termii integration, manage WhatsApp templates, and track messaging credits
            </p>
          </div>

          <div className="space-y-8">
            {/* Section 1: Termii Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Termii Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Termii device ID and sender ID for SMS and WhatsApp messaging
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingConfig ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="device-id">Device ID</Label>
                      <Input
                        id="device-id"
                        placeholder="Enter Termii Device ID"
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground">
                        Your Termii device ID for WhatsApp messaging
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sender-id">Sender ID</Label>
                      <Input
                        id="sender-id"
                        placeholder="Enter Sender ID (3-11 alphanumeric characters)"
                        value={senderId}
                        onChange={(e) => setSenderId(e.target.value)}
                        maxLength={11}
                      />
                      <p className="text-sm text-muted-foreground">
                        Alphanumeric sender ID for SMS messages (3-11 characters). Default: SalonMagik
                      </p>
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                      <Button
                        onClick={handleSaveConfig}
                        disabled={isSavingConfig}
                      >
                        {isSavingConfig ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Configuration
                          </>
                        )}
                      </Button>

                      <a
                        href="https://www.termii.com/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center"
                      >
                        View Termii Documentation
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Section 2: WhatsApp Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp Templates
                </CardTitle>
                <CardDescription>
                  Create and manage WhatsApp message templates for customer communication
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentTenant?.id && (
                  <WhatsAppTemplateManager tenantId={currentTenant.id} />
                )}
              </CardContent>
            </Card>

            {/* Section 3: Credit Balance & History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Credit Balance & History
                </CardTitle>
                <CardDescription>
                  Manage messaging credits and view usage history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Balance */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Current Credit Balance</p>
                      {isLoadingBalance ? (
                        <Skeleton className="h-10 w-32" />
                      ) : (
                        <p className="text-4xl font-bold">{creditBalance.toLocaleString()}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        Email: 1 credit • SMS/WhatsApp: 2 credits
                      </p>
                    </div>
                    <Button
                      onClick={() => setCreditPurchaseDialogOpen(true)}
                      size="lg"
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Purchase Credits
                    </Button>
                  </div>

                  {creditBalance < 10 && (
                    <div className="flex items-start gap-2 p-3 bg-warning-bg border border-warning rounded-lg">
                      <AlertCircle className="h-5 w-5 text-warning-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-warning-foreground">Low Credit Balance</p>
                        <p className="text-sm text-muted-foreground">
                          You have {creditBalance} credits remaining. Purchase more credits to continue sending messages.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Recent Credit Purchases */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Credit Purchases</h3>
                  {isLoadingPurchases ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : creditPurchases.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No credit purchases yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {creditPurchases.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{purchase.credits.toLocaleString()} Credits</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(purchase.created_at), "MMM dd, yyyy 'at' HH:mm")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {formatCurrency(purchase.amount, purchase.currency)}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {purchase.paid_via === "salon_purse" ? "Wallet" : "Paystack"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Recent Credit Usage */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Credit Usage</h3>
                  {isLoadingMessages ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : recentMessages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No messages sent yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentMessages.map((message) => (
                        <div
                          key={message.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              message.channel === "email" && "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
                              message.channel === "sms" && "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
                              message.channel === "whatsapp" && "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                            )}>
                              {getChannelIcon(message.channel)}
                            </div>
                            <div>
                              <p className="font-medium capitalize">
                                {message.channel}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {message.customers?.full_name || "Unknown"} • {format(new Date(message.created_at), "MMM dd, yyyy 'at' HH:mm")}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{message.credits_used} credits</p>
                            <p className="text-xs text-muted-foreground">
                              {getProviderLabel(message.provider)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Credit Purchase Dialog */}
      {currentTenant?.id && (
        <CreditPurchaseDialog
          open={creditPurchaseDialogOpen}
          onOpenChange={setCreditPurchaseDialogOpen}
          tenantId={currentTenant.id}
          currentBalance={creditBalance}
        />
      )}
    </div>
  );
}
