import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Scissors, Package, ShoppingBag, Gift, Clock, Flag, Archive, AlertTriangle, MoreVertical, Eye, Edit, Copy } from "lucide-react";
import { cn } from "@shared/utils";
import { toast } from "@ui/ui/use-toast";
import type { CatalogIntegrityIssue } from "@/hooks/useCatalogIntegrityIssues";

export type ItemType = "service" | "product" | "package" | "voucher";

export interface CatalogItem {
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export function StatusChip({ status, isFlagged }: { status?: string; isFlagged?: boolean }) {
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
}

export function SelectableItemCard({
  item,
  currency: _currency,
  formatCurrency,
  isSelected = false,
  onSelect,
  canEdit = false,
  onViewDetails,
  onEdit,
  integrityIssues = [],
}: SelectableItemCardProps) {
  const typeLabels: Record<string, { label: string; color: string; iconBg: string; iconColor: string }> = {
    service: {
      label: "SERVICE",
      color: "text-muted-foreground",
      iconBg: "bg-[#f1eafa]",
      iconColor: "text-primary",
    },
    package: {
      label: "PACKAGE",
      color: "text-muted-foreground",
      iconBg: "bg-[#e1f3ec]",
      iconColor: "text-[#268766]",
    },
    product: {
      label: "PRODUCT",
      color: "text-muted-foreground",
      iconBg: "bg-[#fff2ce]",
      iconColor: "text-[#8a6510]",
    },
    voucher: {
      label: "VOUCHER",
      color: "text-muted-foreground",
      iconBg: "bg-[#edeaf1]",
      iconColor: "text-primary",
    },
  };

  const typeInfo = typeLabels[item.type] || typeLabels.service;
  const blockingIssue = integrityIssues.find((issue) => issue.severity === "blocking");
  const warningIssue = integrityIssues.find((issue) => issue.severity === "warning");
  const firstIssue = blockingIssue || warningIssue;

  return (
    <Card className={cn(
      "rounded-[20px] border-border/60 bg-white shadow-sm transition-shadow hover:border-primary/20 hover:shadow-md",
      isSelected && "border-foreground ring-1 ring-foreground"
    )}>
      <CardContent className="p-3.5 sm:px-5 sm:py-4">
        <div className="grid grid-cols-[auto_44px_minmax(0,1fr)_auto] items-start gap-2.5 sm:flex sm:items-center sm:gap-4">
          {/* Checkbox */}
          {onSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(item.id, item.type)}
              className="mt-1 sm:mt-0"
            />
          )}

          {/* Image thumbnail */}
          {item.images && item.images.length > 0 ? (
            <img
              src={item.images[0]}
              alt={item.name}
              className="h-11 w-11 flex-shrink-0 rounded-[11px] object-cover sm:h-14 sm:w-14 sm:rounded-[12px]"
            />
          ) : (
            <div className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[11px] sm:h-14 sm:w-14 sm:rounded-[12px]",
              typeInfo.iconBg,
            )}>
              {item.type === "service" && <Scissors className={cn("h-5 w-5", typeInfo.iconColor)} />}
              {item.type === "package" && <Package className={cn("h-5 w-5", typeInfo.iconColor)} />}
              {item.type === "product" && <ShoppingBag className={cn("h-5 w-5", typeInfo.iconColor)} />}
              {item.type === "voucher" && <Gift className={cn("h-5 w-5", typeInfo.iconColor)} />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-sm font-medium sm:text-base">{item.name}</h3>
              {item.type === "voucher" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(item.name);
                    toast({ title: "Copied", description: `Voucher code ${item.name} copied to clipboard.` });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
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

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {item.duration && (
                <Badge variant="secondary" className="border-0 bg-[#eee9e1] text-xs font-normal text-muted-foreground">
                  <Clock className="w-3 h-3 mr-1" />
                  {item.duration} mins
                </Badge>
              )}
              {item.stock !== undefined && (
                <Badge variant="secondary" className="border-0 bg-[#e1f3ec] text-xs font-normal text-[#268766]">
                  {item.stock} in stock
                </Badge>
              )}
              {item.originalPrice && item.originalPrice > item.price && (
                <Badge variant="secondary" className="border-0 bg-[#eee9e1] text-xs font-normal text-muted-foreground">
                  {Math.round((1 - item.price / item.originalPrice) * 100)}% savings
                </Badge>
              )}
              {item.type === "voucher" && item.status && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "border-0 text-xs font-normal capitalize",
                    item.status === "active"
                      ? "bg-[#e1f3ec] text-[#268766]"
                      : item.status === "redeemed"
                        ? "bg-[#eee9e1] text-muted-foreground"
                        : "bg-destructive/10 text-destructive",
                  )}
                >
                  {item.status}
                </Badge>
              )}
            </div>

            <div className="mt-2 sm:hidden">
              <p className="font-serif text-base font-semibold">{formatCurrency(item.price)}</p>
              {item.originalPrice && (
                <p className="text-xs text-muted-foreground line-through">
                  {formatCurrency(item.originalPrice)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-1">
            <div className="hidden flex-shrink-0 text-right sm:block">
              <p className="font-serif text-lg font-semibold">{formatCurrency(item.price)}</p>
              {item.originalPrice && (
                <p className="text-sm text-muted-foreground line-through">
                  {formatCurrency(item.originalPrice)}
                </p>
              )}
            </div>

            {/* Three-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full sm:h-10 sm:w-10">
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
