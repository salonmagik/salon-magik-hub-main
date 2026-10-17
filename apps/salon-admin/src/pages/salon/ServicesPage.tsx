import { useState, useMemo, useRef } from "react";
import { SalonSidebar, MobileQuickActionEffect, type MobileQuickAction } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  Scissors,
  Plus,
  Download,
  Search,
  MoreHorizontal,
  Trash2,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import { AddServiceDialog } from "@/components/dialogs/AddServiceDialog";
import { AddPackageDialog } from "@/components/dialogs/AddPackageDialog";
import { EditServiceDialog } from "@/components/dialogs/EditServiceDialog";
import { ServiceDetailDialog } from "@/components/dialogs/ServiceDetailDialog";
import { ReasonConfirmDialog } from "@/components/dialogs/ReasonConfirmDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { RequestDeleteDialog } from "@/components/dialogs/RequestDeleteDialog";
import { ImportDialog, type TemplateColumn } from "@/components/dialogs/ImportDialog";
import { BulkActionsBar } from "@/components/catalog/BulkActionsBar";
import { CatalogBinDialog } from "@/components/catalog/CatalogBinDialog";
import { EmptyState, SelectableItemCard, type CatalogItem } from "@/components/catalog/CatalogItemCard";
import { useServices } from "@/hooks/useServices";
import { useBinItems } from "@/hooks/useBinItems";
import { useDeletionRequests } from "@/hooks/useDeletionRequests";
import { useCatalogIntegrityIssues } from "@/hooks/useCatalogIntegrityIssues";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveBranchCurrency } from "@/hooks/useActiveBranchCurrency";
import { usePlanBySlug } from "@/hooks/usePlans";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

export default function ServicesPage() {
  useWalkthroughAutoTrigger("services");
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestDeleteDialogOpen, setRequestDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [binOpen, setBinOpen] = useState(false);

  const [viewDetailItem, setViewDetailItem] = useState<CatalogItem | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);

  const undoRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const undoToastRef = useRef<Map<string, { dismiss: () => void; update: (props: any) => void }>>(new Map());

  const { currentTenant, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { services, isLoading: servicesLoading, refetch: refetchServices } = useServices();
  const { data: currentPlan } = usePlanBySlug(String(currentTenant?.plan || ""));
  const { issuesByItemKey, refetch: refetchIssues } = useCatalogIntegrityIssues();
  const { binItems, isLoading: binLoading, restoreItem, permanentlyDeleteItem, refetch: refetchBinItems } = useBinItems();
  const { createRequest } = useDeletionRequests();

  const { currency } = useActiveBranchCurrency("USD");

  const canEdit = hasPermission("catalog:edit");
  const canDelete = hasPermission("catalog:delete");
  const canRequestDelete = hasPermission("catalog:request_delete");
  const canArchive = hasPermission("catalog:archive");
  const canFlag = hasPermission("catalog:flag");
  const canRestoreBinItems = hasPermission("catalog:edit");
  const canDeleteBinItems = hasPermission("catalog:delete");
  const isBinBusy = false;

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { GHS: "₵", NGN: "₦", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || `${currency} `}${Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getItemIssues = (itemId: string) => issuesByItemKey.get(`service:${itemId}`) || [];

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toCatalogItem = (s: (typeof services)[number]): CatalogItem => ({
    id: s.id,
    type: "service",
    name: s.name,
    description: s.description || "",
    price: Number(s.price),
    duration: s.duration_minutes,
    images: s.image_urls || [],
    status: s.status,
    is_flagged: s.is_flagged,
  });

  const selectedItemsInfo = useMemo(() => {
    return Array.from(selectedItems)
      .map((id) => {
        const service = services.find((s) => s.id === id);
        return service ? { id, name: service.name, type: "service" as const } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; type: "service" }>;
  }, [selectedItems, services]);

  const preSelectedPackageItems = useMemo(() => {
    return Array.from(selectedItems)
      .map((id) => {
        const service = services.find((s) => s.id === id);
        return service ? { id, type: "service" as const, name: service.name, price: Number(service.price) } : null;
      })
      .filter(Boolean) as Array<{ id: string; type: "service"; name: string; price: number }>;
  }, [selectedItems, services]);

  const clearSelection = () => setSelectedItems(new Set());

  const refetchAll = async () => {
    await Promise.all([refetchServices(), refetchIssues()]);
  };

  const handleSelectItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFlag = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        await supabase.from("services").update({ is_flagged: true, flag_reason: reason }).eq("id", item.id);
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

  const handleArchive = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        await supabase.from("services").update({ status: "archived" as const, archive_reason: reason }).eq("id", item.id);
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

  const executeSoftDelete = async (items: Array<{ id: string; name: string }>) => {
    try {
      for (const item of items) {
        await supabase
          .from("services")
          .update({ deleted_at: new Date().toISOString(), deleted_by_id: user?.id, deletion_reason: "Direct deletion by owner" })
          .eq("id", item.id);
      }
      toast({ title: "Sent to Bin", description: `${items.length} item(s) moved to bin. Can be restored within 7 days.` });
      await Promise.all([refetchAll(), refetchBinItems()]);
    } catch (err) {
      console.error("Error deleting items:", err);
      toast({ title: "Error", description: "Failed to delete items", variant: "destructive" });
    }
  };

  const handleDelete = () => {
    if (!user?.id) return;
    const itemsToDelete = Array.from(selectedItemsInfo);
    setDeleteDialogOpen(false);
    clearSelection();

    let countdown = 5;
    const batchId = Date.now().toString();
    const undoToast = toast({
      title: `Deleting ${itemsToDelete.length} item(s)...`,
      description: `Click Undo to cancel (${countdown}s)`,
      duration: 6000,
      action: (
        <Button variant="outline" size="sm" onClick={() => handleUndo(batchId)}>
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

  const handleBulkDelete = () => {
    if (canDelete) setDeleteDialogOpen(true);
    else if (canRequestDelete) setRequestDeleteDialogOpen(true);
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
    const XLSX = await import("xlsx");
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
      duration_minutes: row.duration_minutes,
      is_active: parseBoolean(row.is_active),
    }));
  };

  const IMPORT_TEMPLATE: TemplateColumn[] = [
    { header: "name", example: "Silk Press", required: true },
    { header: "duration_minutes", example: "60", required: false },
    { header: "price", example: "15000", required: true },
    { header: "description", example: "Includes wash and finish", required: false },
    { header: "is_active", example: "true", required: false },
  ];

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Session expired", description: "Please sign in again before importing.", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("bulk-import-catalog", {
        body: { tenant_id: currentTenant.id, import_type: "services", rows, dry_run: false },
      });
      if (error) throw error;
      const summary = data?.summary || {};
      toast({ title: "Service import completed", description: `Imported ${summary.imported_rows ?? 0}/${summary.total_rows ?? rows.length} rows.` });
      refetchServices();
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

  const resourceLimit = useMemo(() => {
    const max = currentPlan?.limits?.max_services ?? null;
    const count = services.filter((s) => s.status === "active").length;
    return { count, max, label: "service", pluralLabel: "services" };
  }, [currentPlan?.limits, services]);
  const isResourceFull = resourceLimit.max != null && resourceLimit.count >= resourceLimit.max;

  const mobileQuickAction = useMemo<MobileQuickAction | null>(() => {
    if (selectedItems.size > 0) return null;
    return {
      kind: "menu",
      ariaLabel: "Add a service",
      options: [
        {
          key: "service",
          label: "Add service",
          icon: Scissors,
          disabled: isResourceFull,
          badge: isResourceFull ? "Limit reached" : undefined,
          onSelect: () => setServiceDialogOpen(true),
        },
        {
          key: "import",
          label: "Import services",
          icon: Download,
          onSelect: () => setImportDialogOpen(true),
        },
        {
          key: "bin",
          label: `Bin (${binItems.length})`,
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: () => setBinOpen(true),
        },
      ],
    };
  }, [selectedItems.size, isResourceFull, binItems.length]);

  return (
    <SalonSidebar>
      <MobileQuickActionEffect action={mobileQuickAction} />
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Catalog</p>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Services</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Manage your services, including pricing, duration, and availability. 
            </p>
          </div>
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <Button variant="outline" className="h-12 rounded-full px-6" onClick={() => setImportDialogOpen(true)}>
              <Download className="w-4 h-4 mr-2" />
              Import
            </Button>
            {resourceLimit.max != null && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  isResourceFull ? "bg-warning-bg text-warning-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {resourceLimit.count} of {resourceLimit.max} used
              </span>
            )}
            <Button onClick={() => setServiceDialogOpen(true)} className="h-12 rounded-full px-7" data-tour-id="tour-add-service">
              <Plus className="w-4 h-4 mr-2" />
              Add Service
            </Button>
          </div>
        </div>

        {isResourceFull && (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg/50 px-4 py-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-medium">You've reached your plan's service limit.</span> Archive an existing service to free
              up a slot, or upgrade your plan for unlimited services.
            </p>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search services..."
              className="h-12 rounded-[12px] bg-white pl-11 text-sm shadow-sm sm:text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {servicesLoading ? (
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
        ) : filteredServices.length === 0 ? (
          <EmptyState message="No services yet. Add your first service." />
        ) : (
          <div className="space-y-3">
            {filteredServices.map((s) => {
              const item = toCatalogItem(s);
              return (
                <SelectableItemCard
                  key={s.id}
                  item={item}
                  currency={currency}
                  formatCurrency={formatCurrency}
                  isSelected={selectedItems.has(s.id)}
                  onSelect={() => handleSelectItem(s.id)}
                  canEdit={canEdit}
                  onViewDetails={() => setViewDetailItem(item)}
                  onEdit={() => setEditItem(item)}
                  integrityIssues={getItemIssues(s.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      <BulkActionsBar
        selectedCount={selectedItems.size}
        itemType="service"
        onCreatePackage={selectedItems.size > 0 ? () => setPackageDialogOpen(true) : undefined}
        onFlag={canFlag ? () => setFlagDialogOpen(true) : undefined}
        onArchive={canArchive ? () => setArchiveDialogOpen(true) : undefined}
        onDelete={canDelete || canRequestDelete ? handleBulkDelete : undefined}
        onClear={clearSelection}
        canDelete={canDelete || canRequestDelete}
        canArchive={canArchive}
      />

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

      <AddServiceDialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen} onSuccess={refetchServices} />
      <AddPackageDialog
        open={packageDialogOpen}
        onOpenChange={(isOpen) => {
          setPackageDialogOpen(isOpen);
          if (!isOpen) clearSelection();
        }}
        onSuccess={() => {}}
        preSelectedItems={preSelectedPackageItems}
      />
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!isImporting) setImportDialogOpen(open);
        }}
        title="Import Services"
        description="Upload a CSV or Excel file to bulk import services."
        templateColumns={IMPORT_TEMPLATE}
        templateFileName="services"
        onImport={handleImportCatalog}
      />

      {selectedItems.size === 0 && (
        <button
          type="button"
          onClick={() => setBinOpen(true)}
          className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-lg hover:opacity-95 lg:inline-flex"
        >
          <Trash2 className="h-4 w-4" />
          Bin ({binItems.length})
        </button>
      )}

      <CatalogBinDialog
        open={binOpen}
        onOpenChange={setBinOpen}
        binItems={binItems}
        binLoading={binLoading}
        restoreItem={restoreItem}
        permanentlyDeleteItem={permanentlyDeleteItem}
        refetchBinItems={refetchBinItems}
        onChanged={refetchAll}
        canRestore={canRestoreBinItems}
        canDelete={canDeleteBinItems}
      />

      <EditServiceDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        service={editItem ? services.find((s) => s.id === editItem.id) || null : null}
        onSuccess={refetchServices}
      />

      <ServiceDetailDialog
        open={!!viewDetailItem}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        service={viewDetailItem ? services.find((s) => s.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onArchive={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
    </SalonSidebar>
  );
}
