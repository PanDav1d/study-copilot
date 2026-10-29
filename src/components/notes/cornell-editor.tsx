"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ModuleTag } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { FlashcardDialog } from "@/components/forms/flashcard-dialog";
import { Dropzone } from "@/components/forms/upload";
import { useStudyData } from "@/components/shell/study-data";
import { showReward } from "@/components/gamification/reward";
import { useAction } from "@/hooks/use-action";
import { docLinkMarkdown, emptyRow, nonEmptyRows, parseRows, sheetMarkdown, type CornellRow } from "@/lib/cornell";
import { fmtDate, fmtTime, toDateInput } from "@/lib/dates";
import { nextStep, sessionSteps, STEP_INFO, STEP_ORDER, SUMMARY_OVERDUE_DAYS, type StepKey } from "@/lib/gamification";
import { cn } from "@/lib/utils";
import { completeRecall, deleteNote, linkNoteDocument, unlinkNoteDocument, updateNote } from "@/server/actions/notes";
import type { Reward } from "@/server/gamification";
import { AutoTextarea, insertAtCursor } from "./auto-textarea";
import { CuesToCardsDialog } from "./cues-to-cards-dialog";
import { CornellSheet, withTrailingRow, type SheetMode } from "./cornell-sheet";
import { InsertDocLinkDialog, LinkDocumentDialog } from "./doc-dialogs";
import { StepBar } from "./session-steps";
import { useWorkspace } from "@/components/shell/workspace";
import { WarmupCard, type Warmup } from "./warmup";
import { useNoteTarget } from "./note-channel";
import { useCommand } from "@/components/shell/commands";

export interface CornellNote {
  id: string;
  title: string;
  date: Date;
  sections: string;
  summary: string;
  recallAt: Date | null;
  recallScore: number | null;
  updatedAt: Date;
  module: { id: string; name: string; color: string };
  documents: { document: { id: string; title: string } }[];
  flashcards: { id: string; front: string; state: number }[];
  /** The lecture this session belongs to (linked automatically by date). */
  calendarEvents?: { id: string; start: Date; end: Date; location: string | null; allDay: boolean }[];
}

type Fields = { title: string; date: string; summary: string; sections: CornellRow[] };
type SaveStatus = "saved" | "dirty" | "saving" | "error";

const SAVE_DELAY = 900;

/** Debounced, serialised autosave: at most one request in flight, changes are merged. */
function useAutosave(noteId: string, onReward: (r: Reward) => void) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<Partial<Fields>>({});
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rewardRef = useRef(onReward);
  useEffect(() => {
    rewardRef.current = onReward;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current) return;
    inflight.current = true;
    // Changes made while a request is running are sent in the next iteration.
    while (Object.keys(pending.current).length > 0) {
      const payload = pending.current;
      pending.current = {};
      setStatus("saving");
      let ok = false;
      try {
        const res = await updateNote({ id: noteId, ...payload });
        ok = res.ok;
        if (res.ok) rewardRef.current(res.data.reward);
        else toast.error(res.error);
      } catch {
        toast.error("Speichern fehlgeschlagen – Verbindung prüfen.");
      }
      if (!ok) {
        pending.current = { ...payload, ...pending.current };
        inflight.current = false;
        setStatus("error");
        return;
      }
    }
    inflight.current = false;
    setStatus("saved");
  }, [noteId]);

  const queue = useCallback(
    (patch: Partial<Fields>) => {
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
      void flush();
    };
  }, [flush]);

  return { status, queue, flush };
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-medium text-danger">
        <AlertCircle className="size-3.5" /> Nicht gespeichert – erneut versuchen
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
      {status === "saving" || status === "dirty" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
      {status === "saved" ? "Gespeichert" : "Speichert …"}
    </span>
  );
}

/**
 * Elaborative interrogation: "why/how" questions make you connect new facts
 * with what you know – far more durable than keyword cues (Dunlosky et al. 2013).
 * They are also the question types of DHBW transfer exams.
 */
const QUESTION_STEMS = ["Warum …?", "Wie hängt … mit … zusammen?", "Worin unterscheiden sich … und …?", "Was passiert, wenn …?", "Beispiel aus dem Praxisbetrieb für …?"];

const STEP_CTA: Record<StepKey, string> = {
  record: "Mitschrift starten",
  reduce: "Fragen formulieren",
  recite: "Abfrage starten",
  reflect: "Jetzt zusammenfassen",
  review: "Karteikarten erstellen",
};

/**
 * A session (Sitzung) = one Cornell sheet. The page guides through the five
 * steps of the method – Record, Reduce, Recite, Reflect, Review – always
 * showing exactly one next step (low friction, clear goal).
 */
export function CornellEditor({
  note,
  topics,
  focusSummary = false,
  warmup = null,
}: {
  note: CornellNote;
  topics: string[];
  focusSummary?: boolean;
  /** Questions of the previous session, shown while this sheet is still empty. */
  warmup?: Warmup | null;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const { documents: allDocuments } = useStudyData();
  const initialRows = useMemo(() => parseRows(note.sections), [note.sections]);
  const [fields, setFields] = useState<Fields>(() => ({
    title: note.title,
    date: toDateInput(note.date),
    summary: note.summary,
    sections: withTrailingRow(initialRows),
  }));
  const [mode, setMode] = useState<SheetMode>(() => (focusSummary || nonEmptyRows(initialRows).length === 0 ? "edit" : "read"));
  const [recallAt, setRecallAt] = useState<Date | null>(note.recallAt);
  const [recallResult, setRecallResult] = useState<{ known: CornellRow[]; unknown: CornellRow[] } | null>(null);
  // Incremented whenever a new recall run starts – remounts the sheet with everything covered.
  const [recallRun, setRecallRun] = useState(0);
  const [dialog, setDialog] = useState<"cards" | "card" | "link" | "insert" | "delete" | null>(null);
  const [cardRows, setCardRows] = useState<CornellRow[] | null>(null);
  const [cardDraft, setCardDraft] = useState<{ front: string; back: string } | null>(null);
  const lastFocused = useRef<HTMLTextAreaElement | null>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const summarySection = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"summary" | "cue" | "content" | null>(focusSummary ? "summary" : null);

  const steps = sessionSteps({ rows: fields.sections, summary: fields.summary, recallAt, cardCount: note.flashcards.length });
  const next = nextStep(steps);
  // Steps already rewarded/celebrated – used to label XP toasts precisely.
  const celebrated = useRef(new Set(STEP_ORDER.filter((k) => steps[k])));

  const onReward = (reward: Reward) => {
    if (!reward.xp && !reward.achievements.length) return;
    const now = sessionSteps({ rows: fields.sections, summary: fields.summary, recallAt, cardCount: note.flashcards.length });
    const fresh = STEP_ORDER.filter((k) => now[k] && !celebrated.current.has(k));
    fresh.forEach((k) => celebrated.current.add(k));
    showReward(reward, fresh.length ? fresh.map((k) => `${STEP_INFO[k].label} ✓`).join(" · ") : undefined);
    router.refresh();
  };
  const { status, queue, flush } = useAutosave(note.id, onReward);

  const del = useAction(deleteNote, { success: "Sitzung gelöscht", refresh: false });
  const link = useAction(linkNoteDocument);
  const unlink = useAction(unlinkNoteDocument);
  const recall = useAction(completeRecall, { refresh: false });

  const update = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    queue(patch);
  };

  // Focus requests that may need edit mode to be rendered first.
  const applyFocus = useCallback(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target) return;
    if (target === "summary") {
      summarySection.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      summaryRef.current?.focus({ preventScroll: true });
      return;
    }
    const rowsEls = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('[role="row"]') ?? []);
    const pick = (row: HTMLElement | undefined, i: number) => row?.querySelectorAll("textarea")[i];
    const el =
      target === "cue"
        ? (rowsEls.map((r) => r.querySelectorAll("textarea")).find((t) => !t[0]?.value.trim() && t[1]?.value.trim())?.[0] ?? pick(rowsEls[0], 0))
        : pick(rowsEls[0], 1);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (mode === "edit") applyFocus();
  }, [mode, applyFocus]);

  const focusIn = (target: "summary" | "cue" | "content") => {
    pendingFocus.current = target;
    if (mode === "edit") applyFocus();
    else setMode("edit");
  };

  const runStep = (k: StepKey) => {
    if (k === "record") focusIn("content");
    else if (k === "reduce") focusIn("cue");
    else if (k === "recite") {
      void flush();
      setRecallResult(null);
      setRecallRun((r) => r + 1);
      setMode("recall");
      sheetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (k === "reflect") focusIn("summary");
    else {
      void flush().then(() => {
        setCardRows(null);
        setDialog("cards");
      });
    }
  };


  // The PDF viewer (in the other pane) can send snippets here: at the cursor if a
  // field of this sheet is being edited, otherwise as a new row at the end.
  useNoteTarget(note.id, fields.title.trim() || `Sitzung ${fmtDate(new Date(fields.date), "dd.MM.")}`, (markdown) => {
    const el = lastFocused.current;
    if (mode === "edit" && el?.isConnected) {
      const before = el.value.slice(0, el.selectionStart);
      insertAtCursor(el, `${before && !before.endsWith("\n") ? "\n" : ""}${markdown}\n`);
    } else {
      const rows = nonEmptyRows(fields.sections);
      update({ sections: withTrailingRow([...rows, { ...emptyRow(), content: markdown }]) });
    }
    toast.success("Ausschnitt eingefügt", { description: fields.title.trim() || undefined });
  });

  const linkedIds = useMemo(() => new Set(note.documents.map((d) => d.document.id)), [note.documents]);
  const moduleDocuments = allDocuments.filter((d) => d.moduleId === note.module.id);
  const existingFronts = useMemo(() => note.flashcards.map((c) => c.front), [note.flashcards]);
  const cardFronts = useMemo(() => new Set(existingFronts.map((f) => f.toLowerCase().replace(/\s+/g, " ").trim())), [existingFronts]);

  const editing = mode === "edit";
  const sessionPassed = new Date(fields.date) <= new Date();
  const daysOpen = Math.max(0, differenceInCalendarDays(new Date(), new Date(fields.date)));
  const summaryOverdue = !steps.reflect && steps.record && sessionPassed && daysOpen >= SUMMARY_OVERDUE_DAYS;
  const lecture = note.calendarEvents?.[0];
  const displayTitle = fields.title.trim() || `Sitzung vom ${fmtDate(new Date(fields.date), "EE dd.MM.yyyy")}`;

  const switchMode = (m: SheetMode) => {
    setRecallResult(null);
    if (m === "recall") {
      void flush();
      setRecallRun((r) => r + 1);
    }
    setMode(m);
  };

  // Menu bar "Sitzung", shortcuts and the command palette (lib/commands.ts).
  useCommand("note.mode.edit", () => switchMode("edit"), { checked: mode === "edit" });
  useCommand("note.mode.read", () => switchMode("read"), { checked: mode === "read" });
  useCommand("note.mode.recall", () => switchMode("recall"), { checked: mode === "recall" });
  useCommand("note.toggleEdit", () => switchMode(mode === "edit" ? "read" : "edit"));
  useCommand("page.save", () => {
    void flush().then(() => toast.success("Gesichert"));
  });
  useCommand("note.next", () => next && runStep(next), { enabled: !!next });
  useCommand("note.summary", () => focusIn("summary"));
  useCommand("note.cards", () => runStep("review"));
  useCommand("note.insertLink", () => setDialog("insert"), { enabled: mode === "edit" });
  useCommand("note.linkDoc", () => setDialog("link"));
  useCommand("note.delete", () => setDialog("delete"));
  useCommand("new.card", () => {
    setCardDraft(null);
    setDialog("card");
  });
  const copyMarkdown = () => {
    const md = sheetMarkdown({ title: displayTitle, date: new Date(fields.date), module: note.module.name, rows: fields.sections, summary: fields.summary });
    void navigator.clipboard.writeText(md).then(
      () => toast.success("Als Markdown kopiert", { description: "Z. B. in Claude oder ChatGPT einfügen." }),
      () => toast.error("Kopieren nicht möglich"),
    );
  };
  useCommand("note.copyMarkdown", copyMarkdown);

  return (
    <div className="@container space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Link href={`/modules/${note.module.id}?tab=sessions`}><ModuleTag name={note.module.name} color={note.module.color} /></Link>
            {editing ? (
              <DateInput value={fields.date} onChange={(date) => date && update({ date })} size="sm" className="w-36" aria-label="Datum der Sitzung" />
            ) : (
              <span>{fmtDate(new Date(fields.date), "EEEE, d. MMMM yyyy")}</span>
            )}
            {lecture && (
              <Link href={`/calendar?view=week&date=${toDateInput(lecture.start)}`} className="inline-flex items-center gap-1 hover:text-foreground" title="Verknüpfter Kalendertermin">
                <CalendarDays className="size-3.5" aria-hidden />
                {lecture.allDay ? "ganztägig" : `${fmtTime(lecture.start)}–${fmtTime(lecture.end)}`}
                {lecture.location && <> · {lecture.location}</>}
              </Link>
            )}
            <SaveIndicator status={status} onRetry={() => void flush()} />
          </div>
          {editing ? (
            <input
              value={fields.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={displayTitle}
              aria-label="Thema der Sitzung (optional)"
              className="w-full rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 @md:text-[1.75rem]"
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight text-balance @md:text-[1.75rem]">{displayTitle}</h1>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Ansicht">
            {([
              ["edit", "Schreiben", Pencil, "⌘1"],
              ["read", "Lesen", Eye, "⌘2"],
              ["recall", "Abfragen", EyeOff, "⌘3"],
            ] as const).map(([m, label, Icon, key]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                title={`${label} (${key})`}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors", mode === m ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => workspace.openPicker({ beside: true, moduleId: note.module.id })} aria-label="Daneben öffnen" title="PDF oder andere Sitzung daneben öffnen (oder einen Tab auf den Inhalt ziehen)">
            <Columns2 className="size-4" />
          </Button>
          <Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label="Weitere Aktionen"><MoreHorizontal className="size-4" /></Button>}>
            {editing && <DropdownItem icon={<Link2 className="size-4" />} onSelect={() => setDialog("insert")}>PDF-Link einfügen</DropdownItem>}
            <DropdownItem icon={<Copy className="size-4" />} onSelect={copyMarkdown}>Als Markdown kopieren</DropdownItem>
            <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Sitzung löschen</DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Cornell 5R guide */}
      <div className="rounded-xl border bg-card p-4 shadow-xs print:hidden">
        <StepBar steps={steps} active={next} onSelect={runStep} />
        <div className="mt-4 flex flex-col gap-3 border-t pt-4 @md:flex-row @md:items-center">
          {next ? (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  Nächster Schritt: {STEP_INFO[next].label}
                  {summaryOverdue && <span className="ml-2 font-normal text-amber-700 dark:text-warning">· Zusammenfassung seit {daysOpen} Tagen offen</span>}
                </p>
                <p className="text-muted-foreground">{STEP_INFO[next].hint}</p>
                {next === "reduce" && (
                  <p className="mt-2 flex flex-wrap gap-1.5" aria-label="Fragestämme">
                    {QUESTION_STEMS.map((q) => (
                      <span key={q} className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{q}</span>
                    ))}
                  </p>
                )}
              </div>
              <Button onClick={() => runStep(next)}>
                {STEP_CTA[next]} <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <div className="flex-1 text-sm">
              <p className="font-medium">Alle fünf Schritte erledigt 🎉</p>
              <p className="text-muted-foreground">Ab jetzt übernehmen die Karteikarten: FSRS holt die Inhalte genau dann zurück, wenn du sie zu vergessen drohst.</p>
            </div>
          )}
        </div>
      </div>

      {warmup && !steps.record && <div className="print:hidden"><WarmupCard warmup={warmup} /></div>}

      {recallResult && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs @md:flex-row @md:items-center print:hidden">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {recallResult.known.length}/{recallResult.known.length + recallResult.unknown.length} gewusst
              {recallResult.unknown.length === 0 && " – perfekt!"}
            </p>
            <p className="text-muted-foreground">
              {recallResult.unknown.length > 0
                ? "Die Lücken sind jetzt am wertvollsten: Mach sie zu Karteikarten, dann holt FSRS sie gezielt zurück."
                : "Mach trotzdem Karteikarten daraus – Wissen, das heute sitzt, verblasst ohne Wiederholung."}
            </p>
          </div>
          <Button
            onClick={() => {
              setCardRows(recallResult.unknown.length ? recallResult.unknown : null);
              setDialog("cards");
            }}
          >
            <Sparkles className="size-4" /> {recallResult.unknown.length ? `${recallResult.unknown.length} Lücken als Karten` : "Karten erstellen"}
          </Button>
        </div>
      )}

      {/* Cornell sheet */}
      <div ref={sheetRef} className="scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-xs print:break-inside-auto print:overflow-visible print:shadow-none">
        <CornellSheet
          key={mode === "recall" ? `recall-${recallRun}` : "sheet"}
          rows={fields.sections}
          mode={mode}
          onChange={(sections) => update({ sections })}
          onFocusContent={(el) => (lastFocused.current = el)}
          onMakeCard={(row) => {
            setCardDraft({ front: row.cue.trim(), back: row.content.trim() });
            setDialog("card");
          }}
          cardFronts={cardFronts}
          onRecallComplete={async (result) => {
            setRecallResult(result);
            const res = await recall.run({ noteId: note.id, known: result.known.length, total: result.known.length + result.unknown.length });
            if (res) {
              setRecallAt(new Date());
              celebrated.current.add("recite");
              showReward(res.reward, `Abfragen ✓ · ${result.known.length}/${result.known.length + result.unknown.length} gewusst`);
              router.refresh();
            }
          }}
        />
        <section ref={summarySection} className={cn("scroll-mt-20 border-t px-4 py-4 @md:px-5", editing && !steps.reflect ? "bg-warning/5" : "bg-muted/30")}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Zusammenfassung</h2>
            {editing && <span className="text-xs text-muted-foreground tabular-nums">{fields.summary.trim().length < 40 ? `${fields.summary.trim().length}/40` : <Check className="size-3.5 text-success" />}</span>}
          </div>
          {editing ? (
            <AutoTextarea
              ref={summaryRef}
              value={fields.summary}
              onChange={(e) => update({ summary: e.target.value })}
              minRows={3}
              placeholder="Was ist die Kernaussage dieser Sitzung? 3–5 Sätze, in eigenen Worten, ohne in die Notizen zu schauen."
              aria-label="Zusammenfassung"
            />
          ) : mode === "recall" ? (
            <p className="text-sm text-muted-foreground italic">Formuliere zuerst selbst eine Zusammenfassung – dann im Lesemodus vergleichen.</p>
          ) : fields.summary.trim() ? (
            <Markdown>{fields.summary}</Markdown>
          ) : (
            <button type="button" onClick={() => focusIn("summary")} className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Pencil className="size-4" /> Zusammenfassung schreiben
            </button>
          )}
        </section>
      </div>

      {/* Links: documents & flashcards */}
      <div className="grid gap-4 @xl:grid-cols-2 print:hidden">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Unterlagen</h2>
            <Button size="sm" variant="ghost" onClick={() => setDialog("link")}><Plus className="size-3.5" /> Verknüpfen</Button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {note.documents.length === 0 && <p className="text-sm text-muted-foreground">Noch keine PDFs verknüpft.</p>}
            {note.documents.map(({ document: d }) => (
              <span key={d.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background py-1 pr-1 pl-2 text-sm">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <button type="button" onClick={() => workspace.openBeside(`/documents/${d.id}`)} className="truncate hover:underline" title="Daneben öffnen">{d.title}</button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`Verknüpfung zu ${d.title} entfernen`}
                  onClick={() => unlink.run({ noteId: note.id, documentId: d.id })}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <Dropzone target={{ moduleId: note.module.id, noteId: note.id }} compact />
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Karteikarten</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => runStep("review")}><Sparkles className="size-3.5" /> Aus Zeilen</Button>
              <Button size="sm" variant="ghost" onClick={() => { setCardDraft(null); setDialog("card"); }}><Plus className="size-3.5" /> Neu</Button>
            </div>
          </div>
          {note.flashcards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Jede Zeile mit Frage links und Antwort rechts wird mit einem Klick zur Karteikarte.</p>
          ) : (
            <>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {note.flashcards.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Link href={`/flashcards/${c.id}`} className="truncate hover:underline">{c.front}</Link>
                  </li>
                ))}
              </ul>
              <Link href={`/review/session?module=${note.module.id}&note=${note.id}&mode=cram`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline">
                Diese {note.flashcards.length} Karten jetzt üben <ArrowRight className="size-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>

      {dialog === "cards" && (
        <CuesToCardsDialog
          open
          onOpenChange={() => setDialog(null)}
          rows={cardRows ?? fields.sections}
          existingFronts={existingFronts}
          moduleId={note.module.id}
          noteId={note.id}
          defaultTopic={fields.title.trim() || displayTitle}
        />
      )}
      {dialog === "card" && (
        <FlashcardDialog
          open
          onOpenChange={() => setDialog(null)}
          topics={topics}
          defaults={{
            moduleId: note.module.id,
            noteId: note.id,
            topic: fields.title.trim() || displayTitle,
            documentIds: [...linkedIds],
            front: cardDraft?.front ?? "",
            back: cardDraft?.back ?? "",
          }}
        />
      )}
      {dialog === "link" && (
        <LinkDocumentDialog
          onClose={() => setDialog(null)}
          documents={allDocuments.filter((d) => !linkedIds.has(d.id))}
          moduleId={note.module.id}
          onPick={async (documentId) => {
            if ((await link.run({ noteId: note.id, documentId })) !== undefined) setDialog(null);
          }}
        />
      )}
      {dialog === "insert" && (
        <InsertDocLinkDialog
          onClose={() => setDialog(null)}
          documents={[...note.documents.map((d) => d.document), ...moduleDocuments.filter((d) => !linkedIds.has(d.id))]}
          onInsert={(id, title, page) => {
            setDialog(null);
            // Wait for the dialog to release focus before inserting.
            setTimeout(() => insertAtCursor(lastFocused.current, docLinkMarkdown(id, title, page)), 50);
            if (!linkedIds.has(id)) void link.run({ noteId: note.id, documentId: id });
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title="Sitzung löschen?"
        description="Die Mitschrift wird endgültig gelöscht. Daraus erstellte Karteikarten bleiben erhalten."
        onConfirm={async () => {
          if ((await del.run({ id: note.id })) !== undefined) {
            router.push(`/modules/${note.module.id}?tab=sessions`);
            router.refresh();
          }
        }}
      />
    </div>
  );
}
