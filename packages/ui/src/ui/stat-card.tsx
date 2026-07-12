import * as React from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@shared/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";

export type StatCardTone = "default" | "success" | "warning" | "destructive" | "info";

const toneClasses: Record<StatCardTone, { bg: string; icon: string }> = {
  default: { bg: "bg-muted", icon: "text-muted-foreground" },
  success: { bg: "bg-success-bg", icon: "text-success" },
  warning: { bg: "bg-warning-bg", icon: "text-warning" },
  destructive: { bg: "bg-destructive-bg", icon: "text-destructive" },
  info: { bg: "bg-primary/10", icon: "text-primary" },
};

export interface StatCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  tone?: StatCardTone;
  href?: string;
  className?: string;
}

export function StatCard({ label, value, description, icon: Icon, tone = "default", href, className }: StatCardProps) {
  const { bg, icon } = toneClasses[tone];

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("rounded-full p-2", bg)}>
          <Icon className={cn("h-4 w-4", icon)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
        {href ? (
          <a href={href} className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
