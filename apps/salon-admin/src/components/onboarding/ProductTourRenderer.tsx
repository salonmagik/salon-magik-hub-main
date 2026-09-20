import { Joyride, type EventData, type Step, type TooltipRenderProps } from "react-joyride";
import { X } from "lucide-react";

interface ProductTourRendererProps {
  steps: Step[];
  run: boolean;
  onEvent: (data: EventData) => void;
}

// Brand tooltip matching the approved artifact: dark purple card, gold
// eyebrow/accent, rounded corners, dot progress indicator.
function ProductTourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  skipProps,
  size,
  step,
}: TooltipRenderProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "relative",
        width: 360,
        maxWidth: "calc(100vw - 24px)",
        background: "#2E1F4E",
        borderRadius: 20,
        padding: "22px 22px 18px",
        boxShadow: "0 24px 48px rgba(20, 12, 36, 0.4)",
        fontFamily: "inherit",
      }}
    >
      <button
        {...closeProps}
        aria-label="Close"
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "none",
          border: "none",
          padding: 4,
          color: "rgba(255,255,255,0.55)",
          cursor: "pointer",
          lineHeight: 0,
        }}
      >
        <X size={16} />
      </button>

      <p
        style={{
          margin: "0 0 8px",
          color: "#F4C84E",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Step {index + 1} of {size}
      </p>

      {step.title && (
        <h4
          style={{
            margin: "0 0 8px",
            color: "#fff",
            fontSize: 17,
            fontWeight: 650,
            lineHeight: 1.3,
          }}
        >
          {step.title}
        </h4>
      )}

      <div
        style={{
          margin: "0 0 20px",
          color: "#C9C2DC",
          fontSize: 13.5,
          lineHeight: 1.55,
        }}
      >
        {step.content}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 5 }} aria-label={`Step ${index + 1} of ${size}`}>
          {Array.from({ length: size }).map((_, dotIndex) => (
            <span
              key={dotIndex}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dotIndex === index ? "#F4C84E" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, whiteSpace: "nowrap" }}>
          {index > 0 && (
            <button
              {...backProps}
              style={{
                background: "none",
                border: "none",
                color: "#C9C2DC",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
                whiteSpace: "nowrap",
              }}
            >
              Back
            </button>
          )}
          {!isLastStep && (
            <button
              {...skipProps}
              style={{
                background: "none",
                border: "none",
                color: "#C9C2DC",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
                whiteSpace: "nowrap",
              }}
            >
              Skip tour
            </button>
          )}
          <button
            {...primaryProps}
            style={{
              background: "#F4C84E",
              color: "#2E1F4E",
              fontWeight: 650,
              fontSize: 13.5,
              padding: "9px 20px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Split into its own dynamically-imported chunk so react-joyride (~25-30KB
// gzipped with its floating-ui dependency) only downloads once a tour
// actually starts, instead of shipping in the main bundle for every user.
export default function ProductTourRenderer({ steps, run, onEvent }: ProductTourRendererProps) {
  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={onEvent}
      tooltipComponent={ProductTourTooltip}
      styles={{
        spotlight: { stroke: "#F4C84E", strokeWidth: 2 },
      }}
      options={{
        zIndex: 10000,
        spotlightRadius: 12,
        skipBeacon: true,
      }}
    />
  );
}
