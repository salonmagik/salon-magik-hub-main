import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useSalesOps } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { MoreHorizontal, Ticket } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { EmptyState } from "@ui/empty-state";

export default function CaptureClientPage() {
  const { backofficeUser } = useBackofficeAuth();
  const {
    campaignsQuery,
    usersQuery,
    promoCodesQuery,
    ensureOwnAgentProfile,
    ensureAgentProfileForUser,
    createPromoCode,
    sendPromoEmail,
    invalidatePromoCode,
  } = useSalesOps();

  const campaigns = campaignsQuery.data || [];
  const users = usersQuery.data || [];
  const promoCodes = promoCodesQuery.data || [];
  const activeCampaigns = useMemo(() => campaigns.filter((campaign: any) => campaign.is_active), [campaigns]);

  const [campaignId, setCampaignId] = useState("");
  const [selectedBackofficeUserId, setSelectedBackofficeUserId] = useState("");
  const [targetFirstName, setTargetFirstName] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedPromoCode, setSelectedPromoCode] = useState<any | null>(null);
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const selectableUsers = useMemo(() => users, [users]);

  const getUserLabel = (user: any) => {
    const fullName = (user.full_name || `${user.first_name || ""} ${user.last_name || ""}`).trim();
    if (fullName && user.email) return `${fullName} (${user.email})`;
    return user.email || fullName || "Unnamed user";
  };

  const getPromoMeta = (promoCode: any) => {
    const campaign = Array.isArray(promoCode.sales_promo_campaigns)
      ? promoCode.sales_promo_campaigns[0]
      : promoCode.sales_promo_campaigns;
    const redemption = Array.isArray(promoCode.sales_promo_redemptions)
      ? promoCode.sales_promo_redemptions[0]
      : promoCode.sales_promo_redemptions;
    const campaignEnded = campaign?.ends_at ? new Date(campaign.ends_at).getTime() <= Date.now() : false;
    const codeExpired = promoCode.expires_at ? new Date(promoCode.expires_at).getTime() <= Date.now() : false;
    const invalidated = Boolean(promoCode.invalidated_at) || promoCode.status === "invalidated";
    const remainingUses = redemption?.remaining_uses ?? campaign?.max_uses_per_tenant ?? 0;
    const resendable =
      !campaignEnded &&
      !invalidated &&
      remainingUses > 0 &&
      promoCode.status !== "consumed" &&
      promoCode.status !== "redeemed" &&
      (!codeExpired || promoCode.status === "claimed");

    return { campaign, redemption, campaignEnded, codeExpired, invalidated, remainingUses, resendable };
  };

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Ops · Capture Client</h1>
          <p className="text-muted-foreground">Generate and send email-bound promo codes for 24-hour conversion windows.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Promo Code</CardTitle>
            <CardDescription>Codes are email-bound, claimable once, and remain reusable for the campaign-configured number of eligible charges.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                  <SelectContent>
                    {activeCampaigns.map((campaign: any) => (
                      <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isSuperAdmin ? (
                <div className="space-y-2">
                  <Label>Sales Agent</Label>
                  <Select value={selectedBackofficeUserId} onValueChange={setSelectedBackofficeUserId}>
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      {selectableUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>{getUserLabel(user)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Recipient First Name</Label>
                <Input value={targetFirstName} onChange={(e) => setTargetFirstName(e.target.value)} placeholder="Ada" />
              </div>
              <div className="space-y-2">
                <Label>Target Email</Label>
                <Input type="email" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="owner@salon.com" />
              </div>
            </div>
            <Button
              onClick={async () => {
                let resolvedAgentId = "";
                if (isSuperAdmin) {
                  if (!selectedBackofficeUserId) return;
                  resolvedAgentId = (await ensureAgentProfileForUser.mutateAsync(selectedBackofficeUserId)) || "";
                } else {
                  resolvedAgentId = (await ensureOwnAgentProfile.mutateAsync()) || "";
                }
                const promo = await createPromoCode.mutateAsync({
                  campaignId,
                  agentId: resolvedAgentId,
                  targetEmail,
                  targetFirstName,
                });
                if (promo?.id) {
                  await sendPromoEmail.mutateAsync(promo.id);
                }
              }}
              disabled={
                !campaignId ||
                !targetEmail ||
                (isSuperAdmin && !selectedBackofficeUserId) ||
                createPromoCode.isPending ||
                sendPromoEmail.isPending ||
                ensureOwnAgentProfile.isPending ||
                ensureAgentProfileForUser.isPending
              }
            >
              Generate code & send
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Promo Codes</CardTitle>
            <CardDescription>Newest codes are listed first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.map((promoCode: any) => (
                  <TableRow key={promoCode.id}>
                    <TableCell className="font-medium">{promoCode.code}</TableCell>
                    <TableCell>{promoCode.target_email}</TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant={promoCode.status === "active" ? "default" : "secondary"} className="cursor-default">
                            {promoCode.status}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          "Active" means this code can still be claimed. It stops being active once redeemed, invalidated, or past its expiry date.
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{new Date(promoCode.expires_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="outline">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={async () => {
                              await navigator.clipboard.writeText(promoCode.code);
                              toast.success("Promo code copied");
                            }}
                          >
                            Copy
                          </DropdownMenuItem>
                          {getPromoMeta(promoCode).resendable ? (
                            <DropdownMenuItem
                              onClick={async () => {
                                await sendPromoEmail.mutateAsync(promoCode.id);
                              }}
                            >
                              Resend
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => setSelectedPromoCode(promoCode)}>
                            View details
                          </DropdownMenuItem>
                          {isSuperAdmin ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                await invalidatePromoCode.mutateAsync({
                                  promoCodeId: promoCode.id,
                                  reason: "Invalidated by super admin",
                                });
                              }}
                            >
                              Invalidate
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!promoCodes.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState icon={Ticket} title="No promo codes generated yet" />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={Boolean(selectedPromoCode)} onOpenChange={(open) => !open && setSelectedPromoCode(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Promo Code Details</DialogTitle>
              <DialogDescription>Current status, claim state, and remaining usage.</DialogDescription>
            </DialogHeader>
            {selectedPromoCode ? (() => {
              const { campaign, redemption, campaignEnded, codeExpired, invalidated, remainingUses } = getPromoMeta(selectedPromoCode);
              return (
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Code:</span> <span className="font-medium">{selectedPromoCode.code}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedPromoCode.target_email}</span></div>
                  <div><span className="text-muted-foreground">Campaign:</span> <span className="font-medium">{campaign?.name || "Unknown"}</span></div>
                  <div><span className="text-muted-foreground">Targets:</span> <span className="font-medium">{(campaign?.billing_targets || []).join(", ")}</span></div>
                  <div><span className="text-muted-foreground">Max uses:</span> <span className="font-medium">{campaign?.max_uses_per_tenant || 0}</span></div>
                  <div><span className="text-muted-foreground">Remaining uses:</span> <span className="font-medium">{remainingUses}</span></div>
                  <div><span className="text-muted-foreground">Claimed tenant:</span> <span className="font-medium">{selectedPromoCode.claimed_tenant_id || redemption?.tenant_id || "Not claimed"}</span></div>
                  <div><span className="text-muted-foreground">Claim status:</span> <span className="font-medium">{redemption?.status || selectedPromoCode.status}</span></div>
                  <div><span className="text-muted-foreground">Last sent:</span> <span className="font-medium">{selectedPromoCode.last_sent_at ? new Date(selectedPromoCode.last_sent_at).toLocaleString() : "Never"}</span></div>
                  <div><span className="text-muted-foreground">Send count:</span> <span className="font-medium">{selectedPromoCode.send_count || 0}</span></div>
                  <div><span className="text-muted-foreground">Campaign ended:</span> <span className="font-medium">{campaignEnded ? "Yes" : "No"}</span></div>
                  <div><span className="text-muted-foreground">Code expired:</span> <span className="font-medium">{codeExpired ? "Yes" : "No"}</span></div>
                  <div><span className="text-muted-foreground">Invalidated:</span> <span className="font-medium">{invalidated ? "Yes" : "No"}</span></div>
                  {selectedPromoCode.invalidation_reason ? (
                    <div><span className="text-muted-foreground">Invalidation reason:</span> <span className="font-medium">{selectedPromoCode.invalidation_reason}</span></div>
                  ) : null}
                </div>
              );
            })() : null}
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
