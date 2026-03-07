import { useState, useMemo, useRef, useEffect } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { Checkbox } from "@ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  Scissors,
  Package,
  ShoppingBag,
  Gift,
  Plus,
  Download,
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
  Loader2,
  AlertTriangle,
  Wrench,
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
import { ImportDialog, type TemplateColumn } from "@/components/dialogs/ImportDialog";
import { useServices } from "@/hooks/useServices";
import { usePackages } from "@/hooks/usePackages";
import { useProducts } from "@/hooks/useProducts";
import { useVouchers } from "@/hooks/useVouchers";
import { useBinItems } from "@/hooks/useBinItems";
import { useDeletionRequests } from "@/hooks/useDeletionRequests";
import {
  useCatalogIntegrityIssues,
  type CatalogIntegrityIssue,
  type CatalogIntegrityItemType,
} from "@/hooks/useCatalogIntegrityIssues";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import * as XLSX from "xlsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";

type TabValue = "all" | "services" | "products" | "packages" | "vouchers";
type ProductSubTab = "inventory" | "fulfillment";
type ItemType = "service" | "product" | "package" | "voucher";
type CatalogImportType = "services" | "products";

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

interface IntegrityFixTarget {
  itemId: string;
  itemType: CatalogIntegrityItemType;
  itemName: string;
  issueCodes: string[];
  locationIds: string[];
}

export default function ServicesPage() {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importType, setImportType] = useState<CatalogImportType>("services");
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
  const [isImporting, setIsImporting] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [binProcessingItemId, setBinProcessingItemId] = useState<string | null>(null);
  const [binSelectMode, setBinSelectMode] = useState(false);
  const [selectedBinItemKeys, setSelectedBinItemKeys] = useState<Set<string>>(new Set());
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [fixTarget, setFixTarget] = useState<IntegrityFixTarget | null>(null);
  const [fixLocationIds, setFixLocationIds] = useState<string[]>([]);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  
  // View/Edit dialog states
  const [viewDetailItem, setViewDetailItem] = useState<CatalogItem | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  
  // Pending deletion with undo
  const undoRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const undoToastRef = useRef<Map<string, { dismiss: () => void; update: (props: any) => void }>>(new Map());

  const { currentTenant, user } = useAuth();
  const { isOwner, currentRole, hasPermission } = usePermissions();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } =
    useManageableLocations();
  const { services, isLoading: servicesLoading, refetch: refetchServices } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackages();
  const { products, isLoading: productsLoading, refetch: refetchProducts } = useProducts();
  const { vouchers, isLoading: vouchersLoading, refetch: refetchVouchers } = useVouchers();
  const { issuesByItemKey, refetch: refetchIssues } = useCatalogIntegrityIssues();
  const { binItems, isLoading: binLoading, restoreItem, permanentlyDeleteItem, refetch: refetchBinItems } = useBinItems();
  const { createRequest } = useDeletionRequests();

  const currency = currentTenant?.currency || "USD";
  const isLoading = servicesLoading || packagesLoading || productsLoading;
  
  // Permission checks
  const canEdit = hasPermission("catalog:edit");
  const canDelete = hasPermission("catalog:delete");
  const canRequestDelete = hasPermission("catalog:request_delete");
  const canArchive = hasPermission("catalog:archive");
  const canFlag = hasPermission("catalog:flag");
  const canRestoreBinItems = hasPermission("catalog:edit");
  const canDeleteBinItems = hasPermission("catalog:delete");
  const canApplyIntegrityFix = currentRole === "owner" || currentRole === "manager";
  const isChainTier = String(currentTenant?.plan || "").toLowerCase() === "chain";
  const isBinBusy = binProcessingItemId !== null;
  const makeBinKey = (item: { id: string; type: ItemType | "voucher" }) => `${item.type}:${item.id}`;

  const formatCurrency = (amount: number) => {
    return `${currency} ${Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getItemIssues = (itemType: CatalogIntegrityItemType, itemId: string): CatalogIntegrityIssue[] =>
    issuesByItemKey.get(`${itemType}:${itemId}`) || [];

  const hasBlockingIssue = (itemType: CatalogIntegrityItemType, itemId: string) =>
    getItemIssues(itemType, itemId).some((issue) => issue.severity === "blocking");

  const hasWarningIssue = (itemType: CatalogIntegrityItemType, itemId: string) =>
    getItemIssues(itemType, itemId).some((issue) => issue.severity === "warning");

  const shouldShowItem = (itemType: CatalogIntegrityItemType, itemId: string) => {
    if (!showFlaggedOnly) return true;
    return getItemIssues(itemType, itemId).length > 0;
  };

  const IMPORT_TEMPLATES: Record<CatalogImportType, TemplateColumn[]> = {
    services: [
      { header: "name", example: "Silk Press", required: true },
      { header: "duration_minutes", example: "60", required: false },
      { header: "price", example: "15000", required: true },
      { header: "description", example: "Includes wash and finish", required: false },
      { header: "is_active", example: "true", required: false },
    ],
    products: [
      { header: "name", example: "Shampoo 500ml", required: true },
      { header: "stock_quantity", example: "24", required: false },
      { header: "price", example: "8500", required: true },
      { header: "description", example: "Sulphate free formula", required: false },
      { header: "is_active", example: "true", required: false },
    ],
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
  const refetchAll = async () => {
    await Promise.all([
      refetchServices(),
      refetchPackages(),
      refetchProducts(),
      refetchVouchers(),
      refetchIssues(),
    ]);
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
    
    // Close dialog and clear selection
    setDeleteDialogOpen(false);
    clearSelection();
    
    // Start countdown for batch
    let countdown = 5;
    const batchId = Date.now().toString();
    
    const undoToast = toast({
        title: `Deleting ${itemsToDelete.length} item(s)...`,
        description: `Click Undo to cancel (${countdown}s)`,
        duration: 6000,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUndo(batchId)}
          >
            <Undo2 className="w-4 h-4 mr-1" />
            Undo
          </Button>
        ),
      });
    undoToastRef.current.set(batchId, { dismiss: undoToast.dismiss, update: undoToast.update });
    
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        undoRef.current.delete(batchId);
        undoToastRef.current.get(batchId)?.dismiss();
        undoToastRef.current.delete(batchId);
        executeSoftDelete(itemsToDelete);
      } else {
        undoToastRef.current.get(batchId)?.update({
          title: `Deleting ${itemsToDelete.length} item(s)...`,
          description: `Click Undo to cancel (${countdown}s)`,
        });
      }
    }, 1000);
    
    undoRef.current.set(batchId, interval);
  };

  const handleUndo = (batchId: string) => {
    const interval = undoRef.current.get(batchId);
    if (interval) {
      clearInterval(interval);
      undoRef.current.delete(batchId);
      undoToastRef.current.get(batchId)?.dismiss();
      undoToastRef.current.delete(batchId);
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
      await Promise.all([refetchAll(), refetchBinItems()]);
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

  const openFixConfigDialog = (item: CatalogItem) => {
    const itemIssues = getItemIssues(item.type, item.id);
    if (itemIssues.length === 0) return;
    const inferredLocationIds = Array.from(
      new Set(itemIssues.flatMap((issue) => issue.branch_location_ids || [])),
    );
    setFixTarget({
      itemId: item.id,
      itemType: item.type,
      itemName: item.name,
      issueCodes: Array.from(new Set(itemIssues.map((issue) => issue.issue_code))),
      locationIds: inferredLocationIds,
    });
    setFixLocationIds(
      inferredLocationIds.length > 0
        ? inferredLocationIds
        : defaultLocationId
          ? [defaultLocationId]
          : [],
    );
    setFixDialogOpen(true);
  };

  const applyIntegrityFix = async () => {
    if (!currentTenant?.id || !fixTarget) return;
    if (hasFixMixedCurrencies) {
      toast({
        title: "Mixed currency mapping",
        description: "Select branches that share the same currency.",
        variant: "destructive",
      });
      return;
    }
    if (isChainTier && fixLocationIds.length === 0) {
      toast({
        title: "Select branches",
        description: "Choose at least one branch before applying this fix.",
        variant: "destructive",
      });
      return;
    }

    setIsApplyingFix(true);
    try {
      if (isChainTier) {
        const tableMap = {
          service: { table: "service_locations", column: "service_id" },
          product: { table: "product_locations", column: "product_id" },
          package: { table: "package_locations", column: "package_id" },
          voucher: { table: "voucher_locations", column: "voucher_id" },
        } as const;
        const mappingMeta = tableMap[fixTarget.itemType];

        const { error: deleteError } = await (supabase.from as any)(mappingMeta.table)
          .delete()
          .eq("tenant_id", currentTenant.id)
          .eq(mappingMeta.column, fixTarget.itemId);
        if (deleteError) throw deleteError;

        const mappingRows = fixLocationIds.map((locationId) => ({
          tenant_id: currentTenant.id,
          location_id: locationId,
          is_enabled: true,
          [mappingMeta.column]: fixTarget.itemId,
        }));
        if (mappingRows.length > 0) {
          const { error: upsertError } = await (supabase.from as any)(mappingMeta.table).upsert(
            mappingRows,
            { onConflict: `${mappingMeta.column},location_id` },
          );
          if (upsertError) throw upsertError;
        }
      }

      const { error: validateError } = await (supabase.rpc as any)("validate_catalog_item_integrity", {
        p_tenant_id: currentTenant.id,
        p_item_type: fixTarget.itemType,
        p_item_id: fixTarget.itemId,
      });
      if (validateError) throw validateError;

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "catalog.integrity_fix_applied",
        _target_type: fixTarget.itemType,
        _target_id: fixTarget.itemId,
        _summary: `Integrity fix applied to ${fixTarget.itemType}`,
        _details: {
          issue_codes: fixTarget.issueCodes,
          fixed_location_ids: fixLocationIds,
        },
        _branch_location_id: fixLocationIds[0] || null,
      });

      toast({
        title: "Config fixed",
        description: `${fixTarget.itemName} has been revalidated.`,
      });
      setFixDialogOpen(false);
      setFixTarget(null);
      setFixLocationIds([]);
      await refetchAll();
    } catch (error) {
      console.error("Error applying integrity fix:", error);
      toast({
        title: "Failed to apply fix",
        description: "Please review branch mappings and try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingFix(false);
    }
  };

  const parseBoolean = (value: unknown): boolean | undefined => {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive"].includes(normalized)) return false;
    return undefined;
  };

  const parseImportRows = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];
    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    return rows.map((row) => ({
      name: row.name,
      description: row.description || null,
      price: row.price,
      stock_quantity: row.stock_quantity,
      duration_minutes: row.duration_minutes,
      is_active: parseBoolean(row.is_active),
    }));
  };

  const handleImportCatalog = async (file: File) => {
    if (!currentTenant?.id) {
      toast({ title: "No tenant selected", description: "Please select a tenant first.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      const rows = await parseImportRows(file);
      if (!rows.length) {
        toast({ title: "No data found", description: "The uploaded file has no importable rows.", variant: "destructive" });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast({
          title: "Session expired",
          description: "Please sign in again before importing.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("bulk-import-catalog", {
        body: {
          tenant_id: currentTenant.id,
          import_type: importType,
          rows,
          dry_run: false,
        },
      });

      if (error) throw error;

      const summary = data?.summary || {};
      toast({
        title: `${importType === "services" ? "Service" : "Product"} import completed`,
        description: `Imported ${summary.imported_rows ?? 0}/${summary.total_rows ?? rows.length} rows.`,
      });

      if (importType === "services") {
        refetchServices();
      } else {
        refetchProducts();
      }
    } catch (error) {
      console.error("Catalog import failed:", error);
      const status = Number((error as any)?.context?.status || 0);
      toast({
        title: "Import failed",
        description:
          status === 401
            ? "Your session is not authorized for import. Please sign in again."
            : status === 403
              ? "You do not have permission to import catalog records."
              : "Could not process this file. Check template columns and try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsImporting(false);
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
      undoToastRef.current.forEach((toastController) => toastController.dismiss());
    };
  }, []);

  const fixCurrencies = useMemo(
    () => getCurrenciesForLocations(manageableLocations, fixLocationIds, currency),
    [currency, fixLocationIds, manageableLocations],
  );
  const hasFixMixedCurrencies = fixCurrencies.length > 1;

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Services and Products</h1>
            <p className="text-muted-foreground">
              Manage your service catalog, packages, products, and vouchers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(activeTab === "all" || activeTab === "services" || activeTab === "products") && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Import
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setImportType("services");
                        setImportDialogOpen(true);
                      }}
                    >
                      Import Services
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setImportType("products");
                        setImportDialogOpen(true);
                      }}
                    >
                      Import Products
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {activeTab === "all" ? (
              <AddItemPopover onSelect={handleAddFromPopover} />
            ) : (
              addButtonLabel && (
                <Button onClick={handleAddClick}>
                  <Plus className="w-4 h-4 mr-2" />
                  {addButtonLabel}
                </Button>
              )
            )}
          </div>
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
              <Button
                variant={showFlaggedOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFlaggedOnly((prev) => !prev)}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                {showFlaggedOnly ? "Showing flagged only" : "Show flagged only"}
              </Button>
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
                  {filteredItems.filter((item) => shouldShowItem(item.type, item.id)).length === 0 ? (
                    <EmptyState message="No items yet. Add services, products, or packages to get started." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredItems
                        .filter((item) => shouldShowItem(item.type, item.id))
                        .map((item) => (
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
                          integrityIssues={getItemIssues(item.type, item.id)}
                          onFixConfig={canApplyIntegrityFix ? () => openFixConfigDialog(item) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Services Tab */}
                <TabsContent value="services" className="mt-0">
                  {services
                    .filter(
                      (s) =>
                        (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                        shouldShowItem("service", s.id),
                    ).length === 0 ? (
                    <EmptyState message="No services yet. Add your first service." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {services
                        .filter(
                          (s) =>
                            (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                            shouldShowItem("service", s.id)
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
                            onViewDetails={() => setViewDetailItem({ id: s.id, type: "service", name: s.name, description: s.description || "", price: Number(s.price), duration: s.duration_minutes, images: s.image_urls || [], status: s.status, is_flagged: s.is_flagged })}
                            onEdit={() => setEditItem({ id: s.id, type: "service", name: s.name, description: s.description || "", price: Number(s.price), duration: s.duration_minutes, images: s.image_urls || [], status: s.status, is_flagged: s.is_flagged })}
                            integrityIssues={getItemIssues("service", s.id)}
                            onFixConfig={canApplyIntegrityFix ? () => openFixConfigDialog({
                              id: s.id,
                              type: "service",
                              name: s.name,
                              description: s.description || "",
                              price: Number(s.price),
                              duration: s.duration_minutes,
                              images: s.image_urls || [],
                              status: s.status,
                              is_flagged: s.is_flagged,
                            }) : undefined}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Packages Tab */}
                <TabsContent value="packages" className="mt-0">
                  {packages
                    .filter(
                      (p) =>
                        (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                        shouldShowItem("package", p.id),
                    ).length === 0 ? (
                    <EmptyState message="No packages yet. Bundle services together." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {packages
                        .filter(
                          (p) =>
                            (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                            shouldShowItem("package", p.id)
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
                            onViewDetails={() => setViewDetailItem({ id: p.id, type: "package", name: p.name, description: p.description || "", price: Number(p.price), originalPrice: p.original_price ? Number(p.original_price) : undefined, images: p.image_urls || [], status: p.status, is_flagged: (p as any).is_flagged || false })}
                            onEdit={() => setEditItem({ id: p.id, type: "package", name: p.name, description: p.description || "", price: Number(p.price), originalPrice: p.original_price ? Number(p.original_price) : undefined, images: p.image_urls || [], status: p.status, is_flagged: (p as any).is_flagged || false })}
                            integrityIssues={getItemIssues("package", p.id)}
                            onFixConfig={canApplyIntegrityFix ? () => openFixConfigDialog({
                              id: p.id,
                              type: "package",
                              name: p.name,
                              description: p.description || "",
                              price: Number(p.price),
                              originalPrice: p.original_price ? Number(p.original_price) : undefined,
                              images: p.image_urls || [],
                              status: p.status,
                              is_flagged: (p as any).is_flagged || false,
                            }) : undefined}
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
                      {products
                        .filter(
                          (p) =>
                            (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                            shouldShowItem("product", p.id),
                        ).length === 0 ? (
                        <EmptyState message="No products yet. Add items to sell." />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {products
                            .filter(
                              (p) =>
                                (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())) &&
                                shouldShowItem("product", p.id)
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
                                onViewDetails={() => setViewDetailItem({ id: p.id, type: "product", name: p.name, description: p.description || "", price: Number(p.price), stock: p.stock_quantity, images: p.image_urls || [], status: p.status, is_flagged: (p as any).is_flagged })}
                                onEdit={() => setEditItem({ id: p.id, type: "product", name: p.name, description: p.description || "", price: Number(p.price), stock: p.stock_quantity, images: p.image_urls || [], status: p.status, is_flagged: (p as any).is_flagged })}
                                integrityIssues={getItemIssues("product", p.id)}
                                onFixConfig={canApplyIntegrityFix ? () => openFixConfigDialog({
                                  id: p.id,
                                  type: "product",
                                  name: p.name,
                                  description: p.description || "",
                                  price: Number(p.price),
                                  stock: p.stock_quantity,
                                  images: p.image_urls || [],
                                  status: p.status,
                                  is_flagged: (p as any).is_flagged,
                                }) : undefined}
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
                  ) : vouchers.filter((v) => shouldShowItem("voucher", v.id)).length === 0 ? (
                    <EmptyState message="No vouchers yet. Create gift cards for customers." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {vouchers.filter((v) => shouldShowItem("voucher", v.id)).map((v) => {
                        const voucherIssues = getItemIssues("voucher", v.id);
                        const blocking = voucherIssues.some((issue) => issue.severity === "blocking");
                        const warning = voucherIssues.some((issue) => issue.severity === "warning");
                        return (
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
                                  {(blocking || warning) && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-xs",
                                        blocking
                                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                                          : "border-warning/40 bg-warning/10 text-warning",
                                      )}
                                    >
                                      <AlertTriangle className="mr-1 h-3 w-3" />
                                      {blocking ? "Blocking config issue" : "Config warning"}
                                    </Badge>
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
                            {voucherIssues.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs text-muted-foreground">{voucherIssues[0].issue_message}</p>
                                {canApplyIntegrityFix && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      openFixConfigDialog({
                                        id: v.id,
                                        type: "voucher",
                                        name: v.code,
                                        description: "",
                                        price: Number(v.amount),
                                      })
                                    }
                                  >
                                    <Wrench className="mr-2 h-4 w-4" />
                                    Fix config
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )})}
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
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!isImporting) setImportDialogOpen(open);
        }}
        title={`Import ${importType === "services" ? "Services" : "Products"}`}
        description={`Upload a CSV or Excel file to bulk import ${importType}.`}
        templateColumns={IMPORT_TEMPLATES[importType]}
        templateFileName={importType}
        onImport={handleImportCatalog}
      />

      {selectedItems.size === 0 && (
        <button
          type="button"
          onClick={() => setBinOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-lg hover:opacity-95"
        >
          <Trash2 className="h-4 w-4" />
          Bin ({binItems.length})
        </button>
      )}

      <Dialog
        open={binOpen}
        onOpenChange={(open) => {
          setBinOpen(open);
          if (!open) {
            setBinSelectMode(false);
            setSelectedBinItemKeys(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bin</DialogTitle>
            <DialogDescription>
              Restore deleted services, products, packages, and vouchers within 7 days.
            </DialogDescription>
            <div className="text-xs text-muted-foreground">Total: {binItems.length}</div>
          </DialogHeader>

          <div className={cn("space-y-4", isBinBusy && "pointer-events-none opacity-60")}>
          {!binLoading && binItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBinBusy}
                  onClick={() => {
                    if (binSelectMode) {
                      setBinSelectMode(false);
                      setSelectedBinItemKeys(new Set());
                      return;
                    }
                    setBinSelectMode(true);
                  }}
                >
                  {binSelectMode ? "Cancel Select" : "Select"}
                </Button>
                {binSelectMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBinBusy}
                    onClick={() => {
                      if (selectedBinItemKeys.size === binItems.length) {
                        setSelectedBinItemKeys(new Set());
                        return;
                      }
                      setSelectedBinItemKeys(new Set(binItems.map((item) => makeBinKey(item))));
                    }}
                  >
                    {selectedBinItemKeys.size === binItems.length ? "Clear All" : "Select All"}
                  </Button>
                )}
              </div>

              {binSelectMode && selectedBinItemKeys.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selectedBinItemKeys.size} selected</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canRestoreBinItems || isBinBusy}
                    onClick={async () => {
                      const selectedItems = binItems.filter((item) => selectedBinItemKeys.has(makeBinKey(item)));
                      setBinProcessingItemId("__bulk_restore__");
                      let restoredCount = 0;
                      for (const item of selectedItems) {
                        const expiresAt = new Date(new Date(item.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000);
                        if (expiresAt.getTime() <= Date.now()) continue;
                        const restored = await restoreItem(item.id, item.type, { silent: true, skipRefetch: true });
                        if (restored) restoredCount++;
                      }
                      await Promise.all([refetchBinItems(), refetchAll()]);
                      setBinProcessingItemId(null);
                      setSelectedBinItemKeys(new Set());
                      setBinSelectMode(false);
                      toast({
                        title: "Restore complete",
                        description: restoredCount > 0 ? `${restoredCount} item(s) restored.` : "No selected items could be restored.",
                      });
                    }}
                  >
                    {binProcessingItemId === "__bulk_restore__" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Restoring...
                      </>
                    ) : (
                      "Restore selected"
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!canDeleteBinItems || isBinBusy}
                    onClick={async () => {
                      const selectedItems = binItems.filter((item) => selectedBinItemKeys.has(makeBinKey(item)));
                      setBinProcessingItemId("__bulk_delete__");
                      let deletedCount = 0;
                      for (const item of selectedItems) {
                        const deleted = await permanentlyDeleteItem(item.id, item.type, { silent: true, skipRefetch: true });
                        if (deleted) deletedCount++;
                      }
                      await Promise.all([refetchBinItems(), refetchAll()]);
                      setBinProcessingItemId(null);
                      setSelectedBinItemKeys(new Set());
                      setBinSelectMode(false);
                      toast({
                        title: "Delete complete",
                        description: deletedCount > 0 ? `${deletedCount} item(s) permanently deleted.` : "No selected items were deleted.",
                      });
                    }}
                  >
                    {binProcessingItemId === "__bulk_delete__" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete selected"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {binLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : binItems.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              Bin is empty.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {binItems.map((item) => {
                const expiresAt = new Date(new Date(item.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000);
                const remainingMs = expiresAt.getTime() - Date.now();
                const canStillRestore = remainingMs > 0;
                const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

                return (
                  <Card key={`${item.type}-${item.id}`}>
                    <CardContent className="p-4 space-y-3">
                      {binSelectMode && (
                        <div className="flex justify-end">
                          <Checkbox
                            checked={selectedBinItemKeys.has(makeBinKey(item))}
                            onCheckedChange={(checked) => {
                              setSelectedBinItemKeys((prev) => {
                                const next = new Set(prev);
                                const key = makeBinKey(item);
                                if (checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                          />
                        </div>
                      )}
                      <img
                        src={item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : "/placeholder.svg"}
                        alt={item.name}
                        className="h-28 w-full rounded-md object-cover"
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium leading-tight">{item.name}</h4>
                          {item.description ? (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {item.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {canStillRestore
                          ? `${remainingDays} day(s) left before permanent deletion`
                          : "Restore window expired"}
                      </div>
                      {item.location_names && item.location_names.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.location_names.map((locationName) => (
                            <Badge key={`${item.id}-${locationName}`} variant="secondary" className="text-[10px]">
                              {locationName}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                        disabled={
                          binSelectMode ||
                          !canRestoreBinItems ||
                          !canStillRestore ||
                          binProcessingItemId === item.id ||
                          binProcessingItemId === "__bulk_restore__" ||
                          binProcessingItemId === "__bulk_delete__"
                        }
                        onClick={async () => {
                          setBinProcessingItemId(item.id);
                          await restoreItem(item.id, item.type);
                          await refetchAll();
                          setBinProcessingItemId(null);
                        }}
                        >
                          {binProcessingItemId === item.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Working...
                            </>
                          ) : (
                            "Restore"
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                        disabled={
                          binSelectMode ||
                          !canDeleteBinItems ||
                          binProcessingItemId === item.id ||
                          binProcessingItemId === "__bulk_restore__" ||
                          binProcessingItemId === "__bulk_delete__"
                        }
                        onClick={async () => {
                          setBinProcessingItemId(item.id);
                          await permanentlyDeleteItem(item.id, item.type);
                          await refetchAll();
                          setBinProcessingItemId(null);
                        }}
                        >
                          {binProcessingItemId === item.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete now"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={fixDialogOpen}
        onOpenChange={(open) => {
          setFixDialogOpen(open);
          if (!open) {
            setFixTarget(null);
            setFixLocationIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fix config: {fixTarget?.itemName || "Item"}</DialogTitle>
            <DialogDescription>
              Resolve flagged mapping/currency issues. Blocking issues stay hidden on storefront until fixed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {fixTarget?.issueCodes?.length ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Detected issues</p>
                <div className="flex flex-wrap gap-1.5">
                  {fixTarget.issueCodes.map((issueCode) => (
                    <Badge key={issueCode} variant="outline">
                      {issueCode}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {isChainTier ? (
              <LocationScopePicker
                locations={manageableLocations}
                selectedLocationIds={fixLocationIds}
                onChange={setFixLocationIds}
                disabled={isApplyingFix || locationsLoading || manageableLocations.length === 0}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Non-chain tenants use legacy visibility rules. Save to re-run validation.
              </p>
            )}

            {hasFixMixedCurrencies && (
              <p className="text-sm text-destructive">
                Selected branches use different currencies. Choose one currency group.
              </p>
            )}

            {!canApplyIntegrityFix && (
              <p className="text-sm text-muted-foreground">
                Only owner and manager roles can apply integrity fixes.
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setFixDialogOpen(false)}
              disabled={isApplyingFix}
            >
              Cancel
            </Button>
            <Button
              onClick={applyIntegrityFix}
              disabled={
                isApplyingFix ||
                !canApplyIntegrityFix ||
                (isChainTier && fixLocationIds.length === 0) ||
                hasFixMixedCurrencies
              }
            >
              {isApplyingFix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply fix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  integrityIssues?: CatalogIntegrityIssue[];
  onFixConfig?: () => void;
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
  integrityIssues = [],
  onFixConfig,
}: SelectableItemCardProps) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    service: { label: "SERVICE", color: "text-primary" },
    package: { label: "PACKAGE", color: "text-primary/80" },
    product: { label: "PRODUCT", color: "text-primary/60" },
  };

  const typeInfo = typeLabels[item.type] || typeLabels.service;
  const blockingIssue = integrityIssues.find((issue) => issue.severity === "blocking");
  const warningIssue = integrityIssues.find((issue) => issue.severity === "warning");
  const firstIssue = blockingIssue || warningIssue;

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
              {firstIssue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        blockingIssue
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-warning/40 bg-warning/10 text-warning",
                      )}
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {blockingIssue ? "Blocking" : "Warning"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    <p className="text-xs">{firstIssue.issue_message}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <h3 className="font-semibold mt-1 truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {item.description || "No description"}
            </p>
            {firstIssue && firstIssue.branch_location_names.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {firstIssue.branch_location_names.map((branchName) => (
                  <Badge key={`${item.id}-${branchName}`} variant="secondary" className="text-[10px]">
                    {branchName}
                  </Badge>
                ))}
              </div>
            )}

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
                {onFixConfig && integrityIssues.length > 0 && (
                  <DropdownMenuItem onClick={onFixConfig}>
                    <Wrench className="w-4 h-4 mr-2" />
                    Fix config
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
