"use client";

import { addHours } from "date-fns";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { EVENT_TYPES, type EventType } from "@/lib/constants";
import { toDateInput, toDateTimeInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createEvent, deleteEvent, updateEvent } from "@/server/actions/events";
import { ROOM_LIST_ID, useStudyData } from "@/components/shell/study-data";
import { ModuleSelect, SessionSelect } from "./pickers";

export interface EventValues {
  id?: string;
  type: EventType;
  title: string;
  description: string;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  moduleId: string | null;
  noteId: string | null;
  documentId: string | null;
  topic: string | null;
  seriesId?: string | null;
}

export function defaultEventValues(start = new Date(), overrides: Partial<EventValues> = {}): EventValues {
  const s = new Date(start);
  if (s.getHours() === 0 && s.getMinutes() === 0) s.setHours(9, 0, 0, 0);
  else s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0);
  return {
    type: "LECTURE",
    title: "",
    description: "",
    location: null,
    start: s,
    end: addHours(s, overrides.type === "STUDY" ? 1 : 2),
    allDay: false,
    moduleId: null,
    noteId: null,
    documentId: null,
    topic: null,
    ...overrides,
  };
}

export function EventDialog({
  open,
  onOpenChange,
  initial,
  topicOptions = {},
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: EventValues;
  /** Flashcard topics per module, for focused study sessions. */
  topicOptions?: Record<string, string[]>;
}) {
  const { tree, documents } = useStudyData();
  const editing = !!initial.id;
  const roomOf = (moduleId: string | null | undefined) => tree.flatMap((s) => s.modules).find((m) => m.id === moduleId)?.room ?? "";
  const [form, setForm] = useState(() => ({
    type: initial.type,
    title: initial.title,
    description: initial.description,
    // New events of a module start in the module's room.
    location: initial.location ?? (editing ? "" : roomOf(initial.moduleId)),
    start: initial.allDay ? toDateInput(initial.start) : toDateTimeInput(initial.start),
    end: initial.allDay ? toDateInput(initial.end) : toDateTimeInput(initial.end),
    allDay: initial.allDay,
    moduleId: initial.moduleId ?? "",
    noteId: initial.noteId ?? "",
    documentId: initial.documentId ?? "",
    topic: initial.topic ?? "",
    repeatWeeks: "0",
    createSession: false,
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const create = useAction(createEvent, { success: "Termin gespeichert" });
  const update = useAction(updateEvent, { success: "Termin gespeichert" });
  const remove = useAction(deleteEvent, { success: "Termin gelöscht" });
  const fe = editing ? update.fieldErrors : create.fieldErrors;

  const mod = tree.flatMap((s) => s.modules).find((m) => m.id === form.moduleId);
  const topics = (form.moduleId && topicOptions[form.moduleId]) || [];

  function setAllDay(allDay: boolean) {
    setForm((f) => ({
      ...f,
      allDay,
      start: allDay ? f.start.slice(0, 10) : `${f.start.slice(0, 10)}T09:00`,
      end: allDay ? f.end.slice(0, 10) : `${f.end.slice(0, 10)}T10:00`,
    }));
  }

  function setStart(value: string) {
    // Keep the duration when moving the start.
    setForm((f) => {
      if (f.allDay) return { ...f, start: value, end: value > f.end ? value : f.end };
      const oldStart = new Date(f.start).getTime();
      const duration = new Date(f.end).getTime() - oldStart;
      const newStart = new Date(value);
      if (Number.isNaN(newStart.getTime()) || Number.isNaN(duration)) return { ...f, start: value };
      return { ...f, start: value, end: toDateTimeInput(new Date(newStart.getTime() + Math.max(duration, 0))) };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim() || (mod ? `${form.type === "STUDY" ? "Lernen: " : ""}${mod.name}` : "");
    const data = { ...form, title };
    const ok = editing ? await update.run({ id: initial.id!, data }) : await create.run(data);
    if (ok !== undefined) onOpenChange(false);
  }

  async function doDelete(scope: "single" | "following") {
    if ((await remove.run({ id: initial.id!, scope })) !== undefined) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? "Termin bearbeiten" : "Neuer Termin"} size="lg">
      <form id="event-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6">
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-0.5 text-sm" role="radiogroup" aria-label="Art des Termins">
            {(Object.keys(EVENT_TYPES) as EventType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.type === t}
                onClick={() => set("type", t)}
                className={cn("rounded-md px-3 py-1 text-[13px] font-medium transition-colors", form.type === t ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                {EVENT_TYPES[t]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Modul" htmlFor="e-module" error={fe.moduleId} className="sm:col-span-3">
          <ModuleSelect id="e-module" value={form.moduleId} allowEmpty="Kein Modul" onChange={(v) =>
              setForm((f) => ({
                ...f,
                moduleId: v,
                noteId: "",
                topic: "",
                // Follow the module's room unless a different place was typed in.
                location: !f.location.trim() || f.location === roomOf(f.moduleId) ? roomOf(v) : f.location,
              }))
            } />
        </Field>
        <Field label="Titel" htmlFor="e-title" error={fe.title} className="sm:col-span-3" hint={mod && !form.title ? `Leer = „${form.type === "STUDY" ? "Lernen: " : ""}${mod.name}“` : undefined}>
          <Input id="e-title" value={form.title} onChange={(e) => set("title", e.target.value)} required={!mod} />
        </Field>
        <Field label="Beginn" htmlFor="e-start" error={fe.start} className="sm:col-span-3">
          <DateInput id="e-start" withTime={!form.allDay} value={form.start} onChange={setStart} required />
        </Field>
        <Field label="Ende" htmlFor="e-end" error={fe.end} className="sm:col-span-3">
          <DateInput id="e-end" withTime={!form.allDay} value={form.end} onChange={(v) => set("end", v)} required />
        </Field>
        <div className="-mt-2 sm:col-span-6">
          <Checkbox label="Ganztägig" checked={form.allDay} onChange={(e) => setAllDay(e.target.checked)} />
        </div>

        {form.moduleId && form.type === "LECTURE" && (
          <Field label="Sitzung" htmlFor="e-lecture" className="sm:col-span-3">
            <SessionSelect id="e-lecture" moduleId={form.moduleId} value={form.noteId} onChange={(v) => set("noteId", v)} emptyLabel="Keine / neue Sitzung" />
          </Field>
        )}
        {form.moduleId && form.type === "LECTURE" && !form.noteId && (
          <div className="flex items-end pb-2 sm:col-span-3">
            <Checkbox label={form.repeatWeeks !== "0" ? "Für jeden Termin eine Sitzung anlegen" : "Sitzung für diesen Termin anlegen"} checked={form.createSession} onChange={(e) => set("createSession", e.target.checked)} />
          </div>
        )}

        {form.type === "STUDY" && form.moduleId && (
          <>
            <Field label="Thema (Karteikarten)" htmlFor="e-topic" className="sm:col-span-2" hint="Startet gezielt dieses Thema im Lernbereich.">
              <Select id="e-topic" value={form.topic} onChange={(e) => set("topic", e.target.value)}>
                <option value="">Alle Themen</option>
                {topics.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Sitzung" htmlFor="e-note" className="sm:col-span-2">
              <SessionSelect id="e-note" moduleId={form.moduleId} value={form.noteId} onChange={(v) => set("noteId", v)} emptyLabel="Keine" />
            </Field>
          </>
        )}
        {(form.type === "STUDY" || form.type === "DEADLINE") && (
          <Field label="Unterlage" htmlFor="e-doc" className={form.type === "STUDY" && form.moduleId ? "sm:col-span-2" : "sm:col-span-3"}>
            <Select id="e-doc" value={form.documentId} onChange={(e) => set("documentId", e.target.value)}>
              <option value="">Keine</option>
              {documents
                .filter((d) => !form.moduleId || d.moduleId === form.moduleId)
                .map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Ort / Raum" htmlFor="e-loc" className="sm:col-span-3">
          <Input id="e-loc" list={ROOM_LIST_ID} autoComplete="off" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={mod?.room ?? "z. B. C-301"} />
        </Field>
        {!editing && (
          <Field label="Wöchentlich wiederholen" htmlFor="e-repeat" className="sm:col-span-3" hint="Weitere Termine im Wochenrhythmus anlegen.">
            <Select id="e-repeat" value={form.repeatWeeks} onChange={(e) => set("repeatWeeks", e.target.value)}>
              <option value="0">Nicht wiederholen</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>+ {n} Woche{n === 1 ? "" : "n"} ({n + 1} Termine)</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Beschreibung" htmlFor="e-desc" className="sm:col-span-6">
          <Textarea id="e-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={form.type === "STUDY" ? "Was genau willst du lernen / wiederholen?" : ""} />
        </Field>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <div className="mr-auto flex flex-wrap gap-2">
            {confirmDelete ? (
              <>
                <Button variant="danger" size="sm" loading={remove.pending} onClick={() => doDelete("single")}>Nur diesen löschen</Button>
                {initial.seriesId && (
                  <Button variant="danger" size="sm" loading={remove.pending} onClick={() => doDelete("following")}>Diesen & folgende</Button>
                )}
              </>
            ) : (
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Löschen
              </Button>
            )}
          </div>
        )}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        <Button type="submit" form="event-form" loading={create.pending || update.pending}>Speichern</Button>
      </div>
    </Dialog>
  );
}
