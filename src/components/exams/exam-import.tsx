"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ClipboardCopy, ClipboardPaste, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildExamPrompt, parseExamText, QUESTION_TYPE_LABELS, type ExamPromptContext, type ExamPromptOptions } from "@/lib/exam";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ModuleSelect } from "@/components/forms/pickers";
import { useAction } from "@/hooks/use-action";
import { createExam } from "@/server/actions/exams";

/**
 * Two steps: copy a prompt (built from the module's exam info and the user's
 * own Cornell notes) into any AI chat, paste the JSON answer back.
 */
export function ExamImport({ moduleId: initialModule, contexts }: { moduleId: string; contexts: Record<string, ExamPromptContext> }) {
  const router = useRouter();
  const [moduleId, setModuleId] = useState(initialModule);
  const [opts, setOpts] = useState<ExamPromptOptions>({ questionCount: 15, difficulty: "mittel", includeNotes: true });
  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [source, setSource] = useState("");
  const [copied, setCopied] = useState(false);
  const create = useAction(createExam, { success: "Probeklausur angelegt" });

  const ctx = contexts[moduleId];
  const prompt = ctx ? buildExamPrompt(ctx, opts) : "";
  const parsed = useMemo(() => (source.trim() ? parseExamText(source) : null), [source]);
  const noteChars = ctx?.notes.length ?? 0;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt kopiert", { description: "Füge ihn in ChatGPT, Claude o. Ä. ein." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Kopieren nicht möglich – markiere den Text manuell.");
    }
  }

  async function paste() {
    try {
      setSource(await navigator.clipboard.readText());
    } catch {
      toast.error("Kein Zugriff auf die Zwischenablage – füge mit ⌘V ein.");
    }
  }

  async function save() {
    const res = await create.run({ moduleId, title, timeLimit, source });
    if (res) router.push(`/exams/${res.id}`);
  }

  const stats = parsed?.ok
    ? {
        count: parsed.exam.questions.length,
        points: parsed.exam.questions.reduce((s, q) => s + q.points, 0),
        types: (["single", "multiple", "text"] as const)
          .map((t) => [t, parsed.exam.questions.filter((q) => q.type === t).length] as const)
          .filter(([, n]) => n > 0),
      }
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">1</span>Prompt kopieren</span>} description="Erzeuge die Klausur mit einer KI deiner Wahl – auf Basis deiner eigenen Mitschriften." />
        <CardBody className="space-y-4">
          <Field label="Modul" htmlFor="exam-module">
            <ModuleSelect id="exam-module" value={moduleId} onChange={setModuleId} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aufgaben" htmlFor="exam-count">
              <Input id="exam-count" type="number" min={3} max={60} value={opts.questionCount} onChange={(e) => setOpts({ ...opts, questionCount: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label="Schwierigkeit" htmlFor="exam-difficulty">
              <Select id="exam-difficulty" value={opts.difficulty} onChange={(e) => setOpts({ ...opts, difficulty: e.target.value as ExamPromptOptions["difficulty"] })}>
                <option value="leicht">Leicht</option>
                <option value="mittel">Prüfungsniveau</option>
                <option value="schwer">Schwer</option>
              </Select>
            </Field>
          </div>
          <Checkbox
            checked={opts.includeNotes}
            onChange={(e) => setOpts({ ...opts, includeNotes: e.target.checked })}
            label={<span>Meine Sitzungsnotizen mitgeben <span className="text-muted-foreground">({noteChars ? `${Math.round(noteChars / 1000)}k Zeichen` : "noch keine"})</span></span>}
          />
          <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{prompt || "Wähle ein Modul."}</pre>
          <Button onClick={copyPrompt} disabled={!prompt} variant="secondary" className="w-full">
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? "Kopiert" : "Prompt kopieren"}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">2</span>Antwort einfügen</span>}
          description="Das JSON der KI – oder eine eigene Altklausur im selben Format."
          action={<Button size="sm" variant="ghost" onClick={paste}><ClipboardPaste className="size-3.5" /> Einfügen</Button>}
        />
        <CardBody className="space-y-4">
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={'{\n  "title": "Probeklausur …",\n  "questions": [ … ]\n}'}
            className="min-h-64 font-mono text-xs"
            spellCheck={false}
            aria-label="Probeklausur (JSON)"
          />

          {parsed && !parsed.ok && (
            <div className="space-y-1 rounded-lg border border-danger/25 bg-danger/8 p-3 text-sm text-danger" role="alert">
              {parsed.errors.slice(0, 5).map((e) => (
                <p key={e} className="flex gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" />{e}</p>
              ))}
              {parsed.errors.length > 5 && <p className="pl-6">… und {parsed.errors.length - 5} weitere</p>}
            </div>
          )}

          {parsed?.ok && stats && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-success/25 bg-success/8 p-3 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-success"><Sparkles className="size-4" />{stats.count} Aufgaben · {stats.points} Punkte</span>
                <span className="text-muted-foreground">{stats.types.map(([t, n]) => `${n}× ${QUESTION_TYPE_LABELS[t]}`).join(" · ")}</span>
              </div>
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <Field label="Titel" htmlFor="exam-title">
                  <Input id="exam-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={parsed.exam.title ?? "Probeklausur"} />
                </Field>
                <Field label="Zeit (Min.)" htmlFor="exam-time">
                  <Input id="exam-time" type="number" min={1} max={600} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder={parsed.exam.timeLimit ? String(parsed.exam.timeLimit) : "ohne"} />
                </Field>
              </div>
            </>
          )}

          <Button onClick={save} disabled={!parsed?.ok || !moduleId} loading={create.pending} className="w-full">
            Probeklausur speichern
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
