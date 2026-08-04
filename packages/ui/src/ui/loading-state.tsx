import { Loader2 } from "lucide-react";
import { cn } from "@shared/utils";
import { BrandLoader } from "./brand-loader";
import { Skeleton } from "./skeleton";

interface PageProps {
  variant: "page";
  label?: string;
  className?: string;
}

interface SectionProps {
  variant: "section";
  label?: string;
  className?: string;
}

interface InlineProps {
  variant: "inline";
  size?: "sm" | "md";
  className?: string;
}

interface ListProps {
  variant: "list";
  rows?: number;
  avatar?: boolean;
  className?: string;
}

interface TableProps {
  variant: "table";
  rows?: number;
  columns?: number;
  className?: string;
}

interface CardsProps {
  variant: "cards";
  count?: number;
  className?: string;
}

export type LoadingStateProps = PageProps | SectionProps | InlineProps | ListProps | TableProps | CardsProps;

/**
 * One shared loading component for every "data isn't here yet" moment.
 *
 * - page / section use the real brand mark (BrandLoader) — page for a
 *   route's first load, section for a card/tab/panel mid-page.
 * - inline is a plain Loader2 spin for buttons/small async actions — the
 *   mark is too detailed at that size.
 * - list / table / cards are Skeleton-based shape previews for content
 *   whose layout you already know, to avoid a spinner-to-content jump.
 *
 * Never render nothing while loading (no `return null`) — always reach
 * for one of these instead.
 */
export function LoadingState(props: LoadingStateProps) {
  switch (props.variant) {
    case "page":
      return <BrandLoader fullScreen label={props.label} className={props.className} />;

    case "section":
      return (
        <div className={cn("flex items-center justify-center py-10", props.className)}>
          <BrandLoader label={props.label} className="scale-75" />
        </div>
      );

    case "inline": {
      const size = props.size === "md" ? "h-5 w-5" : "h-4 w-4";
      return <Loader2 className={cn(size, "animate-spin", props.className)} />;
    }

    case "list": {
      const rows = props.rows ?? 4;
      return (
        <div className={cn("flex flex-col gap-4", props.className)}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              {props.avatar !== false && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "table": {
      const rows = props.rows ?? 5;
      const columns = props.columns ?? 4;
      return (
        <div className={cn("w-full", props.className)}>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 border-b py-3 last:border-b-0">
              {Array.from({ length: columns }).map((__, c) => (
                <Skeleton key={c} className={cn("h-3 flex-1", c === 0 && "flex-[1.5]")} />
              ))}
            </div>
          ))}
        </div>
      );
    }

    case "cards": {
      const count = props.count ?? 3;
      return (
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", props.className)}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}
