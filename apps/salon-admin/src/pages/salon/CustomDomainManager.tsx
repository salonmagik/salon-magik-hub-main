import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Loader2, CheckCircle2, XCircle, Globe } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import { DomainPurchaseModal } from "./DomainPurchaseModal";
import { useDomainOrders } from "@/hooks/useDomainOrders";
import { Badge } from "@ui/badge";
import { useQueryClient } from "@tanstack/react-query";

export function CustomDomainManager() {
  const { currentTenant, refetchTenant } = useAuth();
  const [searchDomain, setSearchDomain] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<any>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const { data: domainOrders, isLoading: isLoadingOrders, refetch: refetchOrders } = useDomainOrders();
  const queryClient = useQueryClient();
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const checkAvailability = async () => {
    if (!searchDomain) return;
    setIsSearching(true);
    setAvailabilityResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("dotlet-check-domain-availability", {
        body: { domain: searchDomain },
      });

      if (error) throw error;
      setAvailabilityResult(data);
    } catch (err: any) {
      console.error("Domain search error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to check domain availability.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const configureDomain = async (orderId: string) => {
    setConfiguringId(orderId);
    try {
      const { error } = await supabase.functions.invoke("dotlet-configure-domain", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Domain configuration started.",
      });
      await refetchTenant();
      await refetchOrders();
    } catch (err: any) {
      console.error("Domain configure error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to configure domain.",
        variant: "destructive",
      });
    } finally {
      setConfiguringId(null);
    }
  };

  const disconnectDomain = async () => {
    if (!currentTenant?.id) return;
    setIsDisconnecting(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          custom_booking_domain: null,
          custom_domain_verified: false,
          dotlet_origin_rule_id: null,
          dotlet_domain_id: null,
        })
        .eq("id", currentTenant.id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Domain disconnected successfully.",
      });
      await refetchTenant();
    } catch (err: any) {
      console.error("Domain disconnect error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to disconnect domain.",
        variant: "destructive",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const hasActiveDomain = currentTenant?.custom_domain_verified && currentTenant?.custom_booking_domain;

  return (
    <div className="space-y-6">
      {hasActiveDomain ? (
        <Card>
          <CardHeader>
            <CardTitle>Active Custom Domain</CardTitle>
            <CardDescription>
              Your public booking site is currently accessible via your custom domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-success/10">
              <div className="flex items-center gap-3">
                <Globe className="w-8 h-8 text-success" />
                <div>
                  <p className="font-semibold text-lg">{currentTenant.custom_booking_domain}</p>
                  <p className="text-sm text-success font-medium">Verified & Active</p>
                </div>
              </div>
              <Button 
                variant="destructive" 
                onClick={disconnectDomain}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Disconnect Domain
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Custom Domain</CardTitle>
            <CardDescription>
              Search for and register a custom domain for your booking site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Find a Domain</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. mysalon.com"
                    value={searchDomain}
                    onChange={(e) => setSearchDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") checkAvailability();
                    }}
                  />
                  <Button onClick={checkAvailability} disabled={isSearching || !searchDomain}>
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Check
                  </Button>
                </div>
              </div>

              {availabilityResult && (
                <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {availabilityResult.available ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium">{searchDomain.toLowerCase()}</p>
                        <p className="text-sm text-muted-foreground">
                          {availabilityResult.available ? "Available" : "Not available"}
                        </p>
                      </div>
                    </div>
                    {availabilityResult.available && availabilityResult.price && (
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="font-medium text-lg">
                            {availabilityResult.currency === "USD" ? "$" : ""}
                            {(availabilityResult.price / 100).toFixed(2)}
                            {availabilityResult.currency !== "USD" ? ` ${availabilityResult.currency}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">per year</p>
                        </div>
                        <Button onClick={() => setIsPurchaseModalOpen(true)}>Purchase</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {domainOrders && domainOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
            <CardDescription>Track the status of your domain registrations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {domainOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{order.domain_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Ordered on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={order.status === 'completed' ? 'default' : order.status === 'failed' ? 'destructive' : 'secondary'}>
                      {order.status.replace('_', ' ')}
                    </Badge>
                    {order.status === 'completed' && (!hasActiveDomain || currentTenant?.custom_booking_domain !== order.domain_name) && (
                      <Button 
                        size="sm" 
                        onClick={() => configureDomain(order.id)}
                        disabled={configuringId === order.id}
                      >
                        {configuringId === order.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Configure
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {currentTenant && availabilityResult?.available && (
        <DomainPurchaseModal
          domain={searchDomain.toLowerCase()}
          tenant={currentTenant}
          price={availabilityResult.price}
          currency={availabilityResult.currency}
          isOpen={isPurchaseModalOpen}
          onOpenChange={setIsPurchaseModalOpen}
          onSuccess={() => {
            setIsPurchaseModalOpen(false);
            setAvailabilityResult(null);
            setSearchDomain("");
            refetchOrders();
          }}
        />
      )}
    </div>
  );
}
