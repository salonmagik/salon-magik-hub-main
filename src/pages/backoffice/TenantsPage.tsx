 import { useState } from "react";
 import { BackofficeLayout } from "@/components/backoffice/BackofficeLayout";
 import { useTenants, TenantWithStats } from "@/hooks/backoffice";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 import { Loader2, MoreHorizontal, Search, Eye, Building2, Users } from "lucide-react";
 import { format } from "date-fns";
 
 export default function TenantsPage() {
   const { data: tenants, isLoading } = useTenants();
   const [searchQuery, setSearchQuery] = useState("");
 
   const filteredTenants = tenants?.filter((t) =>
     t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   const getStatusBadge = (status: string) => {
     switch (status) {
       case "active":
         return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
       case "trialing":
         return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Trial</Badge>;
       case "past_due":
         return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Past Due</Badge>;
       case "canceled":
         return <Badge className="bg-red-100 text-red-700 border-red-200">Canceled</Badge>;
       case "inactive":
         return <Badge variant="secondary">Inactive</Badge>;
       default:
         return <Badge variant="secondary">{status}</Badge>;
     }
   };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
           <p className="text-muted-foreground">
             View and manage all salons on the platform
           </p>
         </div>
 
         <Card>
           <CardHeader>
             <div className="flex items-center justify-between">
               <div>
                 <CardTitle className="flex items-center gap-2">
                   <Building2 className="h-5 w-5" />
                   All Tenants
                 </CardTitle>
                 <CardDescription>
                   {filteredTenants?.length || 0} salons
                 </CardDescription>
               </div>
               <div className="relative w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input
                   placeholder="Search by name or owner..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-9"
                 />
               </div>
             </div>
           </CardHeader>
           <CardContent>
             {isLoading ? (
               <div className="flex justify-center py-12">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
               </div>
             ) : filteredTenants?.length === 0 ? (
               <div className="text-center py-12 text-muted-foreground">
                 No tenants found.
               </div>
             ) : (
               <div className="rounded-md border">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Salon Name</TableHead>
                       <TableHead>Owner</TableHead>
                       <TableHead>Country</TableHead>
                       <TableHead>Plan</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Staff</TableHead>
                       <TableHead>Created</TableHead>
                       <TableHead className="w-[50px]"></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {filteredTenants?.map((tenant) => (
                       <TableRow key={tenant.id}>
                         <TableCell className="font-medium">
                           <div className="flex items-center gap-2">
                             {tenant.logo_url ? (
                               <img 
                                 src={tenant.logo_url} 
                                 alt="" 
                                 className="h-8 w-8 rounded object-cover"
                               />
                             ) : (
                               <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                 <Building2 className="h-4 w-4 text-muted-foreground" />
                               </div>
                             )}
                             <div>
                               <div>{tenant.name}</div>
                               {tenant.slug && (
                                 <div className="text-xs text-muted-foreground">
                                   /{tenant.slug}
                                 </div>
                               )}
                             </div>
                           </div>
                         </TableCell>
                         <TableCell>{tenant.owner_email || "-"}</TableCell>
                         <TableCell>{tenant.country}</TableCell>
                         <TableCell>
                           <Badge variant="outline">
                             {tenant.plan || "No Plan"}
                           </Badge>
                         </TableCell>
                         <TableCell>{getStatusBadge(tenant.subscription_status)}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-1">
                             <Users className="h-3 w-3 text-muted-foreground" />
                             {tenant.staff_count}
                           </div>
                         </TableCell>
                         <TableCell className="text-muted-foreground text-sm">
                           {format(new Date(tenant.created_at), "MMM d, yyyy")}
                         </TableCell>
                         <TableCell>
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem disabled>
                                 <Eye className="mr-2 h-4 w-4" />
                                 View Details
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             )}
           </CardContent>
         </Card>
       </div>
     </BackofficeLayout>
   );
 }