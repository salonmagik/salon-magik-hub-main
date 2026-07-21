import { cn } from "@shared/utils";

interface SalonMagikLogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "default" | "white";
}

export function SalonMagikLogo({
  className,
  size = "md",
  showText = true,
  variant = "default",
}: SalonMagikLogoProps) {
  const isWhite = variant === "white";

  const boxSizes = { xs: 20, sm: 24, md: 28, lg: 36 };
  const textSizes = {
    xs: "text-base",
    sm: "text-[17px]",
    md: "text-[22px]",
    lg: "text-[28px]",
  };
  const boxSize = boxSizes[size];
  const iconSize = Math.round(boxSize * 0.54);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex flex-shrink-0 items-center justify-center rounded-[7px]",
          isWhite ? "bg-white/20" : "bg-brand-purple",
        )}
        style={{ width: boxSize, height: boxSize }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none">
          <path
            d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
            stroke="#F4C84E"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="16" r="2.3" fill="#fff" />
        </svg>
      </span>
      {showText && (
        <span
          className={cn(
            "font-semibold tracking-[0.3px]",
            textSizes[size],
            isWhite ? "text-white" : "text-brand-ink",
          )}
        >
          Salon Magik
        </span>
      )}
    </div>
  );
}
