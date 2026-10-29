"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListChecks } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { EXAM_TYPES, MODULE_COLORS, type ModuleColor } from "@/lib/constants";
import { toDateTimeInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createModule, updateModule } from "@/server/actions/structure";
import { ROOM_LIST_ID, useModules } from "@/components/shell/study-data";
import { ModuleDot } from "@/components/ui/misc";
import { SemesterSelect } from "./pickers";

export interface ModuleValues {
  id?: string;
  semesterId: string;
  name: string;
  code: string | null;
  lecturer: string | null;
  ects: number | null;
  color: string;
  description: string;
  room: string | null;
  examGroupId?: string | null;
  examDate: Date | null;
  examType: string | null;
  examDuration: number | null;
  examLocation: string | null;
}

export function ModuleDialog({
  open,
  onOpenChange,
  initial,
  semesterId,
  initialTab = "general",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ModuleValues;
  semesterId?: string;
  initialTab?: "general" | "exam";
}) {
  const router = useRouter();
  const modules = useModules();
  const [tab, setTab] = useState<"general" | "exam">(initialTab);
  const [form, setForm] = useState(() => ({
    semesterId: initial?.semesterId ?? semesterId ?? "",
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    lecturer: initial?.lecturer ?? "",
    ects: initial?.ects?.toString() ?? "",
    color: (initial?.color ?? "indigo") as ModuleColor,
    description: initial?.description ?? "",
    room: initial?.room ?? "",
    examPartnerIds: initial?.examGroupId ? modules.filter((m) => m.examGroupId === initial.examGroupId && m.id !== initial.id).map((m) => m.id) : ([] as string[]),
    examDate: toDateTimeInput(initial?.examDate),
    examType: initial?.examType ?? "",
    examDuration: initial?.examDuration?.toString() ?? "",
    examLocation: initial?.examLocation ?? "",
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const create = useAction(createModule, { success: "Modul angelegt" });
  const update = useAction(updateModule, { success: "Modul gespeichert" });
  const fe = initial?.id ? update.fieldErrors : create.fieldErrors;
  // Shared exams make sense within the same semester – selected ones stay visible anyway.
  const otherModules = modules.filter((m) => m.id !== initial?.id && (m.semesterId === form.semesterId || form.examPartnerIds.includes(m.id)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (initial?.id) {
      if ((await update.run({ id: initial.id, data: form })) !== undefined) onOpenChange(false);
    } else {
      const res = await create.run(form);
      if (res) {
        onOpenChange(false);
        router.push(`/modules/${res.id}`);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial?.id ? "Modul bearbeiten" : "Neues Modul"} size="lg">
      <div className="mb-4 inline-flex rounded-lg bg-muted p-0.5 text-sm">
        {(["general", "exam"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-md px-3 py-1 text-[13px] font-medium transition-colors", tab === t ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "general" ? "Allgemein" : "Prüfung"}
          </button>
        ))}
      </div>
      <form id="module-form" onSubmit={submit}>
        <div className={cn("grid gap-4 sm:grid-cols-6", tab !== "general" && "hidden")}>
          <Field label="Modulname" htmlFor="m-name" error={fe.name} className="sm:col-span-4">
            <Input id="m-name" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus placeholder="z. B. Datenbanken" />
          </Field>
          <Field label="Kürzel" htmlFor="m-code" error={fe.code} className="sm:col-span-2">
            <Input id="m-code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="T3INF2004" />
          </Field>
          <Field label="Semester" htmlFor="m-semester" error={fe.semesterId} className="sm:col-span-3">
            <SemesterSelect id="m-semester" value={form.semesterId} onChange={(v) => set("semesterId", v)} />
          </Field>
          <Field label="Dozent/in" htmlFor="m-lecturer" error={fe.lecturer} className="sm:col-span-2">
            <Input id="m-lecturer" value={form.lecturer} onChange={(e) => set("lecturer", e.target.value)} />
          </Field>
          <Field label="ECTS" htmlFor="m-ects" error={fe.ects}>
            <Input id="m-ects" type="number" min={0} max={60} value={form.ects} onChange={(e) => set("ects", e.target.value)} />
          </Field>
          <Field label="Raum" htmlFor="m-room" error={fe.room} className="sm:col-span-3" hint="Wird neuen Terminen automatisch als Ort eingetragen – und beim ersten Vorlesungstermin mit Raum automatisch übernommen.">
            <Input id="m-room" list={ROOM_LIST_ID} autoComplete="off" value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="z. B. C-301" />
          </Field>
          <div className="sm:col-span-6">
            <p className="mb-1.5 text-sm font-medium">Farbe</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MODULE_COLORS) as ModuleColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  title={MODULE_COLORS[c].label}
                  aria-label={MODULE_COLORS[c].label}
                  aria-pressed={form.color === c}
                  onClick={() => set("color", c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-card transition", MODULE_COLORS[c].dot, form.color === c && "ring-2 ring-foreground")}
                />
              ))}
            </div>
          </div>
          <Field label="Beschreibung" htmlFor="m-desc" error={fe.description} className="sm:col-span-6" hint="Markdown wird unterstützt.">
            <Textarea id="m-desc" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Inhalte, Lernziele, Literatur …" />
          </Field>
        </div>

        <div className={cn("grid gap-4 sm:grid-cols-6", tab !== "exam" && "hidden")}>
          <Field label="Prüfungsform" htmlFor="m-examtype" error={fe.examType} className="sm:col-span-3">
            <Select id="m-examtype" value={form.examType} onChange={(e) => set("examType", e.target.value)}>
              <option value="">Noch offen</option>
              {Object.entries(EXAM_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Termin" htmlFor="m-examdate" error={fe.examDate} className="sm:col-span-3">
            <DateInput id="m-examdate" withTime value={form.examDate} onChange={(v) => set("examDate", v)} />
          </Field>
          <Field label="Dauer (Min.)" htmlFor="m-examdur" error={fe.examDuration} className="sm:col-span-2">
            <Input id="m-examdur" type="number" min={0} value={form.examDuration} onChange={(e) => set("examDuration", e.target.value)} />
          </Field>
          <Field label="Ort / Raum" htmlFor="m-examloc" error={fe.examLocation} className="sm:col-span-4">
            <Input id="m-examloc" list={ROOM_LIST_ID} autoComplete="off" value={form.examLocation} onChange={(e) => set("examLocation", e.target.value)} />
          </Field>
          {otherModules.length > 0 && (
            <div className="sm:col-span-6">
              <p className="mb-1 text-sm font-medium">Gemeinsame Prüfung mit</p>
              <p className="mb-2 text-xs text-muted-foreground">Wenn mehrere Module in einer einzigen Prüfung enden: Die Prüfungsdaten gelten dann für alle gewählten Module und erscheinen im Kalender nur einmal.</p>
              <div className="flex flex-wrap gap-1.5">
                {otherModules.map((m) => {
                  const on = form.examPartnerIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("examPartnerIds", on ? form.examPartnerIds.filter((x) => x !== m.id) : [...form.examPartnerIds, m.id])}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
                    >
                      <ModuleDot color={m.color} />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground sm:col-span-6">
            <ListChecks className="mt-px size-4 shrink-0" aria-hidden />
            <span>
              <b className="font-medium text-foreground">Prüfungsinhalte & Hinweise</b> schreibst du im Tab <b className="font-medium text-foreground">„Prüfung“</b> des Moduls – als
              abhakbare Checkliste, mit Autosave{form.examPartnerIds.length > 0 && " und für alle Module dieser gemeinsamen Prüfung"}.
            </span>
          </p>
        </div>
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        <Button type="submit" form="module-form" loading={create.pending || update.pending}>Speichern</Button>
      </div>
    </Dialog>
  );
}
