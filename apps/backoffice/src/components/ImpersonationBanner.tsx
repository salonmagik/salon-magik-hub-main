import { useImpersonation } from "@/hooks";
import { Button } from "@ui/button";
import { Eye, X } from "lucide-react";
import { cn } from "@shared/utils";

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedTenantName, endImpersonation } = useImpersonation();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-warning text-warning-foreground">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4" />
          <span className="text-sm font-medium">
            Viewing as: <strong>{impersonatedTenantName}</strong> (Read-only)
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={endImpersonation}
          className="text-warning-foreground hover:bg-warning/80"
        >
          <X className="w-4 h-4 mr-1" />
          End Session
        </Button>
      </div>
    </div>
  );
}

interface ReadOnlyOverlayProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps content and prevents all interactions when impersonating.
 * Use this around interactive elements in salon pages.
 */
export function ReadOnlyOverlay({ children, className }: ReadOnlyOverlayProps) {
  const { isImpersonating } = useImpersonation();

  if (!isImpersonating) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      {/* Overlay that blocks all pointer events */}
      <div 
        className="absolute inset-0 z-10 cursor-not-allowed"
        onClick={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}
