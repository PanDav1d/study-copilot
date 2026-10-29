import { Check } from "lucide-react";
import { STEP_INFO, STEP_ORDER, type StepKey } from "@/lib/gamification";
import { cn } from "@/lib/utils";

/** Five small segments – the Cornell 5R progress of a session at a glance. */
export function StepDots({ steps, className }: { steps: Record<StepKey, boolean>; className?: string }) {
  const done = STEP_ORDER.filter((k) => steps[k]).length;
  return (
    <div className={cn("flex items-center gap-1", className)} role="img" aria-label={`${done} von 5 Schritten erledigt`}>
      {STEP_ORDER.map((k) => (
        <span key={k} title={`${STEP_INFO[k].label}${steps[k] ? " ✓" : ""}`} className={cn("h-1.5 w-4 rounded-full", steps[k] ? "bg-success" : "bg-border")} />
      ))}
    </div>
  );
}

/** Full stepper for the session page: Mitschrift → Fragen → Abfragen → Zusammenfassung → Karteikarten. */
export function StepBar({ steps, active, onSelect }: { steps: Record<StepKey, boolean>; active: StepKey | null; onSelect?: (k: StepKey) => void }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Cornell-Methode in 5 Schritten">
      {STEP_ORDER.map((k, i) => (
        <li key={k}>
          <button
            type="button"
            onClick={() => onSelect?.(k)}
            className={cn("group flex w-full flex-col gap-1.5 text-left", !onSelect && "cursor-default")}
            aria-current={active === k ? "step" : undefined}
          >
            <span className={cn("h-1 rounded-full transition-colors", steps[k] ? "bg-success" : active === k ? "bg-foreground" : "bg-border")} />
            <span className={cn("flex items-center gap-1 truncate text-xs", steps[k] ? "text-foreground" : active === k ? "font-medium text-foreground" : "text-muted-foreground")}>
              {steps[k] ? <Check className="size-3 shrink-0 text-success" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}.</span>}
              <span className="truncate">{STEP_INFO[k].short}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
