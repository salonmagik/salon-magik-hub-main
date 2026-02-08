import { Scissors } from "lucide-react";
import { cn } from "@shared/utils";

interface SalonMagikLogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "default" | "white";
}

const sizes = {
  xs: { icon: 18, container: 28, text: "text-base" },
  sm: { icon: 20, container: 32, text: "text-lg" },
  md: { icon: 24, container: 40, text: "text-xl" },
  lg: { icon: 28, container: 48, text: "text-2xl" },
};

export function SalonMagikLogo({ 
  className, 
  size = "md", 
  showText = true,
  variant = "default"
}: SalonMagikLogoProps) {
  const { icon, container, text } = sizes[size];
  const isWhite = variant === "white";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div 
        className={cn(
          "flex items-center justify-center rounded-lg",
          isWhite ? "bg-white/20" : "bg-primary"
        )}
        style={{ width: container, height: container }}
      >
        <Scissors 
          className={isWhite ? "text-white" : "text-primary-foreground"} 
          size={icon} 
        />
      </div>
      {showText && (
        <span className={cn(
          "font-semibold tracking-tight",
          text,
          isWhite ? "text-white" : "text-foreground"
        )}>
          Salon Magik
        </span>
      )}
    </div>
  );
}
