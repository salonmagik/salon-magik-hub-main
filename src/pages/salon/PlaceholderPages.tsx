// Placeholder pages - most have been moved to dedicated files
// This file is kept only for any remaining placeholder components

import { SalonSidebar } from "@/components/layout/SalonSidebar";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <SalonSidebar>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center justify-center h-[60vh] bg-surface rounded-lg border border-dashed border-border">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium mb-2">{title} Module</p>
            <p className="text-sm">This module is under development</p>
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
