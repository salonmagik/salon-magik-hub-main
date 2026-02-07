import { useState, useMemo, useRef, useEffect } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Scissors,
  Package,
  ShoppingBag,
  Gift,
  Plus,
  Search,
  Clock,
  Truck,
  MoreVertical,
  Eye,
  Edit,
  Flag,
  Archive,
  Trash2,
  Undo2,
} from "lucide-react";
import { AddServiceDialog } from "@/components/dialogs/AddServiceDialog";
import { AddPackageDialog } from "@/components/dialogs/AddPackageDialog";
import { AddProductDialog } from "@/components/dialogs/AddProductDialog";
import { AddVoucherDialog } from "@/components/dialogs/AddVoucherDialog";
import { EditServiceDialog } from "@/components/dialogs/EditServiceDialog";
import { EditProductDialog } from "@/components/dialogs/EditProductDialog";
import { EditPackageDialog } from "@/components/dialogs/EditPackageDialog";
import { EditVoucherDialog } from "@/components/dialogs/EditVoucherDialog";
import { ServiceDetailDialog } from "@/components/dialogs/ServiceDetailDialog";
import { ProductDetailDialog } from "@/components/dialogs/ProductDetailDialog";
import { PackageDetailDialog } from "@/components/dialogs/PackageDetailDialog";
import { VoucherDetailDialog } from "@/components/dialogs/VoucherDetailDialog";
import { ProductFulfillmentTab } from "@/components/catalog/ProductFulfillmentTab";
import { AddItemPopover } from "@/components/catalog/AddItemPopover";
import { BulkActionsBar } from "@/components/catalog/BulkActionsBar";
import { ReasonConfirmDialog } from "@/components/dialogs/ReasonConfirmDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { RequestDeleteDialog } from "@/components/dialogs/RequestDeleteDialog";
import { useServices } from "@/hooks/useServices";
import { usePackages } from "@/hooks/usePackages";
import { useProducts } from "@/hooks/useProducts";
import { useVouchers } from "@/hooks/useVouchers";
import { useDeletionRequests } from "@/hooks/useDeletionRequests";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TabValue = "all" | "services" | "products" | "packages" | "vouchers";
type ProductSubTab = "inventory" | "fulfillment";
type ItemType = "service" | "product" | "package" | "voucher";

interface CatalogItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  price: number;
  duration?: number;
  originalPrice?: number;
  stock?: number;
  images?: string[];
  status?: string;
  is_flagged?: boolean;
}

export default function ServicesPage() {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [productSubTab, setProductSubTab] = useState<ProductSubTab>("inventory");
  
  // Multi-select state - supports mixed selection in "All" tab
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<ItemType>>(new Set());
  
  // Dialog states
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestDeleteDialogOpen, setRequestDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // View/Edit dialog states
  const [viewDetailItem, setViewDetailItem] = useState<CatalogItem | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  
  // Pending deletion with undo
  const [pendingDeletions, setPendingDeletions] = useState<Map<string, { timer: NodeJS.Timeout; countdown: number; reason: string }>>(new Map());
  const undoRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const { currentTenant, user } = useAuth();
  const { isOwner, currentRole, hasPermission } = usePermissions();
  const { services, isLoading: servicesLoading, refetch: refetchServices } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackages();
  const { products, isLoading: productsLoading, refetch: refetchProducts } = useProducts();
  const { vouchers, isLoading: vouchersLoading, refetch: refetchVouchers } = useVouchers();
  const { createRequest } = useDeletionRequests();

  const currency = currentTenant?.currency || "USD";
  const isLoading = servicesLoading || packagesLoading || productsLoading;
  
  // Permission checks
  const canEdit = hasPermission("catalog:edit");
  const canDelete = hasPermission("catalog:delete");
  const canRequestDelete = hasPermission("catalog:request_delete");
  const canArchive = hasPermission("catalog:archive");
  const canFlag = hasPermission("catalog:flag");

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      GHS: "₵",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  // Build unified items list with status
  const allItems = useMemo(() => [
    ...services.map((s) => ({
      id: s.id,
      type: "service" as const,
      name: s.name,
      description: s.description || "",
      price: Number(s.price),
      duration: s.duration_minutes,
      images: s.image_urls || [],
      status: s.status,
      is_flagged: s.is_flagged,
    })),
    ...packages.map((p) => ({
      id: p.id,
      type: "package" as const,
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      originalPrice: p.original_price ? Number(p.original_price) : undefined,
      images: p.image_urls || [],
      status: p.status,
      is_flagged: (p as any).is_flagged || false,
    })),
    ...products.map((p) => ({
      id: p.id,
      type: "product" as const,
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      stock: p.stock_quantity,
      images: p.image_urls || [],
      status: p.status,
      is_flagged: (p as any).is_flagged,
    })),
  ], [services, packages, products]);

  const filteredItems = allItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Get item info by id
  const getItemInfo = (id: string): { name: string; type: ItemType } | null => {
    const service = services.find((s) => s.id === id);
    if (service) return { name: service.name, type: "service" };
    const pkg = packages.find((p) => p.id === id);
    if (pkg) return { name: pkg.name, type: "package" };
    const product = products.find((p) => p.id === id);
    if (product) return { name: product.name, type: "product" };
    const voucher = vouchers.find((v) => v.id === id);
    if (voucher) return { name: voucher.code, type: "voucher" };
    return null;
  };

  // Handle selection - allows mixed service+product in All tab
  const handleSelectItem = (id: string, type: ItemType) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      
      if (newSet.has(id)) {
        newSet.delete(id);
        // Recalculate selected types
        const remainingTypes = new Set<ItemType>();
        newSet.forEach((itemId) => {
          const info = getItemInfo(itemId);
          if (info) remainingTypes.add(info.type);
        });
        setSelectedTypes(remainingTypes);
      } else {
        // In "All" tab, allow mixed service+product selection
        if (activeTab === "all") {
          if (type === "package" || type === "voucher") {
            // Selecting package/voucher clears service/product selection
            if (selectedTypes.has("service") || selectedTypes.has("product")) {
              newSet.clear();
            }
          } else if (selectedTypes.has("package") || selectedTypes.has("voucher")) {
            // Selecting service/product clears package/voucher selection
            newSet.clear();
          }
        } else {
          // In specific tabs, only same-type selection
          if (selectedTypes.size > 0 && !selectedTypes.has(type)) {
            newSet.clear();
          }
        }
        newSet.add(id);
        setSelectedTypes((prev) => new Set([...prev, type]));
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectedTypes(new Set());
  };

  // Clear selection on tab change
  const handleTabChange = (tab: TabValue) => {
    setActiveTab(tab);
    clearSelection();
  };

  // Determine bulk action availability
  const canCreatePackage = 
    (selectedTypes.has("service") || selectedTypes.has("product")) &&
    !selectedTypes.has("package") && 
    !selectedTypes.has("voucher");

  const showCreatePackage = activeTab === "all" || activeTab === "services" || activeTab === "products";
  const showDeleteOption = (canDelete || canRequestDelete) && activeTab !== "packages" && activeTab !== "vouchers";

  // Refetch all data
  const refetchAll = () => {
    refetchServices();
    refetchPackages();
    refetchProducts();
    refetchVouchers();
  };

  // Get selected items info for dialogs
  const selectedItemsInfo = useMemo(() => {
    return Array.from(selectedItems).map((id) => {
      const info = getItemInfo(id);
      return info ? { id, name: info.name, type: info.type } : null;
    }).filter(Boolean) as Array<{ id: string; name: string; type: ItemType }>;
  }, [selectedItems, services, packages, products, vouchers]);

  // Get selected items with prices for package creation
  const preSelectedPackageItems = useMemo(() => {
    return Array.from(selectedItems).map((id) => {
      const service = services.find((s) => s.id === id);
      if (service) {
        return { id, type: "service" as const, name: service.name, price: Number(service.price) };
      }
      const product = products.find((p) => p.id === id);
      if (product) {
        return { id, type: "product" as const, name: product.name, price: Number(product.price) };
      }
      return null;
    }).filter(Boolean) as Array<{ id: string; type: "service" | "product"; name: string; price: number }>;
  }, [selectedItems, services, products]);

  // Handle Flag
  const handleFlag = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        const updateData = { is_flagged: true, flag_reason: reason };
        switch (item.type) {
          case "service":
            await supabase.from("services").update(updateData).eq("id", item.id);
            break;
          case "product":
            await supabase.from("products").update(updateData).eq("id", item.id);
            break;
          case "package":
            await supabase.from("packages").update(updateData).eq("id", item.id);
            break;
        }
      }
      toast({ title: "Items Flagged", description: `${selectedItems.size} item(s) flagged for review` });
      clearSelection();
      refetchAll();
    } catch (err) {
      console.error("Error flagging items:", err);
      toast({ title: "Error", description: "Failed to flag items", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setFlagDialogOpen(false);
    }
  };

  // Handle Archive
  const handleArchive = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        const updateData = { status: "archived" as const, archive_reason: reason };
        switch (item.type) {
          case "service":
            await supabase.from("services").update(updateData).eq("id", item.id);
            break;
          case "product":
            await supabase.from("products").update(updateData).eq("id", item.id);
            break;
          case "package":
            await supabase.from("packages").update(updateData).eq("id", item.id);
            break;
        }
      }
      toast({ title: "Items Archived", description: `${selectedItems.size} item(s) archived` });
      clearSelection();
      refetchAll();
    } catch (err) {
      console.error("Error archiving items:", err);
      toast({ title: "Error", description: "Failed to archive items", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setArchiveDialogOpen(false);
    }
  };

  // Handle Delete (Owner only - soft delete with 5-sec undo)
  const handleDelete = () => {
    if (!user?.id) return;
    
    const itemsToDelete = Array.from(selectedItemsInfo);
    const itemIds = itemsToDelete.map((i) => i.id);
    
    // Close dialog and clear selection
    setDeleteDialogOpen(false);
    clearSelection();
    
    // Start countdown for batch
    let countdown = 5;
    const batchId = Date.now().toString();
    
    const showUndoToast = () => {
      toast({
        title: `Deleting ${itemsToDelete.length} item(s)...`,
        description: `Click Undo to cancel (${countdown}s)`,
        duration: 1500,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUndo(batchId, itemIds)}
          >
            <Undo2 className="w-4 h-4 mr-1" />
            Undo
          </Button>
        ),
      });
    };
    
    showUndoToast();
    
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        undoRef.current.delete(batchId);
        executeSoftDelete(itemsToDelete);
      } else {
        showUndoToast();
      }
    }, 1000);
    
    undoRef.current.set(batchId, interval);
  };

  const handleUndo = (batchId: string, itemIds: string[]) => {
    const interval = undoRef.current.get(batchId);
    if (interval) {
      clearInterval(interval);
      undoRef.current.delete(batchId);
      toast({ title: "Deletion Cancelled", description: "Items were not deleted" });
    }
  };

  const executeSoftDelete = async (items: Array<{ id: string; name: string; type: ItemType }>) => {
    try {
      for (const item of items) {
        const updateData = {
          deleted_at: new Date().toISOString(),
          deleted_by_id: user?.id,
          deletion_reason: "Direct deletion by owner",
        };
        
        switch (item.type) {
          case "service":
            await supabase.from("services").update(updateData).eq("id", item.id);
            break;
          case "product":
            await supabase.from("products").update(updateData).eq("id", item.id);
            break;
          case "package":
            await supabase.from("packages").update(updateData).eq("id", item.id);
            break;
          case "voucher":
            await supabase.from("vouchers").update(updateData).eq("id", item.id);
            break;
        }
      }
      
      toast({ 
        title: "Sent to Bin", 
        description: `${items.length} item(s) moved to bin. Can be restored within 7 days.` 
      });
      refetchAll();
    } catch (err) {
      console.error("Error deleting items:", err);
      toast({ title: "Error", description: "Failed to delete items", variant: "destructive" });
    }
  };

  // Handle deletion request (non-owners)
  const handleRequestDelete = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        await createRequest(item.id, item.type, item.name, reason);
      }
      clearSelection();
    } catch (err) {
      console.error("Error creating deletion requests:", err);
    } finally {
      setIsProcessing(false);
      setRequestDeleteDialogOpen(false);
    }
  };

  // Handle bulk action button clicks
  const handleBulkDelete = () => {
    if (canDelete) {
      setDeleteDialogOpen(true);
    } else if (canRequestDelete) {
      setRequestDeleteDialogOpen(true);
    }
  };

  const handleAddFromPopover = (type: ItemType) => {
    switch (type) {
      case "service":
        setServiceDialogOpen(true);
        break;
      case "product":
        setProductDialogOpen(true);
        break;
      case "package":
        setPackageDialogOpen(true);
        break;
      case "voucher":
        setVoucherDialogOpen(true);
        break;
    }
  };

  const handleAddClick = () => {
    switch (activeTab) {
      case "services":
        setServiceDialogOpen(true);
        break;
      case "packages":
        setPackageDialogOpen(true);
        break;
      case "products":
        setProductDialogOpen(true);
        break;
      case "vouchers":
        setVoucherDialogOpen(true);
        break;
    }
  };

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case "services":
        return "Add Service";
      case "packages":
        return "Add Package";
      case "products":
        return "Add Product";
      case "vouchers":
        return "Add Voucher";
      default:
        return null;
    }
  };

  const addButtonLabel = getAddButtonLabel();

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      undoRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Services and Products</h1>
            <p className="text-muted-foreground">
              Manage your service catalog, packages, products, and vouchers.
            </p>
          </div>
          {activeTab === "all" ? (
            <AddItemPopover onSelect={handleAddFromPopover} />
          ) : addButtonLabel && (
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              {addButtonLabel}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabValue)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Services
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="vouchers" className="flex items-center gap-2">
              <Gift className="w-4 h-4" />
              Vouchers
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Search */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services, products, packages..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-16 mb-2" />
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-48" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {/* All Tab */}
                <TabsContent value="all" className="mt-0">
                  {filteredItems.length === 0 ? (
                    <EmptyState message="No items yet. Add services, products, or packages to get started." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredItems.map((item) => (
                        <SelectableItemCard 
                          key={item.id} 
                          item={item} 
                          currency={currency} 
                          formatCurrency={formatCurrency}
                          isSelected={selectedItems.has(item.id)}
                          onSelect={handleSelectItem}
                          canEdit={canEdit}
                          onViewDetails={() => setViewDetailItem(item)}
                          onEdit={() => setEditItem(item)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Services Tab */}
                <TabsContent value="services" className="mt-0">
                  {services.length === 0 ? (
                    <EmptyState message="No services yet. Add your first service." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {services
                        .filter(
                          (s) =>
                            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((s) => (
                          <SelectableItemCard
                            key={s.id}
                            item={{
                              id: s.id,
                              type: "service",
                              name: s.name,
                              description: s.description || "",
                              price: Number(s.price),
                              duration: s.duration_minutes,
                              images: s.image_urls || [],
                              status: s.status,
                              is_flagged: s.is_flagged,
                            }}
                            currency={currency}
                            formatCurrency={formatCurrency}
                            isSelected={selectedItems.has(s.id)}
                            onSelect={handleSelectItem}
                            canEdit={canEdit}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Packages Tab */}
                <TabsContent value="packages" className="mt-0">
                  {packages.length === 0 ? (
                    <EmptyState message="No packages yet. Bundle services together." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {packages
                        .filter(
                          (p) =>
                            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((p) => (
                          <SelectableItemCard
                            key={p.id}
                            item={{
                              id: p.id,
                              type: "package",
                              name: p.name,
                              description: p.description || "",
                              price: Number(p.price),
                              originalPrice: p.original_price ? Number(p.original_price) : undefined,
                              images: p.image_urls || [],
                              status: p.status,
                              is_flagged: (p as any).is_flagged || false,
                            }}
                            currency={currency}
                            formatCurrency={formatCurrency}
                            isSelected={selectedItems.has(p.id)}
                            onSelect={handleSelectItem}
                            canEdit={canEdit}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Products Tab - with Sub-tabs */}
                <TabsContent value="products" className="mt-0">
                  <Tabs value={productSubTab} onValueChange={(v) => setProductSubTab(v as ProductSubTab)}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="inventory" className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4" />
                        Inventory
                      </TabsTrigger>
                      <TabsTrigger value="fulfillment" className="flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Fulfillment
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="inventory" className="mt-0">
                      {products.length === 0 ? (
                        <EmptyState message="No products yet. Add items to sell." />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {products
                            .filter(
                              (p) =>
                                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                            )
                            .map((p) => (
                              <SelectableItemCard
                                key={p.id}
                                item={{
                                  id: p.id,
                                  type: "product",
                                  name: p.name,
                                  description: p.description || "",
                                  price: Number(p.price),
                                  stock: p.stock_quantity,
                                  images: p.image_urls || [],
                                  status: p.status,
                                  is_flagged: (p as any).is_flagged,
                                }}
                                currency={currency}
                                formatCurrency={formatCurrency}
                                isSelected={selectedItems.has(p.id)}
                                onSelect={handleSelectItem}
                                canEdit={canEdit}
                              />
                            ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="fulfillment" className="mt-0">
                      <ProductFulfillmentTab />
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                {/* Vouchers Tab */}
                <TabsContent value="vouchers" className="mt-0">
                  {vouchersLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map((i) => (
                        <Card key={i}>
                          <CardContent className="p-4">
                            <Skeleton className="h-5 w-24 mb-2" />
                            <Skeleton className="h-4 w-16" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : vouchers.length === 0 ? (
                    <EmptyState message="No vouchers yet. Create gift cards for customers." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {vouchers.map((v) => (
                        <Card key={v.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-purple-600">
                                  GIFT CARD
                                </p>
                                <h3 className="font-mono font-semibold mt-1 text-lg">{v.code}</h3>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge
                                    variant="secondary"
                                    className={
                                      v.status === "active"
                                        ? "bg-success/10 text-success"
                                        : v.status === "redeemed"
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-destructive/10 text-destructive"
                                    }
                                  >
                                    {v.status}
                                  </Badge>
                                  {v.expires_at && (
                                    <span className="text-xs text-muted-foreground">
                                      Expires {format(new Date(v.expires_at), "MMM d, yyyy")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-lg">{formatCurrency(Number(v.amount))}</p>
                                <p className="text-sm text-muted-foreground">
                                  Balance: {formatCurrency(Number(v.balance))}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedItems.size}
        itemType={selectedTypes.size === 1 ? Array.from(selectedTypes)[0] : "service"}
        onCreatePackage={showCreatePackage && canCreatePackage ? () => setPackageDialogOpen(true) : undefined}
        onFlag={canFlag ? () => setFlagDialogOpen(true) : undefined}
        onArchive={canArchive && activeTab !== "vouchers" ? () => setArchiveDialogOpen(true) : undefined}
        onDelete={(canDelete || canRequestDelete) && showDeleteOption ? handleBulkDelete : undefined}
        onDiscontinue={activeTab === "vouchers" && canArchive ? () => setArchiveDialogOpen(true) : undefined}
        onClear={clearSelection}
        canDelete={canDelete || canRequestDelete}
        canArchive={canArchive}
      />

      {/* Confirmation Dialogs */}
      <ReasonConfirmDialog
        open={flagDialogOpen}
        onOpenChange={setFlagDialogOpen}
        title={`Flag ${selectedItems.size} Item${selectedItems.size !== 1 ? "s" : ""}?`}
        description="Flagged items are marked for internal review but remain visible on the booking platform."
        actionLabel="Flag Items"
        reasonLabel="Reason for flagging"
        reasonPlaceholder="e.g., Pricing needs review, Quality issue..."
        onConfirm={handleFlag}
        isLoading={isProcessing}
        itemsList={selectedItemsInfo.map((i) => i.name)}
      />

      <ReasonConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title={`Archive ${selectedItems.size} Item${selectedItems.size !== 1 ? "s" : ""}?`}
        description="Archived items are hidden from customers and cannot be booked."
        actionLabel="Archive Items"
        reasonLabel="Reason for archiving"
        reasonPlaceholder="e.g., Seasonal item, Low demand, Discontinued..."
        onConfirm={handleArchive}
        isLoading={isProcessing}
        itemsList={selectedItemsInfo.map((i) => i.name)}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={selectedItemsInfo[0]?.name || ""}
        itemCount={selectedItems.size}
        onConfirm={handleDelete}
        isLoading={isProcessing}
      />

      <RequestDeleteDialog
        open={requestDeleteDialogOpen}
        onOpenChange={setRequestDeleteDialogOpen}
        items={selectedItemsInfo}
        onSubmit={handleRequestDelete}
        isLoading={isProcessing}
      />

      {/* Dialogs */}
      <AddServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        onSuccess={refetchServices}
      />
      <AddPackageDialog
        open={packageDialogOpen}
        onOpenChange={(isOpen) => {
          setPackageDialogOpen(isOpen);
          if (!isOpen) clearSelection();
        }}
        onSuccess={refetchPackages}
        preSelectedItems={preSelectedPackageItems}
      />
      <AddProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        onSuccess={refetchProducts}
      />
      <AddVoucherDialog
        open={voucherDialogOpen}
        onOpenChange={setVoucherDialogOpen}
        onSuccess={refetchVouchers}
      />

      {/* View/Edit Dialogs */}
      <EditServiceDialog
        open={!!editItem && editItem.type === "service"}
        onOpenChange={(open) => !open && setEditItem(null)}
        service={editItem?.type === "service" ? services.find(s => s.id === editItem.id) || null : null}
        onSuccess={refetchServices}
      />
      <EditProductDialog
        open={!!editItem && editItem.type === "product"}
        onOpenChange={(open) => !open && setEditItem(null)}
        product={editItem?.type === "product" ? products.find(p => p.id === editItem.id) || null : null}
        onSuccess={refetchProducts}
      />
      <EditPackageDialog
        open={!!editItem && editItem.type === "package"}
        onOpenChange={(open) => !open && setEditItem(null)}
        pkg={editItem?.type === "package" ? packages.find(p => p.id === editItem.id) || null : null}
        onSuccess={refetchPackages}
      />

      <ServiceDetailDialog
        open={!!viewDetailItem && viewDetailItem.type === "service"}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        service={viewDetailItem?.type === "service" ? services.find(s => s.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onArchive={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
      <ProductDetailDialog
        open={!!viewDetailItem && viewDetailItem.type === "product"}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        product={viewDetailItem?.type === "product" ? products.find(p => p.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onArchive={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
      <PackageDetailDialog
        open={!!viewDetailItem && viewDetailItem.type === "package"}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        pkg={viewDetailItem?.type === "package" ? packages.find(p => p.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onArchive={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
    </SalonSidebar>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

// Status chip component
function StatusChip({ status, isFlagged }: { status?: string; isFlagged?: boolean }) {
  if (isFlagged) {
    return (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
        <Flag className="w-3 h-3 mr-1" />
        Flagged
      </Badge>
    );
  }
  
  if (status === "archived") {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
        <Archive className="w-3 h-3 mr-1" />
        Archived
      </Badge>
    );
  }
  
  return null;
}

interface SelectableItemCardProps {
  item: CatalogItem;
  currency: string;
  formatCurrency: (amount: number) => string;
  isSelected?: boolean;
  onSelect?: (id: string, type: ItemType) => void;
  canEdit?: boolean;
  onViewDetails?: () => void;
  onEdit?: () => void;
}

function SelectableItemCard({
  item,
  currency,
  formatCurrency,
  isSelected = false,
  onSelect,
  canEdit = false,
  onViewDetails,
  onEdit,
}: SelectableItemCardProps) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    service: { label: "SERVICE", color: "text-primary" },
    package: { label: "PACKAGE", color: "text-primary/80" },
    product: { label: "PRODUCT", color: "text-primary/60" },
  };

  const typeInfo = typeLabels[item.type] || typeLabels.service;

  return (
    <Card className={cn(
      "hover:shadow-md transition-all",
      isSelected && "ring-2 ring-primary"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Checkbox */}
          {onSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(item.id, item.type)}
              className="mt-1"
            />
          )}

          {/* Image thumbnail */}
          {item.images && item.images.length > 0 ? (
            <img
              src={item.images[0]}
              alt={item.name}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              {item.type === "service" && <Scissors className="w-6 h-6 text-muted-foreground" />}
              {item.type === "package" && <Package className="w-6 h-6 text-muted-foreground" />}
              {item.type === "product" && <ShoppingBag className="w-6 h-6 text-muted-foreground" />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-xs font-medium uppercase tracking-wider ${typeInfo.color}`}>
                {typeInfo.label}
              </p>
              <StatusChip status={item.status} isFlagged={item.is_flagged} />
            </div>
            <h3 className="font-semibold mt-1 truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {item.description || "No description"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {item.duration && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {item.duration} mins
                </Badge>
              )}
              {item.stock !== undefined && (
                <Badge variant="outline" className="text-xs">
                  {item.stock} in stock
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-lg">{formatCurrency(item.price)}</p>
              {item.originalPrice && (
                <p className="text-sm text-muted-foreground line-through">
                  {formatCurrency(item.originalPrice)}
                </p>
              )}
            </div>

            {/* Three-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onViewDetails}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
