import { cn } from "@shared/utils";

interface SalonMagikLogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "default" | "white";
}

const sizes = {
  xs: { box: 28, rx: 6, text: "text-base" },
  sm: { box: 32, rx: 7, text: "text-lg" },
  md: { box: 40, rx: 9, text: "text-xl" },
  lg: { box: 48, rx: 11, text: "text-2xl" },
};

export function SalonMagikLogo({
  className,
  size = "md",
  showText = true,
  variant = "default",
}: SalonMagikLogoProps) {
  const { box, rx, text } = sizes[size];
  const isWhite = variant === "white";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width={box}
        height={box}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* <rect
          width="32"
          height="32"
          rx={rx}
          fill={isWhite ? "rgba(255,255,255,0.2)" : "#2E1F4E"}
        /> */}
        <path
          d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
          stroke="#F4C84E"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="16" r="1.8" fill="#ffffff" />
      </svg>

      {showText && (
        <span
          className={cn(
            "font-semibold tracking-[0.3px]",
            text,
            isWhite ? "text-white" : "text-foreground",
          )}
        >
          Salon Magik
        </span>
      )}
    </div>
  );
}
