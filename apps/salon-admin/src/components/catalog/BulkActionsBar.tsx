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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-foreground text-background rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
        <span className="text-sm font-medium">
          {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
        </span>

        <div className="w-px h-6 bg-background/20" />

        <div className="flex items-center gap-1">
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

        <div className="w-px h-6 bg-background/20" />

        <Button
          variant="ghost"
          size="sm"
          className="text-background/70 hover:text-background hover:bg-background/10"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
