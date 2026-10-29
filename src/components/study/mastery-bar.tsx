import { MASTERY_LABELS, MASTERY_ORDER, type MasteryLevel } from "@/lib/srs/scheduler";
import { cn } from "@/lib/utils";

export const MASTERY_COLORS: Record<MasteryLevel, string> = {
  new: "bg-slate-300 dark:bg-slate-600",
  learning: "bg-sky-400",
  shaky: "bg-amber-400",
  solid: "bg-emerald-400",
  mastered: "bg-emerald-600",
};

/** Stacked bar of the mastery distribution with an optional legend. */
export function MasteryBar({
  counts,
  total,
  legend,
  className,
}: {
  counts: Record<MasteryLevel, number>;
  total: number;
  legend?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted" role="img" aria-label={MASTERY_ORDER.map((l) => `${MASTERY_LABELS[l]}: ${counts[l]}`).join(", ")}>
        {total > 0 &&
          MASTERY_ORDER.map((l) =>
            counts[l] > 0 ? <div key={l} className={MASTERY_COLORS[l]} style={{ width: `${(counts[l] / total) * 100}%` }} title={`${MASTERY_LABELS[l]}: ${counts[l]}`} /> : null,
          )}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {MASTERY_ORDER.map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", MASTERY_COLORS[l])} aria-hidden />
              {MASTERY_LABELS[l]} <span className="font-medium text-foreground tabular-nums">{counts[l]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
      <span className={cn("size-2 rounded-full", MASTERY_COLORS[level])} aria-hidden />
      {MASTERY_LABELS[level]}
    </span>
  );
}
