"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { CalendarRange, Flag, Loader2, Repeat, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { ModuleDot } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { moduleColor } from "@/lib/constants";
import { fmtDate, fmtTime } from "@/lib/dates";
import { DEFAULT_PLAN_OPTIONS, DEFAULT_WEEKLY, KIND_LABELS, LEAD_OPTIONS, type BlockKind, type PlanMode } from "@/lib/study-plan";
import { cn } from "@/lib/utils";
import { createStudyPlan, previewStudyPlan, studyPlanTargets } from "@/server/actions/study-plan";
import type { planTargets } from "@/server/services/study-plan";

type Preview = { examKey: string; moduleId: string; kind: BlockKind; title: string; start: string; end: string; daysBefore: number | null }[];
type Targets = Awaited<ReturnType<typeof planTargets>>;
interface Row {
  key: string;
  name: string;
  color: string;
  sub: string;
  examDate: Date | null;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const BLOCK_MINUTES: Record<PlanMode, number[]> = { exam: [45, 60, 90, 120], weekly: [30, 45, 60] };
/** Exams closer than this are preselected – the rest is there, but unticked. */
const PRESELECT_DAYS = 42;

/** Button + dialog: plans study sessions – for the exam phase or as a weekly rhythm. Always available. */
export function StudyPlanButton({
  preselectModuleId,
  size = "sm",
  variant = "ghost",
  label = "Lernplan",
}: {
  preselectModuleId?: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "primary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} title="Lerneinheiten planen (⌥⌘L)">
        <CalendarRange className="size-3.5" /> {label}
      </Button>
      {open && <StudyPlanDialog preselectModuleId={preselectModuleId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function StudyPlanDialog({ onClose, preselectModuleId }: { onClose: () => void; preselectModuleId?: string }) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const load = useAction(studyPlanTargets, { refresh: false });
  const { run: loadTargets } = load;
  useEffect(() => {
    let current = true;
    void loadTargets({}).then((t) => current && t && setTargets(t));
    return () => {
      current = false;
    };
  }, [loadTargets]);

  return (
    <Dialog
      open
      onOpenChange={onClose}
      size="xl"
      title="Lernplan erstellen"
      description="Verteilte, gemischte Lerneinheiten – um Vorlesungen und Termine herum. Du siehst alles, bevor es in den Kalender kommt."
    >
      {targets ? (
        <PlanForm targets={targets} preselectModuleId={preselectModuleId} onClose={onClose} />
      ) : (
        <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Prüfungen und Module werden geladen …
        </div>
      )}
    </Dialog>
  );
}

function initialState(targets: Targets, preselectModuleId?: string) {
  const exam = preselectModuleId ? targets.exams.find((e) => e.moduleIds.includes(preselectModuleId)) : undefined;
  if (preselectModuleId && !exam && targets.modules.some((m) => m.key === preselectModuleId)) {
    return { mode: "weekly" as PlanMode, exams: new Set<string>(), modules: new Set([preselectModuleId]) };
  }
  const near = targets.exams.filter((e) => differenceInCalendarDays(e.examDate, new Date()) <= PRESELECT_DAYS);
  return {
    mode: (targets.exams.length ? "exam" : "weekly") as PlanMode,
    exams: new Set(exam ? [exam.key] : (near.length ? near : targets.exams).map((e) => e.key)),
    modules: new Set(targets.modules.map((m) => m.key)),
  };
}

function PlanForm({ targets, preselectModuleId, onClose }: { targets: Targets; preselectModuleId?: string; onClose: () => void }) {
  const [init] = useState(() => initialState(targets, preselectModuleId));
  const [mode, setMode] = useState<PlanMode>(init.mode);
  const [selectedExams, setSelectedExams] = useState(init.exams);
  const [selectedModules, setSelectedModules] = useState(init.modules);
  const [opts, setOpts] = useState(DEFAULT_PLAN_OPTIONS);
  const [weekly, setWeekly] = useState(DEFAULT_WEEKLY);
  const [preview, setPreview] = useState<Preview | null>(null);
  const load = useAction(previewStudyPlan, { refresh: false });
  const save = useAction(createStudyPlan, { refresh: true });
  const { run } = load;

  const selected = mode === "exam" ? selectedExams : selectedModules;
  const input = useMemo(() => ({ mode, keys: [...selected], ...opts, ...weekly }), [mode, selected, opts, weekly]);

  useEffect(() => {
    let current = true;
    void run(input).then((blocks) => {
      if (current && blocks) setPreview(blocks);
    });
    return () => {
      current = false;
    };
  }, [run, input]);

  const rows: Row[] =
    mode === "exam"
      ? targets.exams.map((e) => ({ key: e.key, name: e.name, color: e.color, examDate: e.examDate, sub: `${fmtDate(e.examDate, "dd.MM.")} · in ${differenceInCalendarDays(e.examDate, new Date())} T.` }))
      : targets.modules.map((m) => ({ key: m.key, name: m.name, color: m.color, examDate: m.examDate, sub: m.semester }));
  const setOpt = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const switchMode = (m: PlanMode) => {
    setMode(m);
    setPreview(null);
    if (!BLOCK_MINUTES[m].includes(opts.blockMinutes)) setOpt("blockMinutes", m === "weekly" ? 45 : 90);
  };
  const toggle = (key: string, on: boolean) =>
    (mode === "exam" ? setSelectedExams : setSelectedModules)((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const minutes = (preview ?? []).reduce((sum, b) => sum + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000, 0);
  const days = new Map<string, Preview>();
  for (const b of preview ?? []) {
    const k = b.start.slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), b]);
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <>
      <div className="mb-5 inline-flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Art des Plans">
        {([
          ["exam", "Bis zur Prüfung", Target],
          ["weekly", "Jede Woche", Repeat],
        ] as const).map(([m, text, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors", mode === m ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-3.5" /> {text}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-sm font-medium">{mode === "exam" ? "Prüfungen" : "Module"}</p>
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                {mode === "exam" ? (
                  <>
                    Noch keine Prüfungstermine. Trag sie im Modul unter <b className="font-medium text-foreground">Bearbeiten → Prüfung</b> ein – oder plane schon jetzt{" "}
                    <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => switchMode("weekly")}>jede Woche</button>.
                  </>
                ) : (
                  "Noch keine Module. Lege zuerst ein Semester mit Modulen an."
                )}
              </div>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <Checkbox
                    key={r.key}
                    checked={selected.has(r.key)}
                    onChange={(ev) => toggle(r.key, ev.target.checked)}
                    label={
                      <span className="flex min-w-0 items-center gap-2">
                        <ModuleDot color={r.color} />
                        <span className="truncate">{r.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{r.sub}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            {mode === "exam" ? (
              <Field label="Lernbeginn" className="col-span-2">
                <Select value={opts.leadDays ?? "asap"} onChange={(e) => setOpt("leadDays", e.target.value === "asap" ? null : Number(e.target.value))}>
                  {LEAD_OPTIONS.map((o) => <option key={o.label} value={o.value ?? "asap"}>{o.label}</option>)}
                </Select>
              </Field>
            ) : (
              <>
                <Field label="Zeitraum">
                  <Select value={weekly.weeks} onChange={(e) => setWeekly((w) => ({ ...w, weeks: Number(e.target.value) }))}>
                    {[1, 2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? "Diese Woche" : `${n} Wochen`}</option>)}
                  </Select>
                </Field>
                <Field label="Pro Modul & Woche">
                  <Select value={weekly.perWeek} onChange={(e) => setWeekly((w) => ({ ...w, perWeek: Number(e.target.value) }))}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}×</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Von">
              <Select value={opts.dayStart} onChange={(e) => setOpt("dayStart", Number(e.target.value))}>
                {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
              </Select>
            </Field>
            <Field label="Bis">
              <Select value={opts.dayEnd} onChange={(e) => setOpt("dayEnd", Number(e.target.value))}>
                {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
              </Select>
            </Field>
            <Field label="Einheit">
              <Select value={opts.blockMinutes} onChange={(e) => setOpt("blockMinutes", Number(e.target.value))}>
                {BLOCK_MINUTES[mode].map((m) => <option key={m} value={m}>{m} Min.</option>)}
              </Select>
            </Field>
            <Field label="Max. pro Tag">
              <Select value={opts.maxPerDay} onChange={(e) => setOpt("maxPerDay", Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Checkbox className="col-span-2" checked={opts.restDay === 0} onChange={(e) => setOpt("restDay", e.target.checked ? 0 : null)} label="Sonntag bleibt frei" />
          </section>

          <details className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Warum so?</summary>
            {mode === "exam" ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li><b className="font-medium text-foreground">Verteilt:</b> Mehrere Runden bis zur Prüfung – die Abstände werden zur Prüfung hin kürzer. Wer früher anfängt, bekommt zusätzlich kurze Auffrisch-Runden.</li>
                <li><b className="font-medium text-foreground">Gemischt:</b> Nie zweimal dasselbe Modul an einem Tag; Module wechseln sich ab.</li>
                <li><b className="font-medium text-foreground">Abrufen:</b> Jede Einheit fragt ab, bis alles einmal gewusst wurde (Successive Relearning).</li>
                <li><b className="font-medium text-foreground">Generalprobe</b> drei Tage vorher, <b className="font-medium text-foreground">kurze letzte Runde</b> am Vortag – Schlaf festigt.</li>
              </ul>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li><b className="font-medium text-foreground">Direkt nach der Vorlesung:</b> Der Rückblick liegt am Tag nach der Vorlesung des Moduls – solange es frisch ist.</li>
                <li><b className="font-medium text-foreground">Kurz:</b> Höchstens eine Stunde – Abfragen, Zusammenfassung, Karteikarten.</li>
                <li><b className="font-medium text-foreground">Klausurenphase wird Wiederholung:</b> Was jede Woche einmal abgerufen wurde, muss vor der Prüfung nicht neu gelernt werden.</li>
              </ul>
            )}
          </details>
        </div>

        <div className="flex min-h-72 min-w-0 flex-col rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
            <span className="font-medium">Vorschau</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              {preview && preview.length > 0 && <>{preview.length} Einheiten · {days.size} Tage · {Math.round(minutes / 60)} h</>}
              {load.pending && <Loader2 className="size-4 animate-spin" aria-label="Lädt" />}
            </span>
          </div>
          {preview && preview.length > 0 && <PlanTimeline rows={rows.filter((r) => selected.has(r.key))} blocks={preview} showExams={mode === "exam"} />}
          <div className="max-h-[38dvh] min-h-0 flex-1 overflow-y-auto">
            {preview && preview.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {selected.size === 0 ? "Wähle links aus, wofür geplant werden soll." : "Keine freien Zeiten gefunden – Zeitfenster vergrößern oder mehr Einheiten pro Tag erlauben."}
              </p>
            )}
            {[...days].map(([day, blocks]) => (
              <div key={day} className="border-b px-3 py-2 last:border-b-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{fmtDate(new Date(blocks[0]!.start), "EEEE, dd.MM.")}</p>
                <ul className="space-y-1">
                  {blocks.map((b) => {
                    const row = byKey.get(b.examKey);
                    return (
                      <li key={b.start} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{fmtTime(new Date(b.start))}–{fmtTime(new Date(b.end))}</span>
                        <ModuleDot color={row?.color ?? "slate"} />
                        <span className="min-w-0 flex-1 truncate">{row?.name}</span>
                        <span className={cn("shrink-0 rounded-full border px-2 py-px text-[11px]", b.kind === "mock" ? "border-primary/40 text-primary" : "text-muted-foreground")}>
                          {KIND_LABELS[b.kind]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">Der ganze Plan ist eine Serie – im Kalender lässt er sich mit einem Klick wieder entfernen.</p>
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button
          disabled={!preview?.length || load.pending}
          loading={save.pending}
          onClick={async () => {
            const res = await save.run(input);
            if (res) onClose();
          }}
        >
          {preview?.length ? `${preview.length} Lerneinheiten eintragen` : "Nichts zu planen"}
        </Button>
      </div>
    </>
  );
}

/** Kind → marker: hollow = overview, dot = refresher, filled = retrieval, diamond = mock exam, square = last round. */
function Marker({ kind, color }: { kind: BlockKind; color: string }) {
  const c = moduleColor(color);
  switch (kind) {
    case "overview":
      return <span className={cn("block size-2.5 rounded-full border-2 bg-background", c.border)} />;
    case "spaced":
      return <span className={cn("block size-1.5 rounded-full opacity-70", c.dot)} />;
    case "mock":
      return <span className={cn("block size-2.5 rotate-45 rounded-[2px] ring-2 ring-background", c.dot)} />;
    case "final":
      return <span className={cn("block size-2 rounded-[2px]", c.dot)} />;
    default:
      return <span className={cn("block size-2.5 rounded-full", c.dot)} />;
  }
}

/** One lane per exam/module from today to the last exam: when what happens, at a glance. */
function PlanTimeline({ rows, blocks, showExams }: { rows: Row[]; blocks: Preview; showExams: boolean }) {
  const from = startOfDay(new Date());
  const lastBlock = blocks.reduce((max, b) => Math.max(max, new Date(b.start).getTime()), from.getTime());
  const lastExam = showExams ? rows.reduce((max, r) => Math.max(max, r.examDate?.getTime() ?? 0), 0) : 0;
  const total = Math.max(7, differenceInCalendarDays(new Date(Math.max(lastBlock, lastExam)), from) + 2);
  const pos = (d: Date) => `${((differenceInCalendarDays(d, from) + 0.5) / total) * 100}%`;
  const step = total > 120 ? 28 : total > 56 ? 14 : 7;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => addDays(from, i * step));
  const kinds = [...new Set(blocks.map((b) => b.kind))];

  return (
    <div className="border-b px-3 pt-2 pb-3">
      <div className="relative ml-28 h-4 text-[10px] text-muted-foreground tabular-nums">
        {ticks.map((t) => (
          <span key={t.toISOString()} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(t) }}>
            {fmtDate(t, "dd.MM.")}
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="flex w-26 shrink-0 items-center gap-1.5 text-xs">
              <ModuleDot color={r.color} className="size-2" />
              <span className="truncate" title={r.name}>{r.name}</span>
            </span>
            <div className="relative h-5 min-w-0 flex-1 rounded bg-muted/50">
              {ticks.map((t) => (
                <span key={t.toISOString()} className="absolute inset-y-0 w-px bg-border" style={{ left: pos(t) }} aria-hidden />
              ))}
              {blocks
                .filter((b) => b.examKey === r.key)
                .map((b) => (
                  <span
                    key={b.start}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: pos(new Date(b.start)) }}
                    title={`${fmtDate(new Date(b.start), "EE dd.MM.")} ${fmtTime(new Date(b.start))} · ${KIND_LABELS[b.kind]}`}
                  >
                    <Marker kind={b.kind} color={r.color} />
                  </span>
                ))}
              {showExams && r.examDate && differenceInCalendarDays(r.examDate, from) < total && (
                <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground" style={{ left: pos(r.examDate) }} title={`Prüfung ${fmtDate(r.examDate, "EE dd.MM., HH:mm")}`}>
                  <Flag className="size-3.5 fill-current" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 ml-28 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <Marker kind={k} color="slate" /> {KIND_LABELS[k]}
          </span>
        ))}
        {showExams && (
          <span className="inline-flex items-center gap-1.5">
            <Flag className="size-3 fill-current text-foreground" /> Prüfung
          </span>
        )}
      </div>
    </div>
  );
}
