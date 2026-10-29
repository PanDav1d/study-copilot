"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { Brain, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { EventDialog, defaultEventValues, type EventValues } from "@/components/forms/event-dialog";
import { EVENT_TYPES, moduleColor, type EventType } from "@/lib/constants";
import { fmtTime, parseLocalDate, toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { StudyPlanButton } from "./study-plan-dialog";
import type { CalendarItem } from "@/server/queries/calendar";
import { EVENT_ICONS } from "./event-icons";
import { ImportDialog } from "./import-dialog";
import { sessionLabel } from "@/lib/labels";

const HOURS_START = 7;
const HOURS_END = 21;
const HOUR_PX = 48;

function dayKey(d: Date) {
  return toDateInput(d);
}

function toValues(i: CalendarItem): EventValues {
  return {
    id: i.id,
    type: i.type as EventType,
    title: i.title,
    description: i.description,
    location: i.location,
    start: new Date(i.start),
    end: new Date(i.end),
    allDay: i.allDay,
    moduleId: i.module?.id ?? null,
    noteId: i.note?.id ?? null,
    documentId: i.document?.id ?? null,
    topic: i.topic,
    seriesId: i.seriesId,
  };
}

function Chip({ item, onOpen, compact }: { item: CalendarItem; onOpen: (i: CalendarItem) => void; compact?: boolean }) {
  const color = moduleColor(item.module?.color ?? "slate");
  const Icon = EVENT_ICONS[item.type as keyof typeof EVENT_ICONS];
  const exam = item.kind === "exam";
  const content = (
    <>
      {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
      {!item.allDay && !compact && <span className="tabular-nums opacity-70">{fmtTime(new Date(item.start))}</span>}
      <span className={cn("truncate", item.completed && "line-through")}>{item.title}</span>
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-1 rounded px-1 py-px text-left text-[0.7rem] leading-4 font-medium",
    exam ? "bg-danger text-white" : color.soft,
    item.completed && "opacity-60",
  );
  if (exam) return <Link href={`/modules/${item.module!.id}`} className={cls} onClick={(e) => e.stopPropagation()}>{content}</Link>;
  return (
    <button type="button" className={cls} onClick={(e) => { e.stopPropagation(); onOpen(item); }}>
      {content}
    </button>
  );
}

export function CalendarView({
  view,
  anchor,
  from,
  to,
  items,
  dueByDay,
  topicOptions,
}: {
  view: "month" | "week";
  anchor: string;
  from: string;
  to: string;
  items: CalendarItem[];
  dueByDay: Record<string, number>;
  topicOptions: Record<string, string[]>;
}) {
  const router = useRouter();
  const anchorDate = parseLocalDate(anchor)!;
  const [selected, setSelected] = useState<Date>(() => (isSameMonth(new Date(), anchorDate) || view === "week" ? new Date() : anchorDate));
  const [dialog, setDialog] = useState<EventValues | null>(null);
  const [importing, setImporting] = useState(false);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = parseLocalDate(from)!; d < parseLocalDate(to)!; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const i of items) {
      const s = new Date(i.start);
      const e = new Date(i.end);
      for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= e; d = addDays(d, 1)) {
        (map[dayKey(d)] ??= []).push(i);
      }
    }
    return map;
  }, [items]);

  const nav = (dir: -1 | 0 | 1) => {
    const date = dir === 0 ? new Date() : view === "month" ? addMonths(anchorDate, dir) : addWeeks(anchorDate, dir);
    router.push(`/calendar?view=${view}&date=${toDateInput(date)}`, { scroll: false });
  };
  const open = (i: CalendarItem) => setDialog(toValues(i));
  const create = (day: Date, hour?: number) => {
    const start = new Date(day);
    if (hour !== undefined) start.setHours(hour, 0, 0, 0);
    setDialog(defaultEventValues(start));
  };

  const title = view === "month"
    ? format(anchorDate, "MMMM yyyy", { locale: de })
    : `${format(days[0]!, "dd.MM.", { locale: de })} – ${format(days[6]!, "dd.MM.yyyy", { locale: de })}`;
  const selectedItems = byDay[dayKey(selected)] ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight capitalize">{title}</h1>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["month", "week"] as const).map((v) => (
            <Link key={v} href={`/calendar?view=${v}&date=${anchor}`} scroll={false} className={cn("rounded-md px-3 py-1 text-[13px] font-medium transition-colors", view === v ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              {v === "month" ? "Monat" : "Woche"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon-sm" onClick={() => nav(-1)} aria-label="Zurück"><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => nav(0)}>Heute</Button>
          <Button variant="secondary" size="icon-sm" onClick={() => nav(1)} aria-label="Weiter"><ChevronRight className="size-4" /></Button>
        </div>
        <StudyPlanButton variant="secondary" />
        <Button variant="secondary" size="sm" onClick={() => setImporting(true)} title="Stundenplan aus .ics-Datei oder Rapla-Link übernehmen"><Download className="size-4" /> Importieren</Button>
        <Button size="sm" onClick={() => create(selected)}><Plus className="size-4" /> Termin</Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(EVENT_TYPES).map(([k, label]) => {
          const Icon = EVENT_ICONS[k as keyof typeof EVENT_ICONS];
          return <span key={k} className="inline-flex items-center gap-1"><Icon className="size-3" />{label}</span>;
        })}
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" />Prüfung</span>
        <span className="inline-flex items-center gap-1"><Brain className="size-3" />fällige Karten</span>
      </div>

      {view === "month" ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay[dayKey(d)] ?? [];
              const due = dueByDay[dayKey(d)] ?? 0;
              const inMonth = isSameMonth(d, anchorDate);
              const isSel = isSameDay(d, selected);
              return (
                <div
                  key={d.toISOString()}
                  role="button"
                  tabIndex={0}
                  aria-label={`${format(d, "EEEE, d. MMMM", { locale: de })}: ${list.length} Termin${list.length === 1 ? "" : "e"}${due ? `, ${due} Karten fällig` : ""}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(d)}
                  onDoubleClick={() => create(d)}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelected(d); }}
                  className={cn(
                    "min-h-16 border-r border-b p-1 text-left outline-none last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                    isSel && "ring-2 ring-primary ring-inset",
                  )}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums", isToday(d) && "bg-primary text-primary-foreground")}>{format(d, "d")}</span>
                    {due > 0 && <span className="inline-flex items-center gap-0.5 text-[0.65rem] text-muted-foreground" title={`${due} Karten fällig`}><Brain className="size-3" />{due}</span>}
                  </div>
                  <div className="hidden space-y-0.5 sm:block">
                    {list.slice(0, 3).map((i) => <Chip key={i.id} item={i} onOpen={open} />)}
                    {list.length > 3 && <p className="px-1 text-[0.65rem] text-muted-foreground">+{list.length - 3} weitere</p>}
                  </div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 4).map((i) => <span key={i.id} className={cn("size-1.5 rounded-full", i.kind === "exam" ? "bg-danger" : moduleColor(i.module?.color ?? "slate").dot)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <WeekGrid days={days} byDay={byDay} dueByDay={dueByDay} onOpen={open} onCreate={create} />
      )}

      {/* Agenda of the selected day (month view) */}
      {view === "month" && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{format(selected, "EEEE, d. MMMM", { locale: de })}</h2>
            <div className="flex gap-2">
              {(dueByDay[dayKey(selected)] ?? 0) > 0 && isToday(selected) && (
                <Link href="/review/session" className={buttonClass("subtle", "sm")}><Brain className="size-3.5" /> {dueByDay[dayKey(selected)]} Karten lernen</Link>
              )}
              <Button variant="secondary" size="sm" onClick={() => create(selected)}><Plus className="size-3.5" /> Termin</Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog(defaultEventValues(new Date(new Date(selected).setHours(17)), { type: "STUDY" }))}><Brain className="size-3.5" /> Lerneinheit</Button>
            </div>
          </div>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Termine.{(dueByDay[dayKey(selected)] ?? 0) > 0 && ` ${dueByDay[dayKey(selected)]} Karten werden fällig.`}</p>
          ) : (
            <ul className="space-y-2">
              {selectedItems.map((i) => (
                <li key={i.id}>
                  <AgendaItem item={i} onOpen={open} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {importing && <ImportDialog open onOpenChange={setImporting} />}
      {dialog && (
        <EventDialog
          key={dialog.id ?? dialog.start.toISOString()}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initial={dialog}
          topicOptions={topicOptions}
        />
      )}
    </div>
  );
}

function AgendaItem({ item, onOpen }: { item: CalendarItem; onOpen: (i: CalendarItem) => void }) {
  const Icon = EVENT_ICONS[item.type as keyof typeof EVENT_ICONS];
  const color = moduleColor(item.module?.color ?? "slate");
  const body = (
    <>
      <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
        {item.allDay ? "ganztägig" : `${fmtTime(new Date(item.start))} – ${fmtTime(new Date(item.end))}`}
      </span>
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", item.completed && "line-through")}>{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[item.module?.name, item.location, item.note && sessionLabel(item.note), item.topic && `Thema: ${item.topic}`].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
  const cls = cn("flex w-full items-center gap-3 rounded-lg border-l-[3px] bg-card px-3 py-2 text-left shadow-xs hover:bg-muted/50", item.kind === "exam" ? "border-danger" : color.border);
  return item.kind === "exam" ? (
    <Link href={`/modules/${item.module!.id}`} className={cls}>{body}</Link>
  ) : (
    <div className={cn(cls, "pr-2")}>
      <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">{body}</button>
      {item.type === "STUDY" && item.module && (
        <Link href={`/review/session?module=${item.module.id}${item.topic ? `&topic=${encodeURIComponent(item.topic)}&mode=cram` : ""}`} className={buttonClass("subtle", "sm")}>Lernen</Link>
      )}
      {item.note && <Link href={`/notes/${item.note.id}`} className={buttonClass("ghost", "sm")}>Mitschrift</Link>}
    </div>
  );
}

function WeekGrid({
  days,
  byDay,
  dueByDay,
  onOpen,
  onCreate,
}: {
  days: Date[];
  byDay: Record<string, CalendarItem[]>;
  dueByDay: Record<string, number>;
  onOpen: (i: CalendarItem) => void;
  onCreate: (d: Date, hour?: number) => void;
}) {
  const hours = Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);
  return (
    <>
      {/* Mobile: agenda per day */}
      <div className="space-y-4 md:hidden">
        {days.map((d) => (
          <section key={d.toISOString()}>
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className={cn("text-sm font-semibold", isToday(d) && "text-primary")}>{format(d, "EEEE, dd.MM.", { locale: de })}</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => onCreate(d)} aria-label="Termin anlegen"><Plus className="size-4" /></Button>
            </div>
            {(byDay[dayKey(d)] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">–{(dueByDay[dayKey(d)] ?? 0) > 0 && ` ${dueByDay[dayKey(d)]} Karten fällig`}</p>
            ) : (
              <ul className="space-y-1.5">{(byDay[dayKey(d)] ?? []).map((i) => <li key={i.id}><AgendaItem item={i} onOpen={onOpen} /></li>)}</ul>
            )}
          </section>
        ))}
      </div>

      {/* Desktop: time grid */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="border-l px-2 py-1.5 text-center">
              <div className="text-xs text-muted-foreground">{format(d, "EEE", { locale: de })}</div>
              <div className={cn("mx-auto flex size-7 items-center justify-center rounded-full text-sm font-semibold", isToday(d) && "bg-primary text-primary-foreground")}>{format(d, "d")}</div>
              {(dueByDay[dayKey(d)] ?? 0) > 0 && <div className="text-[0.65rem] text-muted-foreground"><Brain className="inline size-3" /> {dueByDay[dayKey(d)]}</div>}
              <div className="mt-1 space-y-0.5">
                {(byDay[dayKey(d)] ?? []).filter((i) => i.allDay).map((i) => <Chip key={i.id} item={i} onOpen={onOpen} compact />)}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div>
            {hours.map((h) => <div key={h} className="pr-2 text-right text-[0.65rem] text-muted-foreground" style={{ height: HOUR_PX }}>{h}:00</div>)}
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className="relative border-l">
              {hours.map((h) => (
                <button key={h} type="button" aria-label={`Termin ${format(d, "dd.MM.")} ${h}:00 anlegen`} className="block w-full border-b border-dashed border-border/60 hover:bg-accent/40" style={{ height: HOUR_PX }} onClick={() => onCreate(d, h)} />
              ))}
              {(byDay[dayKey(d)] ?? [])
                .filter((i) => !i.allDay)
                .map((i) => {
                  const s = new Date(i.start);
                  const e = new Date(i.end);
                  const startH = isSameDay(s, d) ? s.getHours() + s.getMinutes() / 60 : HOURS_START;
                  const endH = isSameDay(e, d) ? e.getHours() + e.getMinutes() / 60 : HOURS_END;
                  const top = (Math.max(startH, HOURS_START) - HOURS_START) * HOUR_PX;
                  const height = Math.max(20, (Math.min(endH, HOURS_END) - Math.max(startH, HOURS_START)) * HOUR_PX - 2);
                  const color = moduleColor(i.module?.color ?? "slate");
                  const exam = i.kind === "exam";
                  const cls = cn("absolute inset-x-0.5 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[0.7rem] leading-tight shadow-xs", exam ? "border-danger bg-danger/15" : cn(color.border, color.soft), i.completed && "opacity-60");
                  const inner = (
                    <>
                      <span className="block truncate font-semibold">{i.title}</span>
                      <span className="block truncate opacity-75">{fmtTime(s)}–{fmtTime(e)}{i.location ? ` · ${i.location}` : ""}</span>
                    </>
                  );
                  return exam ? (
                    <Link key={i.id} href={`/modules/${i.module!.id}`} className={cls} style={{ top, height }}>{inner}</Link>
                  ) : (
                    <button key={i.id} type="button" className={cls} style={{ top, height }} onClick={() => onOpen(i)}>{inner}</button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
