interface CountryLaunchStripProps {
  isEnabled: boolean;
  onOpenInterest: () => void;
}

export function CountryLaunchStrip({ isEnabled, onOpenInterest }: CountryLaunchStripProps) {
  if (!isEnabled) return null;

  return (
    <section className="border-y bg-muted/20 px-4 py-5">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-sm font-medium text-foreground">
          We are live in 🇳🇬 🇬🇭, coming soon to{" "}
          <button
            type="button"
            onClick={onOpenInterest}
            className="underline decoration-primary underline-offset-4 hover:text-primary"
          >
            other countries
          </button>
          .
        </p>
      </div>
    </section>
  );
}
