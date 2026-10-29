import Link from "next/link";
import { ClipboardCheck, Clock } from "lucide-react";
import { fmtGrade, germanGrade } from "@/lib/exam";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ModuleTag } from "@/components/ui/misc";
import type { ExamListItem } from "@/server/queries/exams";

/** Practice exams with their best result (grade estimate). */
export function ExamList({ exams, showModule = true }: { exams: ExamListItem[]; showModule?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      {exams.map((e) => (
        <li key={e.id}>
          <Link href={`/exams/${e.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
              <ClipboardCheck className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{e.questionCount} Aufgaben · {e.maxPoints} P.</span>
                {e.timeLimit && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{e.timeLimit} min</span>}
                <span>{e.attemptCount ? `${e.attemptCount}× geschrieben, zuletzt ${fmtRelative(e.lastAt!)}` : "Noch nicht geschrieben"}</span>
              </p>
            </div>
            {showModule && <ModuleTag name={e.module.name} color={e.module.color} className="hidden sm:inline-flex" />}
            <GradeChip percent={e.best} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GradeChip({ percent, className }: { percent: number | null; className?: string }) {
  if (percent === null) return <span className={cn("w-14 shrink-0 text-center text-xs text-muted-foreground", className)}>–</span>;
  const grade = germanGrade(percent);
  return (
    <span
      className={cn(
        "flex w-14 shrink-0 flex-col items-center rounded-lg border py-1",
        grade <= 2 ? "border-success/30 bg-success/8 text-success" : grade <= 4 ? "bg-background" : "border-danger/30 bg-danger/8 text-danger",
        className,
      )}
      title="Beste Notenschätzung"
    >
      <span className="text-sm leading-none font-semibold tabular-nums">{fmtGrade(grade)}</span>
      <span className="mt-0.5 text-[10px] leading-none tabular-nums opacity-80">{Math.round(percent)} %</span>
    </span>
  );
}
