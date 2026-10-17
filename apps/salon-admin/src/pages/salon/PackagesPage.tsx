import { useState, useMemo, useRef } from "react";
import { SalonSidebar, MobileQuickActionEffect, type MobileQuickAction } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Undo2,
  AlertTriangle,
  ShoppingCart,
} from "lucide-react";
import { AddPackageDialog } from "@/components/dialogs/AddPackageDialog";
import { EditPackageDialog } from "@/components/dialogs/EditPackageDialog";
import { PackageDetailDialog } from "@/components/dialogs/PackageDetailDialog";
import { ReasonConfirmDialog } from "@/components/dialogs/ReasonConfirmDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { RequestDeleteDialog } from "@/components/dialogs/RequestDeleteDialog";
import { BulkActionsBar } from "@/components/catalog/BulkActionsBar";
import { CatalogBinDialog } from "@/components/catalog/CatalogBinDialog";
import { EmptyState, SelectableItemCard, type CatalogItem } from "@/components/catalog/CatalogItemCard";
import { usePackages } from "@/hooks/usePackages";
import { usePackagePurchases, type PackagePurchaseStatus } from "@/hooks/usePackagePurchases";
import { useBinItems } from "@/hooks/useBinItems";
import { useDeletionRequests } from "@/hooks/useDeletionRequests";
import { useCatalogIntegrityIssues } from "@/hooks/useCatalogIntegrityIssues";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveBranchCurrency } from "@/hooks/useActiveBranchCurrency";
import { usePlanBySlug } from "@/hooks/usePlans";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import { format } from "date-fns";
import { cn } from "@shared/utils";

type PackageTab = "catalog" | "purchases";
type PurchaseFilter = "all" | PackagePurchaseStatus;

const STATUS_META: Record<PackagePurchaseStatus, { label: string; bg: string; color: string; progress: string }> = {
  active: { label: "Active", bg: "bg-[#E8F8EE]", color: "text-[#15834B]", progress: "bg-[#15834B]" },
  exhausted: { label: "Fully redeemed", bg: "bg-[#F3EDFF]", color: "text-primary", progress: "bg-primary" },
  expired: { label: "Expired", bg: "bg-destructive/10", color: "text-destructive", progress: "bg-destructive/50" },
  cancelled: { label: "Cancelled", bg: "bg-muted", color: "text-muted-foreground", progress: "bg-muted-foreground/40" },
  refunded: { label: "Refunded", bg: "bg-muted", color: "text-muted-foreground", progress: "bg-muted-foreground/40" },
};

export default function PackagesPage() {
  useWalkthroughAutoTrigger("packages");
  const [tab, setTab] = useState<PackageTab>("catalog");
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>("all");

  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestDeleteDialogOpen, setRequestDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [binOpen, setBinOpen] = useState(false);

  const [viewDetailItem, setViewDetailItem] = useState<CatalogItem | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);

  const undoRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const undoToastRef = useRef<Map<string, { dismiss: () => void; update: (props: any) => void }>>(new Map());

  const { currentTenant, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackages();
  const { purchases, isLoading: purchasesLoading } = usePackagePurchases();
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

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { GHS: "₵", NGN: "₦", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || `${currency} `}${Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getItemIssues = (itemId: string) => issuesByItemKey.get(`package:${itemId}`) || [];

  const filteredPackages = packages.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toCatalogItem = (p: (typeof packages)[number]): CatalogItem => ({
    id: p.id,
    type: "package",
    name: p.name,
    description: p.description || "",
    price: Number(p.price),
    originalPrice: p.original_price ? Number(p.original_price) : undefined,
    images: p.image_urls || [],
    status: p.status,
    is_flagged: (p as any).is_flagged || false,
  });

  const selectedItemsInfo = useMemo(() => {
    return Array.from(selectedItems)
      .map((id) => {
        const pkg = packages.find((p) => p.id === id);
        return pkg ? { id, name: pkg.name, type: "package" as const } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; type: "package" }>;
  }, [selectedItems, packages]);

  const clearSelection = () => setSelectedItems(new Set());

  const refetchAll = async () => {
    await Promise.all([refetchPackages(), refetchIssues()]);
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
        await supabase.from("packages").update({ is_flagged: true, flag_reason: reason }).eq("id", item.id);
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
        await supabase.from("packages").update({ status: "archived" as const, archive_reason: reason }).eq("id", item.id);
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
          .from("packages")
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

  const resourceLimit = useMemo(() => {
    const max = currentPlan?.limits?.max_packages ?? null;
    const count = packages.filter((p) => p.status === "active").length;
    return { count, max, label: "package", pluralLabel: "packages" };
  }, [currentPlan?.limits, packages]);
  const isResourceFull = resourceLimit.max != null && resourceLimit.count >= resourceLimit.max;

  const mobileQuickAction = useMemo<MobileQuickAction | null>(() => {
    if (selectedItems.size > 0) return null;
    return {
      kind: "menu",
      ariaLabel: "Add a package",
      options: [
        {
          key: "package",
          label: "Create package",
          icon: Package,
          disabled: isResourceFull,
          badge: isResourceFull ? "Limit reached" : undefined,
          onSelect: () => setPackageDialogOpen(true),
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

  const visiblePurchases = purchases.filter((p) => purchaseFilter === "all" || p.status === purchaseFilter);

  const purchaseFilters: Array<{ key: PurchaseFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "exhausted", label: "Fully redeemed" },
    { key: "expired", label: "Expired" },
  ];

  return (
    <SalonSidebar>
      <MobileQuickActionEffect action={mobileQuickAction} />
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Catalog</p>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Packages</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Bundles clients buy once, then redeem over time.
            </p>
          </div>
          {tab === "catalog" && (
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
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
              <Button onClick={() => setPackageDialogOpen(true)} className="h-12 rounded-full px-7" data-tour-id="tour-add-package">
                <Plus className="w-4 h-4 mr-2" />
                Add Package
              </Button>
            </div>
          )}
        </div>

        {tab === "catalog" && isResourceFull && (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg/50 px-4 py-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-medium">You've reached your plan's package limit.</span> Archive an existing package to
              free up a slot, or upgrade your plan for unlimited packages.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as PackageTab)}>
          <TabsList className="scrollbar-hide h-auto w-full justify-start overflow-x-auto rounded-full bg-[#eee9e1] p-1 lg:w-fit">
            <TabsTrigger value="catalog" className="h-10 shrink-0 rounded-full px-5 sm:px-6">Catalog</TabsTrigger>
            <TabsTrigger value="purchases" className="h-10 shrink-0 rounded-full px-5 sm:px-6">Purchases</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="mt-5">
            <div className="mb-5 flex flex-wrap items-center gap-4">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search packages..."
                  className="h-12 rounded-[12px] bg-white pl-11 text-sm shadow-sm sm:text-base"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {packagesLoading ? (
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
            ) : filteredPackages.length === 0 ? (
              <EmptyState message="No packages yet. Bundle services together." />
            ) : (
              <div className="space-y-3">
                {filteredPackages.map((p) => {
                  const item = toCatalogItem(p);
                  return (
                    <SelectableItemCard
                      key={p.id}
                      item={item}
                      currency={currency}
                      formatCurrency={formatCurrency}
                      isSelected={selectedItems.has(p.id)}
                      onSelect={() => handleSelectItem(p.id)}
                      canEdit={canEdit}
                      onViewDetails={() => setViewDetailItem(item)}
                      onEdit={() => setEditItem(item)}
                      integrityIssues={getItemIssues(p.id)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="purchases" className="mt-5">
            <div className="mb-5 flex flex-wrap gap-2">
              {purchaseFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPurchaseFilter(f.key)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    purchaseFilter === f.key
                      ? "border-transparent bg-foreground text-background"
                      : "border-border bg-white text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {purchasesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-40 mb-2" />
                      <Skeleton className="h-4 w-56" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : visiblePurchases.length === 0 ? (
              <EmptyState message="No package purchases yet. Once a customer buys a package, it shows up here." />
            ) : (
              <Card className="overflow-hidden rounded-[20px] border-border/60">
                <div className="hidden grid-cols-[1.3fr_1.5fr_1fr_1.6fr_0.9fr_1fr] gap-4 border-b px-5 py-3 text-xs text-muted-foreground lg:grid">
                  <div>Customer</div>
                  <div>Package</div>
                  <div>Purchased</div>
                  <div>Redemption</div>
                  <div>Status</div>
                  <div>Amount</div>
                </div>
                <div className="divide-y">
                  {visiblePurchases.map((purchase) => {
                    const used = purchase.items.reduce((sum, i) => sum + (i.total_quantity - i.remaining_quantity), 0);
                    const total = purchase.items.reduce((sum, i) => sum + i.total_quantity, 0);
                    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                    const meta = STATUS_META[purchase.status];
                    return (
                      <div
                        key={purchase.id}
                        className="grid grid-cols-1 gap-2 px-5 py-4 text-sm lg:grid-cols-[1.3fr_1.5fr_1fr_1.6fr_0.9fr_1fr] lg:items-center lg:gap-4"
                      >
                        <div className="font-medium">{purchase.customer?.full_name || "Unknown customer"}</div>
                        <div>{purchase.package?.name || "Package"}</div>
                        <div className="text-muted-foreground">{format(new Date(purchase.created_at), "MMM d, yyyy")}</div>
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 max-w-[110px] flex-1 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", meta.progress)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">{used}/{total}</span>
                        </div>
                        <div>
                          <Badge className={cn("gap-1 border-0", meta.bg, meta.color)}>{meta.label}</Badge>
                        </div>
                        <div className="font-medium">{formatCurrency(Number(purchase.package?.price || 0))}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {tab === "catalog" && (
        <>
          <BulkActionsBar
            selectedCount={selectedItems.size}
            itemType="package"
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
        </>
      )}

      <AddPackageDialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen} onSuccess={refetchPackages} />

      <EditPackageDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        pkg={editItem ? packages.find((p) => p.id === editItem.id) || null : null}
        onSuccess={refetchPackages}
      />

      <PackageDetailDialog
        open={!!viewDetailItem}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        pkg={viewDetailItem ? packages.find((p) => p.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onArchive={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
    </SalonSidebar>
  );
}
