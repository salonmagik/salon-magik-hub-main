import { useState, useMemo, useRef } from "react";
import { SalonSidebar, MobileQuickActionEffect, type MobileQuickAction } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import {
  Gift,
  Plus,
  Search,
  Trash2,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import { AddVoucherDialog } from "@/components/dialogs/AddVoucherDialog";
import { EditVoucherDialog } from "@/components/dialogs/EditVoucherDialog";
import { VoucherDetailDialog } from "@/components/dialogs/VoucherDetailDialog";
import { ReasonConfirmDialog } from "@/components/dialogs/ReasonConfirmDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { RequestDeleteDialog } from "@/components/dialogs/RequestDeleteDialog";
import { BulkActionsBar } from "@/components/catalog/BulkActionsBar";
import { CatalogBinDialog } from "@/components/catalog/CatalogBinDialog";
import { EmptyState, SelectableItemCard, type CatalogItem } from "@/components/catalog/CatalogItemCard";
import { useVouchers } from "@/hooks/useVouchers";
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

export default function VouchersPage() {
  useWalkthroughAutoTrigger("vouchers");
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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
  const { vouchers, isLoading: vouchersLoading, refetch: refetchVouchers } = useVouchers();
  const { data: currentPlan } = usePlanBySlug(String(currentTenant?.plan || ""));
  const { issuesByItemKey, refetch: refetchIssues } = useCatalogIntegrityIssues();
  const { binItems, isLoading: binLoading, restoreItem, permanentlyDeleteItem, refetch: refetchBinItems } = useBinItems();
  const { createRequest } = useDeletionRequests();

  const { currency } = useActiveBranchCurrency("USD");

  const canEdit = hasPermission("catalog:edit");
  const canDelete = hasPermission("catalog:delete");
  const canRequestDelete = hasPermission("catalog:request_delete");
  const canArchive = hasPermission("catalog:archive");
  const canRestoreBinItems = hasPermission("catalog:edit");
  const canDeleteBinItems = hasPermission("catalog:delete");

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { GHS: "₵", NGN: "₦", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || `${currency} `}${Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getItemIssues = (itemId: string) => issuesByItemKey.get(`voucher:${itemId}`) || [];

  const filteredVouchers = vouchers.filter((voucher) => voucher.code.toLowerCase().includes(searchQuery.toLowerCase()));

  const toCatalogItem = (voucher: (typeof vouchers)[number]): CatalogItem => ({
    id: voucher.id,
    type: "voucher",
    name: voucher.code,
    description: [
      voucher.access_type ? `${voucher.access_type} voucher` : "Gift voucher",
      voucher.expires_at ? `expires ${format(new Date(voucher.expires_at), "MMM d, yyyy")}` : null,
      `balance ${formatCurrency(Number(voucher.balance))}`,
    ].filter(Boolean).join(" · "),
    price: Number(voucher.amount),
    status: voucher.status,
  });

  const selectedItemsInfo = useMemo(() => {
    return Array.from(selectedItems)
      .map((id) => {
        const voucher = vouchers.find((v) => v.id === id);
        return voucher ? { id, name: voucher.code, type: "voucher" as const } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; type: "voucher" }>;
  }, [selectedItems, vouchers]);

  const clearSelection = () => setSelectedItems(new Set());

  const refetchAll = async () => {
    await Promise.all([refetchVouchers(), refetchIssues()]);
  };

  const handleSelectItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleArchive = async (reason: string) => {
    setIsProcessing(true);
    try {
      for (const item of selectedItemsInfo) {
        await supabase.from("vouchers").update({ status: "archived" as const, archive_reason: reason }).eq("id", item.id);
      }
      toast({ title: "Items Discontinued", description: `${selectedItems.size} item(s) discontinued` });
      clearSelection();
      refetchAll();
    } catch (err) {
      console.error("Error discontinuing items:", err);
      toast({ title: "Error", description: "Failed to discontinue items", variant: "destructive" });
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
          .from("vouchers")
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
    const max = currentPlan?.limits?.max_vouchers ?? null;
    const count = vouchers.filter((v) => v.status === "active").length;
    return { count, max, label: "voucher", pluralLabel: "vouchers" };
  }, [currentPlan?.limits, vouchers]);
  const isResourceFull = resourceLimit.max != null && resourceLimit.count >= resourceLimit.max;

  const mobileQuickAction = useMemo<MobileQuickAction | null>(() => {
    if (selectedItems.size > 0) return null;
    return {
      kind: "menu",
      ariaLabel: "Add a voucher",
      options: [
        {
          key: "voucher",
          label: "Create voucher",
          icon: Gift,
          disabled: isResourceFull,
          badge: isResourceFull ? "Limit reached" : undefined,
          onSelect: () => setVoucherDialogOpen(true),
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
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Vouchers</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Gift vouchers your customers can buy or redeem.
            </p>
          </div>
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
            <Button onClick={() => setVoucherDialogOpen(true)} className="h-12 rounded-full px-7" data-tour-id="tour-add-voucher">
              <Plus className="w-4 h-4 mr-2" />
              Add Voucher
            </Button>
          </div>
        </div>

        {isResourceFull && (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg/50 px-4 py-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-medium">You've reached your plan's voucher limit.</span> Discontinue an existing voucher to
              free up a slot, or upgrade your plan for unlimited vouchers.
            </p>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vouchers..."
              className="h-12 rounded-[12px] bg-white pl-11 text-sm shadow-sm sm:text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {vouchersLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-4 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredVouchers.length === 0 ? (
          <EmptyState message="No vouchers yet. Create gift cards for customers." />
        ) : (
          <div className="space-y-3">
            {filteredVouchers.map((voucher) => {
              const item = toCatalogItem(voucher);
              return (
                <SelectableItemCard
                  key={voucher.id}
                  item={item}
                  currency={currency}
                  formatCurrency={formatCurrency}
                  isSelected={selectedItems.has(voucher.id)}
                  onSelect={() => handleSelectItem(voucher.id)}
                  canEdit={canEdit}
                  onViewDetails={() => setViewDetailItem(item)}
                  onEdit={() => setEditItem(item)}
                  integrityIssues={getItemIssues(voucher.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      <BulkActionsBar
        selectedCount={selectedItems.size}
        itemType="voucher"
        onArchive={undefined}
        onDiscontinue={canArchive ? () => setArchiveDialogOpen(true) : undefined}
        onDelete={canDelete || canRequestDelete ? handleBulkDelete : undefined}
        onClear={clearSelection}
        canDelete={canDelete || canRequestDelete}
        canArchive={canArchive}
      />

      <ReasonConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title={`Discontinue ${selectedItems.size} Item${selectedItems.size !== 1 ? "s" : ""}?`}
        description="Discontinued vouchers are hidden from customers and can no longer be redeemed."
        actionLabel="Discontinue Items"
        reasonLabel="Reason for discontinuing"
        reasonPlaceholder="e.g., Promotion ended, Replaced by a new voucher..."
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

      <AddVoucherDialog open={voucherDialogOpen} onOpenChange={setVoucherDialogOpen} onSuccess={refetchVouchers} />

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

      <EditVoucherDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        voucher={editItem ? vouchers.find((v) => v.id === editItem.id) || null : null}
        onSuccess={refetchVouchers}
      />

      <VoucherDetailDialog
        open={!!viewDetailItem}
        onOpenChange={(open) => !open && setViewDetailItem(null)}
        voucher={viewDetailItem ? vouchers.find((v) => v.id === viewDetailItem.id) || null : null}
        onEdit={() => { setEditItem(viewDetailItem); setViewDetailItem(null); }}
        onDiscontinue={() => { setArchiveDialogOpen(true); setViewDetailItem(null); }}
        onDelete={() => { setDeleteDialogOpen(true); setViewDetailItem(null); }}
      />
    </SalonSidebar>
  );
}
