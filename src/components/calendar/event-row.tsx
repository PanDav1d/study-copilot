import Link from "next/link";
import { Brain, CalendarClock, FileText, MapPin, NotebookPen } from "lucide-react";
import { EVENT_ICONS } from "./event-icons";
import { fmtTime } from "@/lib/dates";
import { moduleColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { StudyTaskToggle } from "./study-task-toggle";
import { sessionLabel } from "@/lib/labels";


export interface EventRowData {
  id: string;
  type: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  completed: boolean;
  location: string | null;
  topic: string | null;
  module: { id: string; name: string; color: string } | null;
  note: { id: string; title: string; date: Date } | null;
  document: { id: string; title: string } | null;
}

/** Compact event line used on the dashboard, module and session pages. */
export function EventRow({ event, showDate }: { event: EventRowData; showDate?: (d: Date) => string }) {
  const Icon = EVENT_ICONS[event.type as keyof typeof EVENT_ICONS] ?? CalendarClock;
  const color = moduleColor(event.module?.color);
  const reviewHref = event.module
    ? `/review/session?module=${event.module.id}${event.topic ? `&topic=${encodeURIComponent(event.topic)}` : ""}`
    : "/review/session";

  return (
    <div className={cn("flex gap-3 rounded-md border border-l-[3px] bg-background py-2 pr-3 pl-3", color.border, event.completed && "opacity-60")}>
      <div className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        {showDate && <div className="font-medium text-foreground">{showDate(event.start)}</div>}
        {event.allDay ? "ganztägig" : <>{fmtTime(event.start)}<br />{fmtTime(event.end)}</>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <p className={cn("text-sm font-medium", event.completed && "line-through")}>{event.title}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {event.module && <Link href={`/modules/${event.module.id}`} className="hover:text-foreground">{event.module.name}</Link>}
          {event.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{event.location}</span>}
          {event.note && <Link href={`/notes/${event.note.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><NotebookPen className="size-3" />{sessionLabel(event.note)}</Link>}
          {event.document && <Link href={`/documents/${event.document.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><FileText className="size-3" />{event.document.title}</Link>}
          {event.type === "STUDY" && (
            <Link href={reviewHref} className="inline-flex items-center gap-1 font-medium text-link hover:underline">
              <Brain className="size-3" />{event.topic ? `${event.topic} lernen` : "Karten lernen"}
            </Link>
          )}
        </div>
      </div>
      {event.type === "STUDY" && <StudyTaskToggle id={event.id} completed={event.completed} />}
    </div>
  );
}
