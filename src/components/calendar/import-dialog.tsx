"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { ModuleSelect } from "@/components/forms/pickers";
import { useModules } from "@/components/shell/study-data";
import { useAction } from "@/hooks/use-action";
import { EVENT_TYPES, type EventType } from "@/lib/constants";
import { fmtDate, fmtTime } from "@/lib/dates";
import { guessEventType, isIcal, matchModule, parseIcal, type IcalEvent } from "@/lib/ical";
import { cn } from "@/lib/utils";
import { MAX_IMPORT_EVENTS } from "@/lib/validation";
import { fetchCalendar, importEvents } from "@/server/actions/calendar-import";

const URL_KEY = "calendar-import-url";

/** Events with the same title – usually one course – are assigned together. */
interface Group {
  title: string;
  events: IcalEvent[];
  moduleId: string;
  type: EventType;
  include: boolean;
}

function readUrl() {
  try {
    return localStorage.getItem(URL_KEY) ?? "";
  } catch {
    return "";
  }
}

function describe(events: IcalEvent[]) {
  const first = events[0]!;
  const last = events[events.length - 1]!;
  const time = first.allDay ? "ganztägig" : `${fmtDate(first.start, "EE")} ${fmtTime(first.start)}`;
  const span = events.length > 1 ? `${fmtDate(first.start, "dd.MM.")} – ${fmtDate(last.start, "dd.MM.yy")}` : fmtDate(first.start, "dd.MM.yy");
  return `${events.length} Termin${events.length === 1 ? "" : "e"} · ${time} · ${span}`;
}

/**
 * Bulk import: an .ics file or calendar link (e.g. the Rapla export of the
 * DHBW) → preview grouped by course → assign modules → import. Importing the
 * same calendar again updates the events instead of duplicating them.
 */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const modules = useModules();
  const [url, setUrl] = useState(readUrl);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [skipPast, setSkipPast] = useState(true);
  const [createSessions, setCreateSessions] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = useAction(fetchCalendar, { refresh: false });
  const save = useAction(importEvents);

  function applyTexts(texts: string[]) {
    const byId = new Map<string, IcalEvent>();
    for (const t of texts) {
      if (!isIcal(t)) {
        toast.error("Das ist keine iCal-Datei (.ics).");
        continue;
      }
      for (const e of parseIcal(t)) byId.set(e.externalId, e);
    }
    if (byId.size === 0) {
      if (texts.some(isIcal)) toast.error("Im Kalender wurden keine Termine gefunden.");
      return;
    }
    const byTitle = new Map<string, IcalEvent[]>();
    for (const e of [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      (byTitle.get(e.title) ?? byTitle.set(e.title, []).get(e.title)!).push(e);
    }
    setGroups(
      [...byTitle].map(([title, events]) => ({
        title,
        events,
        moduleId: matchModule(title, modules)?.id ?? "",
        type: guessEventType(title),
        include: true,
      })),
    );
  }

  async function readFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    applyTexts(await Promise.all(files.map((f) => f.text())));
  }

  async function loadUrl() {
    const res = await load.run({ url });
    if (!res) return;
    try {
      localStorage.setItem(URL_KEY, url.trim());
    } catch {}
    applyTexts([res.text]);
  }

  const now = useMemo(() => new Date(), []);
  const visible = (g: Group) => (skipPast ? g.events.filter((e) => e.end >= now) : g.events);
  const selected = (groups ?? []).filter((g) => g.include).flatMap((g) => visible(g).map((e) => ({ e, g })));
  const setGroup = (i: number, patch: Partial<Group>) => setGroups((gs) => gs!.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  async function submit() {
    const res = await save.run({
      createSessions,
      events: selected.map(({ e, g }) => ({
        externalId: e.externalId,
        type: g.type,
        title: e.title.slice(0, 160),
        description: e.description,
        location: e.location?.slice(0, 160) ?? null,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        moduleId: g.moduleId || null,
      })),
    });
    if (!res) return;
    const parts = [
      res.created && `${res.created} neu`,
      res.updated && `${res.updated} aktualisiert`,
      res.linked && `${res.linked} mit Sitzungen verknüpft`,
      res.sessions && `${res.sessions} Sitzungen angelegt`,
    ].filter(Boolean);
    toast.success(`Import fertig: ${parts.join(", ")}`);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Termine importieren"
      description={groups ? "Ordne die Veranstaltungen deinen Modulen zu. Ein erneuter Import aktualisiert die Termine, statt sie zu verdoppeln." : "Aus einer .ics-Datei oder einem Kalender-Link – z. B. dem iCal-Export aus Rapla, Moodle, Outlook oder Google."}
    >
      {!groups ? (
        <div className="grid gap-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void readFiles(e.dataTransfer.files);
            }}
          >
            <input ref={fileInput} type="file" accept=".ics,text/calendar" multiple hidden onChange={(e) => { void readFiles(e.target.files); e.target.value = ""; }} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-accent/40",
                over && "border-primary bg-accent/60",
              )}
            >
              <FileUp className="size-5" />
              <span><span className="font-medium text-foreground">.ics-Datei hierher ziehen</span> oder klicken zum Auswählen</span>
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oder per Link<span className="h-px flex-1 bg-border" /></div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loadUrl();
            }}
          >
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://rapla.dhbw.de/rapla/ical?…" className="pl-9" aria-label="Kalender-Link" type="url" inputMode="url" />
            </div>
            <Button type="submit" variant="secondary" loading={load.pending} disabled={!url.trim()}>Laden</Button>
          </form>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox label="Vergangene Termine überspringen" checked={skipPast} onChange={(e) => setSkipPast(e.target.checked)} />
            <Checkbox label="Für jede Vorlesung eine Sitzung anlegen" checked={createSessions} onChange={(e) => setCreateSessions(e.target.checked)} />
          </div>
          <ul className="divide-y rounded-lg border">
            {groups.map((g, i) => {
              const events = visible(g);
              return (
                <li key={g.title} className={cn("grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_12rem_9rem] sm:items-center", (!g.include || !events.length) && "opacity-50")}>
                  <label className="flex min-w-0 items-start gap-2.5">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={g.include && events.length > 0} disabled={!events.length} onChange={(e) => setGroup(i, { include: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{g.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{events.length ? describe(events) : "nur vergangene Termine"}{g.events[0]?.location && ` · ${g.events[0].location}`}</span>
                    </span>
                  </label>
                  <ModuleSelect value={g.moduleId} allowEmpty="Kein Modul" onChange={(v) => setGroup(i, { moduleId: v })} />
                  <Select value={g.type} onChange={(e) => setGroup(i, { type: e.target.value as EventType })} aria-label="Art">
                    {(Object.keys(EVENT_TYPES) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_TYPES[t]}</option>)}
                  </Select>
                </li>
              );
            })}
          </ul>
          {selected.length > MAX_IMPORT_EVENTS && <p className="text-sm text-danger">Höchstens {MAX_IMPORT_EVENTS} Termine auf einmal – bitte einige Veranstaltungen abwählen.</p>}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {groups && <Button variant="ghost" className="mr-auto" onClick={() => setGroups(null)}>Andere Quelle</Button>}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        {groups && (
          <Button onClick={submit} loading={save.pending} disabled={!selected.length || selected.length > MAX_IMPORT_EVENTS}>
            {selected.length} Termine importieren
          </Button>
        )}
      </div>
    </Dialog>
  );
}
