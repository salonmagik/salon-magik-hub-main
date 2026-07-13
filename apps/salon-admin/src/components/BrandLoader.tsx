import { Scissors } from "lucide-react";
import { cn } from "@shared/utils";

interface BrandLoaderProps {
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  label?: string;
  className?: string;
}

const config = {
  sm: { ring: 36, icon: 16, gap: 2 },
  md: { ring: 52, icon: 22, gap: 3 },
  lg: { ring: 68, icon: 28, gap: 3 },
};

export function BrandLoader({ size = "md", fullScreen = false, label, className }: BrandLoaderProps) {
  const { ring, icon, gap } = config[size];

  const spinner = (
    <div className={cn("flex flex-col items-center", `gap-${gap}`, className)}>
      <div className="relative" style={{ width: ring, height: ring }}>
        {/* rotating ring */}
        <svg
          className="absolute inset-0 animate-spin"
          width={ring}
          height={ring}
          viewBox={`0 0 ${ring} ${ring}`}
          fill="none"
        >
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={ring / 2 - 3}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * (ring - 6) * 0.75} ${Math.PI * (ring - 6) * 0.25}`}
            className="text-primary"
          />
        </svg>
        {/* scissors mark */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full bg-primary/10"
        >
          <Scissors size={icon} className="text-primary" />
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {spinner}
      </div>
    );
  }

  return spinner;
}
