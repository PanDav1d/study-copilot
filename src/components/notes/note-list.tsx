import Link from "next/link";
import { FileText, Layers, PenLine } from "lucide-react";
import { parseRows } from "@/lib/cornell";
import { fmtDate } from "@/lib/dates";
import { sessionSteps } from "@/lib/gamification";
import { excerpt } from "@/lib/utils";
import { Badge, ModuleTag } from "@/components/ui/misc";
import { StepDots } from "./session-steps";

export interface SessionRow {
  id: string;
  title: string;
  date: Date;
  summary: string;
  sections: string;
  recallAt: Date | null;
  module?: { id: string; name: string; color: string };
  _count: { flashcards: number; documents: number };
}

/** List of sessions: date first, topic, Cornell progress. */
export function NoteList({ notes, showModule = false }: { notes: SessionRow[]; showModule?: boolean }) {
  const now = new Date();
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      {notes.map((n) => {
        const steps = sessionSteps({ rows: parseRows(n.sections), summary: n.summary, recallAt: n.recallAt, cardCount: n._count.flashcards });
        const missingSummary = !n.summary.trim() && n.date <= now;
        return (
          <li key={n.id}>
            <Link href={`/notes/${n.id}${missingSummary ? "?focus=summary" : ""}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50">
              <div className="w-11 shrink-0 text-center">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">{fmtDate(n.date, "EE")}</div>
                <div className="text-sm font-semibold tabular-nums">{fmtDate(n.date, "dd.MM.")}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{n.title.trim() || <span className="text-muted-foreground">Ohne Thema</span>}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {n.summary.trim() ? excerpt(n.summary, 120) : fmtDate(n.date, "EEEE, d. MMMM yyyy")}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {showModule && n.module && <ModuleTag name={n.module.name} color={n.module.color} />}
                {missingSummary && <Badge tone="warning"><PenLine />Zusammenfassung</Badge>}
                {n._count.flashcards > 0 && <Badge><Layers />{n._count.flashcards}</Badge>}
                {n._count.documents > 0 && <Badge><FileText />{n._count.documents}</Badge>}
              </div>
              <StepDots steps={steps} className="shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
