import { Package, Trash2, Flag, Archive, Ban } from "lucide-react";
import { Button } from "@ui/button";
import { cn } from "@shared/utils";

type ItemType = "service" | "product" | "package" | "voucher";

interface BulkActionsBarProps {
  selectedCount: number;
  itemType: ItemType;
  onCreatePackage?: () => void;
  onDelete?: () => void;
  onFlag?: () => void;
  onArchive?: () => void;
  onDiscontinue?: () => void;
  onClear: () => void;
  canDelete?: boolean;
  canArchive?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  itemType,
  onCreatePackage,
  onDelete,
  onFlag,
  onArchive,
  onDiscontinue,
  onClear,
  canDelete = false,
  canArchive = false,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  const showCreatePackage = itemType === "service" || itemType === "product";
  const showArchive = itemType !== "voucher";
  const showDiscontinue = itemType === "voucher";

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
      <div className="scrollbar-hide flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl bg-foreground px-3 py-2 text-background shadow-xl sm:gap-3 sm:rounded-full sm:px-4">
        <span className="shrink-0 whitespace-nowrap text-sm font-medium">
          {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
        </span>

        <div className="h-6 w-px shrink-0 bg-background/20" />

        <div className="flex shrink-0 items-center gap-1">
          {showCreatePackage && onCreatePackage && (
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:text-background hover:bg-background/10"
              onClick={onCreatePackage}
            >
              <Package className="w-4 h-4 mr-1.5" />
              Create Package
            </Button>
          )}

          {onFlag && (
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:text-background hover:bg-background/10"
              onClick={onFlag}
            >
              <Flag className="w-4 h-4 mr-1.5" />
              Flag
            </Button>
          )}

          {showArchive && onArchive && canArchive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:text-background hover:bg-background/10"
              onClick={onArchive}
            >
              <Archive className="w-4 h-4 mr-1.5" />
              Archive
            </Button>
          )}

          {showDiscontinue && onDiscontinue && (
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:text-background hover:bg-background/10"
              onClick={onDiscontinue}
            >
              <Ban className="w-4 h-4 mr-1.5" />
              Discontinue
            </Button>
          )}

          {onDelete && canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          )}
        </div>

        <div className="h-6 w-px shrink-0 bg-background/20" />

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-background/70 hover:bg-background/10 hover:text-background"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
