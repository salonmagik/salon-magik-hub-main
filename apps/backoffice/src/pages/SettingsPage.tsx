 import { useState } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Label } from "@ui/label";
 import { Switch } from "@ui/switch";
 import { Textarea } from "@ui/textarea";
 import { Badge } from "@ui/badge";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from "@ui/dialog";
 import {
   Alert,
   AlertDescription,
   AlertTitle,
 } from "@ui/alert";
 import { toast } from "sonner";
 import { AlertTriangle, ShieldAlert, Power, Lock } from "lucide-react";
 import type { Json } from "@/lib/supabase";
 
 interface KillSwitchValue {
   enabled: boolean;
   reason: string | null;
   enabled_at: string | null;
   enabled_by: string | null;
 }
 
 function parseKillSwitch(value: Json | null): KillSwitchValue {
   if (!value || typeof value !== "object" || Array.isArray(value)) {
     return { enabled: false, reason: null, enabled_at: null, enabled_by: null };
   }
   const obj = value as Record<string, unknown>;
   return {
     enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
     reason: typeof obj.reason === "string" ? obj.reason : null,
     enabled_at: typeof obj.enabled_at === "string" ? obj.enabled_at : null,
     enabled_by: typeof obj.enabled_by === "string" ? obj.enabled_by : null,
   };
 }
 
 export default function BackofficeSettingsPage() {
   const queryClient = useQueryClient();
   const { backofficeUser, profile } = useBackofficeAuth();
   const isSuperAdmin = backofficeUser?.role === "super_admin";
 
   const [killSwitchDialogOpen, setKillSwitchDialogOpen] = useState(false);
   const [killSwitchReason, setKillSwitchReason] = useState("");
   const [pendingKillSwitchState, setPendingKillSwitchState] = useState(false);
 
   const { data: killSwitch, isLoading } = useQuery({
     queryKey: ["platform-settings", "kill_switch"],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("platform_settings")
         .select("*")
         .eq("key", "kill_switch")
         .single();
       if (error) throw error;
       return parseKillSwitch(data?.value ?? null);
     },
   });
 
   const toggleKillSwitchMutation = useMutation({
     mutationFn: async ({ enabled, reason }: { enabled: boolean; reason: string }) => {
       const newValue: Record<string, Json> = {
         enabled,
         reason: enabled ? reason : null,
         enabled_at: enabled ? new Date().toISOString() : null,
         enabled_by: enabled ? profile?.full_name || backofficeUser?.user_id || null : null,
       };
 
       const { error } = await supabase
         .from("platform_settings")
         .update({
           value: newValue,
           updated_by_id: backofficeUser?.user_id,
         })
         .eq("key", "kill_switch");
 
       if (error) throw error;
 
       // Log the action
       await supabase.from("audit_logs").insert({
         action: enabled ? "kill_switch_enabled" : "kill_switch_disabled",
         entity_type: "platform_settings",
         entity_id: null,
         actor_user_id: backofficeUser?.user_id,
         metadata: { reason },
       });
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["platform-settings", "kill_switch"] });
       toast.success(
         pendingKillSwitchState
           ? "Kill switch enabled - platform is now in read-only mode"
           : "Kill switch disabled - platform is back to normal"
       );
       setKillSwitchDialogOpen(false);
       setKillSwitchReason("");
     },
     onError: (error) => {
       toast.error("Failed to toggle kill switch: " + error.message);
     },
   });
 
   const handleKillSwitchToggle = (checked: boolean) => {
     if (!isSuperAdmin) {
       toast.error("Only Super Admins can control the kill switch");
       return;
     }
     setPendingKillSwitchState(checked);
     setKillSwitchDialogOpen(true);
   };
 
   const confirmKillSwitch = () => {
     if (pendingKillSwitchState && !killSwitchReason.trim()) {
       toast.error("A reason is required to enable the kill switch");
       return;
     }
     toggleKillSwitchMutation.mutate({
       enabled: pendingKillSwitchState,
       reason: killSwitchReason,
     });
   };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
           <p className="text-muted-foreground">
             Platform-wide configuration and emergency controls
           </p>
         </div>
 
         {/* Kill Switch Active Warning */}
         {killSwitch?.enabled && (
           <Alert variant="destructive">
             <ShieldAlert className="h-4 w-4" />
             <AlertTitle>Kill Switch Active</AlertTitle>
             <AlertDescription>
               The platform is currently in read-only mode.
               {killSwitch.reason && (
                 <span className="block mt-1">Reason: {killSwitch.reason}</span>
               )}
               {killSwitch.enabled_at && (
                 <span className="block text-xs mt-1">
                   Enabled on {new Date(killSwitch.enabled_at).toLocaleString()}
                   {killSwitch.enabled_by && ` by ${killSwitch.enabled_by}`}
                 </span>
               )}
             </AlertDescription>
           </Alert>
         )}
 
         {/* Kill Switch Card */}
         <Card className={killSwitch?.enabled ? "border-destructive" : ""}>
           <CardHeader>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div
                   className={`p-2 rounded-lg ${
                     killSwitch?.enabled
                       ? "bg-destructive/10 text-destructive"
                       : "bg-muted"
                   }`}
                 >
                   <Power className="h-5 w-5" />
                 </div>
                 <div>
                   <CardTitle>Kill Switch</CardTitle>
                   <CardDescription>
                     Emergency read-only mode for the entire platform
                   </CardDescription>
                 </div>
               </div>
               <Badge variant={killSwitch?.enabled ? "destructive" : "secondary"}>
                 {killSwitch?.enabled ? "ACTIVE" : "Inactive"}
               </Badge>
             </div>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
               <div className="space-y-1">
                 <p className="font-medium">Enable Kill Switch</p>
                 <p className="text-sm text-muted-foreground">
                   When enabled, all write operations are blocked platform-wide
                 </p>
               </div>
               {isSuperAdmin ? (
                 <Switch
                   checked={killSwitch?.enabled || false}
                   onCheckedChange={handleKillSwitchToggle}
                   disabled={isLoading}
                 />
               ) : (
                 <div className="flex items-center gap-2 text-muted-foreground">
                   <Lock className="h-4 w-4" />
                   <span className="text-sm">Super Admin only</span>
                 </div>
               )}
             </div>
 
             {!isSuperAdmin && (
               <Alert>
                 <Lock className="h-4 w-4" />
                 <AlertDescription>
                   Only Super Admins can enable or disable the kill switch.
                 </AlertDescription>
               </Alert>
             )}
           </CardContent>
         </Card>
 
         {/* Admin Info Card */}
         <Card>
           <CardHeader>
             <CardTitle>Your Access</CardTitle>
             <CardDescription>
               Your BackOffice role and permissions
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <Label className="text-muted-foreground">Name</Label>
                 <p className="font-medium">{profile?.full_name || "N/A"}</p>
               </div>
               <div>
                 <Label className="text-muted-foreground">Role</Label>
                 <p className="font-medium capitalize">
                   {backofficeUser?.role?.replace("_", " ") || "N/A"}
                 </p>
               </div>
               <div>
                 <Label className="text-muted-foreground">Domain</Label>
                 <p className="font-medium">{backofficeUser?.email_domain || "N/A"}</p>
               </div>
               <div>
                 <Label className="text-muted-foreground">2FA Status</Label>
                 <p className="font-medium">
                   {backofficeUser?.totp_enabled ? (
                     <Badge variant="default">Enabled</Badge>
                   ) : (
                     <Badge variant="secondary">Disabled</Badge>
                   )}
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Kill Switch Confirmation Dialog */}
         <Dialog open={killSwitchDialogOpen} onOpenChange={setKillSwitchDialogOpen}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2">
                 <AlertTriangle className="h-5 w-5 text-amber-500" />
                 {pendingKillSwitchState ? "Enable Kill Switch" : "Disable Kill Switch"}
               </DialogTitle>
               <DialogDescription>
                 {pendingKillSwitchState
                   ? "This will put the entire platform into read-only mode. All write operations will be blocked."
                   : "This will restore normal platform operations."}
               </DialogDescription>
             </DialogHeader>
 
             {pendingKillSwitchState && (
               <div className="py-4">
                 <Label>Reason (required)</Label>
                 <Textarea
                   value={killSwitchReason}
                   onChange={(e) => setKillSwitchReason(e.target.value)}
                   placeholder="e.g., Emergency maintenance, security incident..."
                   className="mt-2"
                 />
               </div>
             )}
 
             <DialogFooter>
               <Button variant="outline" onClick={() => setKillSwitchDialogOpen(false)}>
                 Cancel
               </Button>
               <Button
                 variant={pendingKillSwitchState ? "destructive" : "default"}
                 onClick={confirmKillSwitch}
                 disabled={toggleKillSwitchMutation.isPending}
               >
                 {pendingKillSwitchState ? "Enable Kill Switch" : "Disable Kill Switch"}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </div>
     </BackofficeLayout>
   );
 }
