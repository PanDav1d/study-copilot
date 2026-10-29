"use client";

import { Check, X } from "lucide-react";
import { gradeQuestion, optionLetter, QUESTION_TYPE_LABELS, type ExamQuestion, type QuestionAnswer } from "@/lib/exam";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";

const STATUS = {
  correct: { label: "Richtig", tone: "success" },
  partial: { label: "Teilweise", tone: "warning" },
  wrong: { label: "Falsch", tone: "danger" },
  unanswered: { label: "Nicht bearbeitet", tone: "neutral" },
  pending: { label: "Selbst bewerten", tone: "warning" },
} as const;

function fmtPoints(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/**
 * One exam task. `answer` mode is the exam itself (no hints), `review` shows the
 * solution; text tasks can then be self-graded against the model answer.
 */
export function QuestionCard({
  index,
  question: q,
  answer,
  mode,
  onChange,
}: {
  index: number;
  question: ExamQuestion;
  answer: QuestionAnswer | undefined;
  mode: "answer" | "review";
  onChange?: (a: QuestionAnswer) => void;
}) {
  const review = mode === "review";
  const graded = review ? gradeQuestion(q, answer) : null;
  const chosen = new Set(answer?.choice ?? []);
  const multiple = q.type === "multiple";

  function toggle(i: number) {
    if (!onChange || review) return;
    if (multiple) {
      const next = new Set(chosen);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      onChange({ ...answer, choice: [...next].sort((a, b) => a - b) });
    } else {
      onChange({ ...answer, choice: chosen.has(i) ? [] : [i] });
    }
  }

  return (
    <section id={q.id} className="scroll-mt-28 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <header className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Aufgabe {index + 1}</span>
        <span>·</span>
        <span>{QUESTION_TYPE_LABELS[q.type]}{multiple && !review ? " – mehrere Antworten möglich" : ""}</span>
        {q.topic && <><span>·</span><span>{q.topic}</span></>}
        <span className="ml-auto flex items-center gap-2">
          {graded && <Badge tone={STATUS[graded.status].tone}>{STATUS[graded.status].label}</Badge>}
          <span className="font-medium tabular-nums">
            {graded && graded.status !== "pending" ? `${fmtPoints(graded.earned)} / ` : ""}{fmtPoints(q.points)} P.
          </span>
        </span>
      </header>

      <Markdown className="text-[15px]">{q.prompt}</Markdown>

      {q.type !== "text" ? (
        <div className="mt-4 space-y-2" role={multiple ? "group" : "radiogroup"}>
          {q.options.map((o, i) => {
            const selected = chosen.has(i);
            const isCorrect = q.correct.includes(i);
            return (
              <button
                key={i}
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={selected}
                aria-label={`${optionLetter(i)}: ${o}`}
                disabled={review}
                onClick={() => toggle(i)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  !review && (selected ? "border-foreground/60 bg-accent" : "hover:bg-accent/50"),
                  review && isCorrect && "border-success/40 bg-success/8",
                  review && selected && !isCorrect && "border-danger/40 bg-danger/8",
                  review && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-5 shrink-0 items-center justify-center border text-[11px] font-semibold",
                    multiple ? "rounded" : "rounded-full",
                    selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
                    review && isCorrect && "border-success bg-success text-white",
                    review && selected && !isCorrect && "border-danger bg-danger text-white",
                  )}
                >
                  {review && isCorrect ? <Check className="size-3" /> : review && selected ? <X className="size-3" /> : optionLetter(i)}
                </span>
                <span className="min-w-0 flex-1 [&_p]:m-0"><Markdown>{o}</Markdown></span>
              </button>
            );
          })}
        </div>
      ) : review ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Deine Antwort</p>
            {answer?.text?.trim() ? <Markdown>{answer.text}</Markdown> : <p className="text-sm text-muted-foreground italic">Keine Antwort</p>}
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="mb-1.5 text-xs font-medium text-success">Musterlösung</p>
            <Markdown>{q.answer}</Markdown>
          </div>
        </div>
      ) : (
        <Textarea
          className="mt-4 min-h-36"
          value={answer?.text ?? ""}
          onChange={(e) => onChange?.({ ...answer, text: e.target.value })}
          placeholder="Deine Antwort (Markdown möglich) …"
          aria-label={`Antwort zu Aufgabe ${index + 1}`}
        />
      )}

      {review && q.type === "text" && answer?.text?.trim() && onChange && (
        <SelfGrade points={q.points} value={answer.self} onChange={(self) => onChange({ ...answer, self })} />
      )}

      {review && (q.explanation || (q.type !== "text" && q.answer)) && (
        <div className="mt-4 border-t pt-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Erklärung</p>
          <Markdown>{[q.type !== "text" ? q.answer : "", q.explanation].filter(Boolean).join("\n\n")}</Markdown>
        </div>
      )}
    </section>
  );
}

/** Honest self-assessment against the model solution (in half points). */
function SelfGrade({ points, value, onChange }: { points: number; value: number | undefined; onChange: (v: number) => void }) {
  const step = points > 10 ? Math.ceil(points / 10) : points <= 3 ? 0.5 : 1;
  const steps: number[] = [];
  for (let v = 0; v <= points + 1e-9; v += step) steps.push(Math.round(v * 10) / 10);
  if (steps.at(-1) !== points) steps.push(points);
  return (
    <div className="mt-4 rounded-lg bg-muted/60 p-3">
      <p className="mb-2 text-xs font-medium">Wie viele Punkte gibt deine Antwort im Vergleich zur Musterlösung? Sei streng – wie die Korrektur.</p>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={value === s}
            className={cn(
              "h-8 min-w-10 rounded-md border px-2.5 text-sm font-medium tabular-nums transition-colors",
              value === s ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-accent",
            )}
          >
            {fmtPoints(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
