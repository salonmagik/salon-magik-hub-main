import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Card, CardContent } from "@ui/card";
import { Checkbox } from "@ui/checkbox";
import { Skeleton } from "@ui/skeleton";
import { Scissors, Package, ShoppingBag, Gift, Loader2 } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import type { BinItem, BinItemType } from "@/hooks/useBinItems";

interface CatalogBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binItems: BinItem[];
  binLoading: boolean;
  restoreItem: (id: string, type: BinItemType, opts?: { silent?: boolean; skipRefetch?: boolean }) => Promise<boolean>;
  permanentlyDeleteItem: (id: string, type: BinItemType, opts?: { silent?: boolean; skipRefetch?: boolean }) => Promise<boolean>;
  refetchBinItems: () => Promise<void> | void;
  /** Refetch whatever this page's own single-type resource list is, since a restore/delete here can affect it. */
  onChanged: () => Promise<void> | void;
  canRestore: boolean;
  canDelete: boolean;
}

const makeBinKey = (item: { id: string; type: BinItemType }) => `${item.type}:${item.id}`;

export function CatalogBinDialog({
  open,
  onOpenChange,
  binItems,
  binLoading,
  restoreItem,
  permanentlyDeleteItem,
  refetchBinItems,
  onChanged,
  canRestore,
  canDelete,
}: CatalogBinDialogProps) {
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<Array<{ id: string; name: string; type: BinItemType }>>([]);
  const isBusy = processingItemId !== null;

  const refetchAfterChange = async () => {
    await Promise.all([refetchBinItems(), onChanged()]);
  };

  const confirmPermanentDelete = async () => {
    if (deleteTargets.length === 0) return;
    setProcessingItemId(deleteTargets.length === 1 ? deleteTargets[0].id : "__bulk_delete__");
    let deletedCount = 0;
    for (const item of deleteTargets) {
      const deleted = await permanentlyDeleteItem(item.id, item.type, { silent: true, skipRefetch: true });
      if (deleted) deletedCount++;
    }
    await refetchAfterChange();
    setProcessingItemId(null);
    setDeleteTargets([]);
    setSelectedKeys(new Set());
    setSelectMode(false);
    toast({
      title: "Delete complete",
      description: deletedCount > 0 ? `${deletedCount} item(s) permanently deleted.` : "No selected items were deleted.",
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) {
            setSelectMode(false);
            setSelectedKeys(new Set());
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] gap-0 rounded-[22px] border-0 sm:max-h-[88vh] sm:max-w-[640px]">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-[24px] font-medium tracking-[-0.3px]">Bin</DialogTitle>
            <DialogDescription className="text-[14px] leading-5">
              Restore deleted services, products, packages, and vouchers within 7 days.
            </DialogDescription>
            <div className="pt-1 text-[13px] text-muted-foreground">Total: {binItems.length}</div>
          </DialogHeader>

          <div className={cn(DIALOG_BODY_PADDING, isBusy && "pointer-events-none opacity-60")}>
            {!binLoading && binItems.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    className="h-9 rounded-full border-[#141014]/10 px-4 font-normal"
                    onClick={() => {
                      if (selectMode) {
                        setSelectMode(false);
                        setSelectedKeys(new Set());
                        return;
                      }
                      setSelectMode(true);
                    }}
                  >
                    {selectMode ? "Cancel select" : "Select"}
                  </Button>
                  {selectMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      className="h-9 rounded-full border-[#141014]/10 px-4 font-normal"
                      onClick={() => {
                        if (selectedKeys.size === binItems.length) {
                          setSelectedKeys(new Set());
                          return;
                        }
                        setSelectedKeys(new Set(binItems.map((item) => makeBinKey(item))));
                      }}
                    >
                      {selectedKeys.size === binItems.length ? "Clear all" : "Select all"}
                    </Button>
                  )}
                </div>

                {selectMode && selectedKeys.size > 0 && (
                  <div className="scrollbar-hide flex w-full items-center gap-2 overflow-x-auto sm:w-auto">
                    <span className="shrink-0 text-[13px] text-[#141014]/60">{selectedKeys.size} selected</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canRestore || isBusy}
                      className="h-9 shrink-0 rounded-full border-[#141014]/10 px-4 font-normal"
                      onClick={async () => {
                        const selected = binItems.filter((item) => selectedKeys.has(makeBinKey(item)));
                        setProcessingItemId("__bulk_restore__");
                        let restoredCount = 0;
                        for (const item of selected) {
                          const expiresAt = new Date(new Date(item.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000);
                          if (expiresAt.getTime() <= Date.now()) continue;
                          const restored = await restoreItem(item.id, item.type, { silent: true, skipRefetch: true });
                          if (restored) restoredCount++;
                        }
                        await refetchAfterChange();
                        setProcessingItemId(null);
                        setSelectedKeys(new Set());
                        setSelectMode(false);
                        toast({
                          title: "Restore complete",
                          description: restoredCount > 0 ? `${restoredCount} item(s) restored.` : "No selected items could be restored.",
                        });
                      }}
                    >
                      {processingItemId === "__bulk_restore__" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        "Restore selected"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canDelete || isBusy}
                      className="h-9 shrink-0 rounded-full bg-[#a23b3b] px-4 font-normal text-white hover:bg-[#8f3030]"
                      onClick={() => {
                        setDeleteTargets(
                          binItems
                            .filter((item) => selectedKeys.has(makeBinKey(item)))
                            .map((item) => ({ id: item.id, name: item.name, type: item.type })),
                        );
                      }}
                    >
                      {processingItemId === "__bulk_delete__" ? (
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
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-[340px] rounded-[22px]" />
                ))}
              </div>
            ) : binItems.length === 0 ? (
              <div className="rounded-[14px] border border-[#141014]/[0.06] px-5 py-[60px] text-center text-sm text-[#141014]/42">
                Bin is empty.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {binItems.map((item) => {
                  const expiresAt = new Date(new Date(item.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000);
                  const remainingMs = expiresAt.getTime() - Date.now();
                  const canStillRestore = remainingMs > 0;
                  const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

                  return (
                    <Card key={`${item.type}-${item.id}`} className="relative overflow-hidden rounded-[22px] border-[#141014]/[0.06] shadow-none">
                      <CardContent className="p-0">
                        {selectMode && (
                          <Checkbox
                            aria-label={`Select ${item.name}`}
                            checked={selectedKeys.has(makeBinKey(item))}
                            onCheckedChange={(checked) => {
                              setSelectedKeys((prev) => {
                                const next = new Set(prev);
                                const key = makeBinKey(item);
                                if (checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                            className="absolute right-3.5 top-3.5 z-10 h-6 w-6 rounded-[7px] border-[#141014]/15 bg-white data-[state=checked]:border-[#2e1f4e] data-[state=checked]:bg-[#2e1f4e]"
                          />
                        )}
                        {item.image_urls && item.image_urls.length > 0 ? (
                          <img src={item.image_urls[0]} alt={item.name} className="h-[150px] w-full object-cover" />
                        ) : (
                          <div className="flex h-[150px] w-full items-center justify-center bg-[#f2eefa] text-[#2e1f4e]">
                            {item.type === "service" && <Scissors className="h-10 w-10" />}
                            {item.type === "product" && <ShoppingBag className="h-10 w-10" />}
                            {item.type === "package" && <Package className="h-10 w-10" />}
                            {item.type === "voucher" && <Gift className="h-10 w-10" />}
                          </div>
                        )}
                        <div className="p-[18px] sm:px-5">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-[17px] font-normal leading-tight text-[#141014]">{item.name}</h4>
                              {item.description ? (
                                <p className="mt-1 line-clamp-2 text-xs text-[#141014]/50">{item.description}</p>
                              ) : null}
                            </div>
                            <Badge variant="secondary" className="shrink-0 border-0 bg-[#f1ece3] px-3 font-normal capitalize text-[#141014]/60">
                              {item.type}
                            </Badge>
                          </div>
                          <div className="mb-3 text-[13px] text-[#141014]/60">
                            {canStillRestore ? `${remainingDays} day(s) left before permanent deletion` : "Restore window expired"}
                          </div>
                          {item.location_names && item.location_names.length > 0 && (
                            <div className="mb-4 flex flex-wrap gap-1.5">
                              {item.location_names.map((locationName) => (
                                <Badge key={`${item.id}-${locationName}`} variant="secondary" className="bg-[#f2eefa] px-3 font-normal text-[#2e1f4e]">
                                  {locationName}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-full border-[#141014]/10 px-4 font-normal"
                              disabled={selectMode || !canRestore || !canStillRestore || isBusy}
                              onClick={async () => {
                                setProcessingItemId(item.id);
                                await restoreItem(item.id, item.type);
                                await refetchAfterChange();
                                setProcessingItemId(null);
                              }}
                            >
                              {processingItemId === item.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Working...
                                </>
                              ) : (
                                "Restore"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              className="h-9 rounded-full bg-[#f7e5e5] px-4 font-normal text-[#a23b3b] hover:bg-[#f3dada]"
                              disabled={selectMode || !canDelete || isBusy}
                              onClick={() => setDeleteTargets([{ id: item.id, name: item.name, type: item.type }])}
                            >
                              {processingItemId === item.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                "Delete now"
                              )}
                            </Button>
                          </div>
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

      <DeleteConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next && !isBusy) setDeleteTargets([]);
        }}
        itemName={deleteTargets[0]?.name || ""}
        itemCount={deleteTargets.length}
        onConfirm={confirmPermanentDelete}
        isLoading={isBusy}
        description="This permanently removes the selected item(s). This action cannot be undone."
      />
    </>
  );
}
