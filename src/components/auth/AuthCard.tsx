import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-lg border border-border shadow-card p-6",
      className
    )}>
      {children}
    </div>
  );
}
