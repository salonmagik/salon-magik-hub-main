import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function MarketingStep({ number, title, summary, open, onToggle, children }: {
  number: number;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="marketing-step">
      <button type="button" className="marketing-step-heading" aria-expanded={open} aria-controls={`marketing-step-${number}`} onClick={onToggle}>
        <span className={`marketing-step-number ${open ? "active" : ""}`}>{number}</span>
        <h2>{title}</h2>
        {!open && summary && <span className="marketing-step-summary">— {summary}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <div id={`marketing-step-${number}`} hidden={!open} className="marketing-step-body">{children}</div>
    </section>
  );
}
