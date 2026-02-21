import { CheckCircle2 } from "lucide-react";
import { cn } from "@shared/utils";

interface ValidationChecklistItem {
  label: string;
  passed: boolean;
}

interface ValidationChecklistProps {
  items: ValidationChecklistItem[];
  className?: string;
}

export function ValidationChecklist({ items, className }: ValidationChecklistProps) {
  return (
    <div className={cn("rounded-lg border bg-muted/30 p-3", className)}>
      <p className="mb-2 text-sm font-medium">Password requirements</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              "flex items-center gap-2 text-sm",
              item.passed ? "text-green-600" : "text-muted-foreground"
            )}
          >
            <CheckCircle2
              className={cn("h-4 w-4", item.passed ? "text-green-600" : "text-muted-foreground/50")}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
