import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalonMagikLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizes = {
  sm: { icon: 20, container: 32, text: "text-lg" },
  md: { icon: 24, container: 40, text: "text-xl" },
  lg: { icon: 28, container: 48, text: "text-2xl" },
};

export function SalonMagikLogo({ 
  className, 
  size = "md", 
  showText = true 
}: SalonMagikLogoProps) {
  const { icon, container, text } = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div 
        className="flex items-center justify-center bg-primary rounded-lg"
        style={{ width: container, height: container }}
      >
        <Scissors className="text-primary-foreground" size={icon} />
      </div>
      {showText && (
        <span className={cn("font-semibold tracking-tight", text)}>
          Salon Magik
        </span>
      )}
    </div>
  );
}
