"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, ClipboardCheck, Eye, ListChecks, Pencil, Plus, Timer } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChecklistMarkdown } from "@/components/checklist-markdown";
import { AutoTextarea } from "@/components/notes/auto-textarea";
import { StudyPlanButton } from "@/components/calendar/study-plan-dialog";
import { useCommand } from "@/components/shell/commands";
import { EXAM_TYPES, moduleColor, type ExamType } from "@/lib/constants";
import { appendTask, taskProgress, toggleTask } from "@/lib/checklist";
import { fmtDateTime, fmtDaysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { updateModuleExamText } from "@/server/actions/structure";
import { EditExamButton } from "./actions";
import type { ModuleValues } from "@/components/forms/module-dialog";
import { SaveIndicator, type SaveStatus } from "./module-summary-note";

type Field = "examTopics" | "examNotes";
type Patch = Partial<Record<Field, string>>;

const SAVE_DELAY = 700;

const TOPICS_TEMPLATE = "## Themen\n- [ ] \n\n## Aufgabentypen\n- [ ] Rechenaufgaben\n- [ ] Transferfragen\n";

/**
 * The module's exam tab: topics as a checklist to tick off, the notes for
 * the day (aids, admission, weighting), the key data and what to do next.
 * Both texts autosave; a shared exam keeps one text for all its modules.
 */
export function ExamPrep({
  module: mod,
  partners,
  cardCount,
}: {
  module: ModuleValues & { id: string; examTopics: string; examNotes: string };
  partners: { id: string; name: string; color: string }[];
  cardCount: number;
}) {
  const router = useRouter();
  const [text, setText] = useState({ examTopics: mod.examTopics, examNotes: mod.examNotes });
  const [editing, setEditing] = useState<Field | null>(null);
  // After saving (once it is quiet) and when leaving: tab badge and overview show the new state.
  const { status, queue, flush } = useExamAutosave(mod.id, () => router.refresh());

  // Opening the editor puts the cursor at the end – that is where new topics go.
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = editor.current;
    if (!editing || !el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const change = (field: Field, value: string) => {
    setText((t) => ({ ...t, [field]: value }));
    queue({ [field]: value });
  };

  useCommand("page.save", () => void flush());
  useCommand("note.toggleEdit", () => setEditing((e) => (e ? null : "examTopics")));

  const progress = taskProgress(text.examTopics);
  const days = mod.examDate ? differenceInCalendarDays(mod.examDate, new Date()) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><ListChecks className="size-4" /> Prüfungsinhalte</span>}
            description={
              progress.total
                ? progress.done === progress.total
                  ? "Alles abgehakt – jetzt nur noch wiederholen. 🎉"
                  : `${progress.done} von ${progress.total} Themen sicher`
                : "Was drankommt – als Checkliste zum Abhaken."
            }
            action={
              <div className="flex items-center gap-2">
                <SaveIndicator status={status} onRetry={() => void flush()} />
                <Button variant="ghost" size="sm" onClick={() => setEditing((e) => (e === "examTopics" ? null : "examTopics"))} title="⌘E">
                  {editing === "examTopics" ? <><Eye className="size-4" /> Fertig</> : <><Pencil className="size-4" /> Bearbeiten</>}
                </Button>
              </div>
            }
          />
          <CardBody>
            {progress.total > 0 && <ProgressBar done={progress.done} total={progress.total} className="mb-4" />}
            {editing === "examTopics" ? (
              <>
                <AutoTextarea
                  ref={editor}
                  minRows={12}
                  value={text.examTopics}
                  onChange={(e) => change("examTopics", e.target.value)}
                  onBlur={() => void flush()}
                  placeholder={"## Themen\n- [ ] Normalformen\n- [ ] ER-Modell\n\nJede Zeile mit „- [ ]“ lässt sich abhaken."}
                  aria-label="Prüfungsinhalte"
                  className="rounded-md border bg-background p-3 font-mono text-[13px]"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  „- [ ] Thema“ macht eine Zeile abhakbar (oder <kbd className="font-mono">⇧⌘L</kbd> auf markierten Zeilen), „##“ gliedert. Markdown wird unterstützt.
                </p>
              </>
            ) : text.examTopics.trim() ? (
              <div onDoubleClick={() => setEditing("examTopics")} title="Doppelklick zum Bearbeiten">
                <ChecklistMarkdown onToggle={(line) => change("examTopics", toggleTask(text.examTopics, line))}>{text.examTopics}</ChecklistMarkdown>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center">
                <ListChecks className="mx-auto size-6 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm font-medium">Noch keine Prüfungsinhalte</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Sammle, was drankommt – aus der ersten Vorlesung, dem Modulhandbuch oder der Altklausur. Dann hakst du Thema für Thema ab.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    change("examTopics", TOPICS_TEMPLATE);
                    setEditing("examTopics");
                  }}
                >
                  Mit Vorlage beginnen
                </Button>
              </div>
            )}
            {editing !== "examTopics" && <QuickAdd onAdd={(topic) => change("examTopics", appendTask(text.examTopics, topic))} />}
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader title={partners.length ? "Gemeinsame Prüfung" : "Eckdaten"} action={<EditExamButton module={mod} label="Bearbeiten" />} />
          <CardBody className="space-y-3 text-sm">
            {days !== null && days >= 0 && (
              <div className={cn("flex items-center gap-3 rounded-lg border p-3", days <= 7 ? "border-danger/30 bg-danger/8" : days <= 21 ? "border-warning/40 bg-warning/10" : "bg-muted/40")}>
                <CalendarClock className={cn("size-5 shrink-0", days <= 7 ? "text-danger" : "text-muted-foreground")} aria-hidden />
                <div>
                  <p className="font-semibold">{days === 0 ? "Heute ist Prüfung – viel Erfolg!" : `Prüfung ${fmtDaysUntil(mod.examDate!)}`}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(mod.examDate!)}</p>
                </div>
              </div>
            )}
            {partners.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                zusammen mit
                {partners.map((p) => (
                  <Link key={p.id} href={`/modules/${p.id}?tab=exam`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-foreground hover:bg-muted">
                    <span className={cn("size-2 rounded-full", moduleColor(p.color).dot)} aria-hidden />
                    {p.name}
                  </Link>
                ))}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Form</dt>
              <dd>{mod.examType ? EXAM_TYPES[mod.examType as ExamType] : "–"}</dd>
              <dt className="text-muted-foreground">Termin</dt>
              <dd>{mod.examDate ? fmtDateTime(mod.examDate) : "–"}</dd>
              <dt className="text-muted-foreground">Dauer</dt>
              <dd>{mod.examDuration ? `${mod.examDuration} Min.` : "–"}</dd>
              <dt className="text-muted-foreground">Ort</dt>
              <dd>{mod.examLocation ?? "–"}</dd>
            </dl>
            {!mod.examDate && <p className="text-xs text-muted-foreground">Mit Termin plant der Lernplan die Einheiten bis zur Prüfung.</p>}
          </CardBody>
        </Card>

        <Card className={cn(text.examNotes.trim() && "border-warning/40")}>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600 dark:text-warning" /> Hinweise</span>}
            action={
              <Button variant="ghost" size="sm" onClick={() => setEditing((e) => (e === "examNotes" ? null : "examNotes"))}>
                {editing === "examNotes" ? "Fertig" : <><Pencil className="size-4" /> Bearbeiten</>}
              </Button>
            }
          />
          <CardBody>
            {editing === "examNotes" ? (
              <AutoTextarea
                ref={editor}
                minRows={5}
                value={text.examNotes}
                onChange={(e) => change("examNotes", e.target.value)}
                onBlur={() => void flush()}
                placeholder={"- Hilfsmittel: 1 Blatt A4, Taschenrechner\n- Zulassung: Testat bestanden\n- Gewichtung: 60 % Klausur"}
                aria-label="Hinweise zur Prüfung"
                className="rounded-md border bg-background p-3 text-[13px]"
              />
            ) : text.examNotes.trim() ? (
              <ChecklistMarkdown onToggle={(line) => change("examNotes", toggleTask(text.examNotes, line))}>{text.examNotes}</ChecklistMarkdown>
            ) : (
              <button type="button" onClick={() => setEditing("examNotes")} className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Plus className="size-4" /> Hilfsmittel, Zulassung, Gewichtung …
              </button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Vorbereitung" />
          <CardBody className="grid gap-2">
            <StudyPlanButton preselectModuleId={mod.id} variant="secondary" size="md" label="Lernplan erstellen" />
            {cardCount > 0 && (
              <Link href={`/review/session?module=${mod.id}&mode=cram`} className={buttonClass("secondary")}>
                <Timer className="size-4" /> Prüfungsmodus · {cardCount} Karten
              </Link>
            )}
            <Link href={`/exams/new?module=${mod.id}`} className={buttonClass("secondary")}>
              <ClipboardCheck className="size-4" /> Probeklausur erstellen
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-3", className)} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Abgehakte Themen">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct} %</span>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (topic: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-4 flex items-center gap-2 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue("");
      }}
    >
      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Thema hinzufügen … (↵)"
        aria-label="Thema hinzufügen"
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </form>
  );
}

/** Debounced, serialised autosave of both texts: at most one request in flight, changes are merged. */
function useExamAutosave(moduleId: string, onSaved: () => void) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const saved = useRef(false);
  const notify = useRef(onSaved);
  const quiet = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    notify.current = onSaved;
  });
  const pending = useRef<Patch>({});
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current) return;
    inflight.current = true;
    let wrote = false;
    while (Object.keys(pending.current).length > 0) {
      const patch = pending.current;
      pending.current = {};
      setStatus("saving");
      let ok = false;
      try {
        const res = await updateModuleExamText({ id: moduleId, ...patch });
        ok = res.ok;
        if (!res.ok) toast.error(res.error);
      } catch {
        toast.error("Speichern fehlgeschlagen – Verbindung prüfen.");
      }
      if (!ok) {
        pending.current = { ...patch, ...pending.current };
        inflight.current = false;
        setStatus("error");
        return;
      }
      saved.current = true;
      wrote = true;
    }
    inflight.current = false;
    setStatus("saved");
    if (wrote) {
      clearTimeout(quiet.current);
      quiet.current = setTimeout(() => notify.current(), 1500);
    }
  }, [moduleId]);

  const queue = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0 || inflight.current) {
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(quiet.current);
      void flush().then(() => saved.current && notify.current());
    };
  }, [flush]);

  return { status, queue, flush };
}
