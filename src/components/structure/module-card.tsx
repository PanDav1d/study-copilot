import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EXAM_TYPES, moduleColor, type ExamType } from "@/lib/constants";
import { fmtDate, fmtDaysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function ModuleCard({
  module,
}: {
  module: {
    id: string;
    name: string;
    code: string | null;
    color: string;
    ects: number | null;
    examDate: Date | null;
    examType: string | null;
    _count: { notes: number; flashcards: number; documents: number };
  };
}) {
  const color = moduleColor(module.color);
  const upcoming = module.examDate && module.examDate >= new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <Link href={`/modules/${module.id}`} className={cn("group block rounded-xl border border-l-4 bg-card p-4 shadow-xs transition-colors hover:bg-accent/50", color.border)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium group-hover:underline">{module.name}</p>
          <p className="text-xs text-muted-foreground">
            {[module.code, module.ects != null ? `${module.ects} ECTS` : null].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs text-muted-foreground">
        {[
          ["Sitzungen", module._count.notes],
          ["Karten", module._count.flashcards],
          ["PDFs", module._count.documents],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-md bg-muted/60 py-1">
            <div className="text-sm font-semibold text-foreground tabular-nums">{n}</div>
            {label}
          </div>
        ))}
      </div>
      {module.examDate && (
        <p className={cn("mt-3 flex items-center gap-1.5 text-xs", upcoming ? "text-foreground" : "text-muted-foreground")}>
          <CalendarClock className="size-3.5" aria-hidden />
          {module.examType ? EXAM_TYPES[module.examType as ExamType] : "Prüfung"} am {fmtDate(module.examDate)}
          {upcoming && <span className="text-muted-foreground">({fmtDaysUntil(module.examDate)})</span>}
        </p>
      )}
    </Link>
  );
}
