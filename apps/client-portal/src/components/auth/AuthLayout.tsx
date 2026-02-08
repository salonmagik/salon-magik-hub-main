import { ReactNode } from "react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen auth-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <SalonMagikLogo size="lg" />
        </div>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold italic mb-2">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
