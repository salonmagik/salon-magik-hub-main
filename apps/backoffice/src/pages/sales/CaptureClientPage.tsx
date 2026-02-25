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

export default function CaptureClientPage() {
  const { backofficeUser } = useBackofficeAuth();
  const {
    campaignsQuery,
    usersQuery,
    promoCodesQuery,
    ensureOwnAgentProfile,
    ensureAgentProfileForUser,
    createPromoCode,
  } = useSalesOps();

  const campaigns = campaignsQuery.data || [];
  const users = usersQuery.data || [];
  const promoCodes = promoCodesQuery.data || [];
  const activeCampaigns = useMemo(() => campaigns.filter((campaign: any) => campaign.is_active), [campaigns]);

  const [campaignId, setCampaignId] = useState("");
  const [selectedBackofficeUserId, setSelectedBackofficeUserId] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const selectableUsers = useMemo(() => users, [users]);

  const getUserLabel = (user: any) => {
    const fullName = (user.full_name || `${user.first_name || ""} ${user.last_name || ""}`).trim();
    if (fullName && user.email) return `${fullName} (${user.email})`;
    return user.email || fullName || "Unnamed user";
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
            <CardDescription>Codes are email-bound, one-time, and expire after 24 hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
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
                createPromoCode.mutate({ campaignId, agentId: resolvedAgentId, targetEmail });
              }}
              disabled={
                !campaignId ||
                !targetEmail ||
                (isSuperAdmin && !selectedBackofficeUserId) ||
                createPromoCode.isPending ||
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
                      <Badge variant={promoCode.status === "active" ? "default" : "secondary"}>
                        {promoCode.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(promoCode.expires_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(promoCode.code);
                          toast.success("Promo code copied");
                        }}
                      >
                        Copy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!promoCodes.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                      No promo codes generated yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
