 import { useState } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Input } from "@ui/input";
 import { Label } from "@ui/label";
 import { Switch } from "@ui/switch";
 import { Badge } from "@ui/badge";
 import { Textarea } from "@ui/textarea";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from "@ui/dialog";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@ui/select";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@ui/table";
 import { toast } from "sonner";
 import { Flag, Plus, Pencil, Trash2, Clock } from "lucide-react";
 import { format } from "date-fns";
 import type { Database } from "@/lib/supabase";
 
 type FeatureFlag = Database["public"]["Tables"]["feature_flags"]["Row"];
 type FeatureFlagScope = Database["public"]["Enums"]["feature_flag_scope"];
 
 const SCOPE_LABELS: Record<FeatureFlagScope, string> = {
   platform: "Platform",
   app: "App",
   tenant: "Tenant",
   feature: "Feature",
 };
 
 const SCOPE_COLORS: Record<FeatureFlagScope, string> = {
   platform: "bg-red-100 text-red-700",
   app: "bg-blue-100 text-blue-700",
   tenant: "bg-purple-100 text-purple-700",
   feature: "bg-green-100 text-green-700",
 };
 
 interface FlagFormData {
   name: string;
   description: string;
   scope: FeatureFlagScope;
   is_enabled: boolean;
   reason: string;
   schedule_start: string;
   schedule_end: string;
 }
 
 const initialFormData: FlagFormData = {
   name: "",
   description: "",
   scope: "feature",
   is_enabled: false,
   reason: "",
   schedule_start: "",
   schedule_end: "",
 };
 
 export default function FeatureFlagsPage() {
   const queryClient = useQueryClient();
   const { backofficeUser } = useBackofficeAuth();
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
   const [formData, setFormData] = useState<FlagFormData>(initialFormData);
 
   const { data: flags, isLoading } = useQuery({
     queryKey: ["backoffice-feature-flags"],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("feature_flags")
         .select("*")
         .order("scope")
         .order("name");
       if (error) throw error;
       return data as FeatureFlag[];
     },
   });
 
   const createMutation = useMutation({
     mutationFn: async (data: FlagFormData) => {
       const { error } = await supabase.from("feature_flags").insert({
         name: data.name,
         description: data.description || null,
         scope: data.scope,
         is_enabled: data.is_enabled,
         reason: data.reason || null,
         schedule_start: data.schedule_start || null,
         schedule_end: data.schedule_end || null,
         created_by_id: backofficeUser?.user_id,
       });
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
       toast.success("Feature flag created");
       closeDialog();
     },
     onError: (error) => {
       toast.error("Failed to create flag: " + error.message);
     },
   });
 
   const updateMutation = useMutation({
     mutationFn: async ({ id, data }: { id: string; data: Partial<FlagFormData> }) => {
       const { error } = await supabase
         .from("feature_flags")
         .update({
           ...data,
           schedule_start: data.schedule_start || null,
           schedule_end: data.schedule_end || null,
         })
         .eq("id", id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
       toast.success("Feature flag updated");
       closeDialog();
     },
     onError: (error) => {
       toast.error("Failed to update flag: " + error.message);
     },
   });
 
   const deleteMutation = useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from("feature_flags").delete().eq("id", id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
       toast.success("Feature flag deleted");
     },
     onError: (error) => {
       toast.error("Failed to delete flag: " + error.message);
     },
   });
 
   const toggleMutation = useMutation({
     mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
       const { error } = await supabase
         .from("feature_flags")
         .update({ is_enabled: enabled })
         .eq("id", id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
     },
     onError: (error) => {
       toast.error("Failed to toggle flag: " + error.message);
     },
   });
 
   const closeDialog = () => {
     setIsDialogOpen(false);
     setEditingFlag(null);
     setFormData(initialFormData);
   };
 
   const openEditDialog = (flag: FeatureFlag) => {
     setEditingFlag(flag);
     setFormData({
       name: flag.name,
       description: flag.description || "",
       scope: flag.scope,
       is_enabled: flag.is_enabled,
       reason: flag.reason || "",
       schedule_start: flag.schedule_start ? flag.schedule_start.slice(0, 16) : "",
       schedule_end: flag.schedule_end ? flag.schedule_end.slice(0, 16) : "",
     });
     setIsDialogOpen(true);
   };
 
   const handleSubmit = () => {
     if (!formData.name.trim()) {
       toast.error("Name is required");
       return;
     }
     if (editingFlag) {
       updateMutation.mutate({ id: editingFlag.id, data: formData });
     } else {
       createMutation.mutate(formData);
     }
   };
 
   const isScheduled = (flag: FeatureFlag) => {
     return flag.schedule_start || flag.schedule_end;
   };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div className="flex items-center justify-between">
           <div>
             <h1 className="text-2xl font-bold tracking-tight">Feature Flags</h1>
             <p className="text-muted-foreground">
               Toggle features, schedule rollouts, and target tenants
             </p>
           </div>
           <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <DialogTrigger asChild>
               <Button onClick={() => setFormData(initialFormData)}>
                 <Plus className="mr-2 h-4 w-4" />
                 Add Flag
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[500px]">
               <DialogHeader>
                 <DialogTitle>{editingFlag ? "Edit Flag" : "Create Flag"}</DialogTitle>
                 <DialogDescription>
                   {editingFlag
                     ? "Update the feature flag configuration"
                     : "Create a new feature flag for the platform"}
                 </DialogDescription>
               </DialogHeader>
               <div className="grid gap-4 py-4">
                 <div className="grid gap-2">
                   <Label htmlFor="name">Name</Label>
                   <Input
                     id="name"
                     value={formData.name}
                     onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                     placeholder="waitlist_enabled"
                   />
                 </div>
                 <div className="grid gap-2">
                   <Label htmlFor="description">Description</Label>
                   <Textarea
                     id="description"
                     value={formData.description}
                     onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                     placeholder="What does this flag control?"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="grid gap-2">
                     <Label htmlFor="scope">Scope</Label>
                     <Select
                       value={formData.scope}
                       onValueChange={(v) => setFormData({ ...formData, scope: v as FeatureFlagScope })}
                     >
                       <SelectTrigger>
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                           <SelectItem key={value} value={value}>
                             {label}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="flex items-center gap-3 pt-6">
                     <Switch
                       checked={formData.is_enabled}
                       onCheckedChange={(checked) =>
                         setFormData({ ...formData, is_enabled: checked })
                       }
                     />
                     <Label>Enabled</Label>
                   </div>
                 </div>
                 <div className="grid gap-2">
                   <Label htmlFor="reason">Reason for change</Label>
                   <Input
                     id="reason"
                     value={formData.reason}
                     onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                     placeholder="Why is this flag being toggled?"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="grid gap-2">
                     <Label htmlFor="schedule_start">Schedule Start</Label>
                     <Input
                       id="schedule_start"
                       type="datetime-local"
                       value={formData.schedule_start}
                       onChange={(e) =>
                         setFormData({ ...formData, schedule_start: e.target.value })
                       }
                     />
                   </div>
                   <div className="grid gap-2">
                     <Label htmlFor="schedule_end">Schedule End</Label>
                     <Input
                       id="schedule_end"
                       type="datetime-local"
                       value={formData.schedule_end}
                       onChange={(e) =>
                         setFormData({ ...formData, schedule_end: e.target.value })
                       }
                     />
                   </div>
                 </div>
               </div>
               <DialogFooter>
                 <Button variant="outline" onClick={closeDialog}>
                   Cancel
                 </Button>
                 <Button
                   onClick={handleSubmit}
                   disabled={createMutation.isPending || updateMutation.isPending}
                 >
                   {editingFlag ? "Update" : "Create"}
                 </Button>
               </DialogFooter>
             </DialogContent>
           </Dialog>
         </div>
 
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Flag className="h-5 w-5" />
               All Flags
             </CardTitle>
             <CardDescription>
               {flags?.length || 0} feature flags configured
             </CardDescription>
           </CardHeader>
           <CardContent>
             {isLoading ? (
               <div className="text-center py-8 text-muted-foreground">Loading...</div>
             ) : flags?.length === 0 ? (
               <div className="text-center py-8 text-muted-foreground">
                 No feature flags yet. Create one to get started.
               </div>
             ) : (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Flag</TableHead>
                     <TableHead>Scope</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Schedule</TableHead>
                     <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {flags?.map((flag) => (
                     <TableRow key={flag.id}>
                       <TableCell>
                         <div>
                           <p className="font-medium font-mono text-sm">{flag.name}</p>
                           {flag.description && (
                             <p className="text-sm text-muted-foreground line-clamp-1">
                               {flag.description}
                             </p>
                           )}
                         </div>
                       </TableCell>
                       <TableCell>
                         <Badge variant="secondary" className={SCOPE_COLORS[flag.scope]}>
                           {SCOPE_LABELS[flag.scope]}
                         </Badge>
                       </TableCell>
                       <TableCell>
                         <Switch
                           checked={flag.is_enabled}
                           onCheckedChange={(checked) =>
                             toggleMutation.mutate({ id: flag.id, enabled: checked })
                           }
                         />
                       </TableCell>
                       <TableCell>
                         {isScheduled(flag) ? (
                           <div className="flex items-center gap-1 text-sm text-muted-foreground">
                             <Clock className="h-3 w-3" />
                             {flag.schedule_start && (
                               <span>
                                 {format(new Date(flag.schedule_start), "MMM d, HH:mm")}
                               </span>
                             )}
                             {flag.schedule_start && flag.schedule_end && <span>-</span>}
                             {flag.schedule_end && (
                               <span>
                                 {format(new Date(flag.schedule_end), "MMM d, HH:mm")}
                               </span>
                             )}
                           </div>
                         ) : (
                           <span className="text-sm text-muted-foreground">-</span>
                         )}
                       </TableCell>
                       <TableCell className="text-right">
                         <div className="flex justify-end gap-1">
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => openEditDialog(flag)}
                           >
                             <Pencil className="h-4 w-4" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="text-destructive hover:text-destructive"
                             onClick={() => {
                               if (confirm(`Delete flag "${flag.name}"?`)) {
                                 deleteMutation.mutate(flag.id);
                               }
                             }}
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
                         </div>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             )}
           </CardContent>
         </Card>
       </div>
     </BackofficeLayout>
   );
 }
