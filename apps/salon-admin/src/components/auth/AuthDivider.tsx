interface AuthDividerProps {
  text?: string;
}

export function AuthDivider({ text = "Or" }: AuthDividerProps) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-card px-4 text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
