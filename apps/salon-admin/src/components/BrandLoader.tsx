import { useEffect, useState } from "react";
import { cn } from "@shared/utils";

interface BrandLoaderProps {
  fullScreen?: boolean;
  /** Static label override. Omit to show cycling salon phrases. */
  label?: string;
  className?: string;
  /** kept for API compatibility; has no effect */
  size?: "sm" | "md" | "lg";
}

const SALON_PHRASES = [
  "Styling...",
  "Trimming...",
  "Retouching...",
  "Blending...",
  "Finishing up...",
];

function useCyclingPhrase() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % SALON_PHRASES.length), 1000);
    return () => clearInterval(id);
  }, []);
  return SALON_PHRASES[idx];
}

export function BrandLoader({ fullScreen = false, label, className }: BrandLoaderProps) {
  const phrase = useCyclingPhrase();
  const displayText = label ?? phrase;

  const spinner = (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative h-[52px] w-[52px] loader-spin">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="morph-icon"
            style={{ animationDelay: `${-(i * 2.5)}s` }}
          >
            <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
              <path
                d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
                stroke="#F4C84E"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="16" cy="16" r="2.1" fill="hsl(var(--primary))" />
            </svg>
          </div>
        ))}
      </div>
      <p key={displayText} className="loading-text text-sm text-muted-foreground">
        {displayText}
      </p>
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
