"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookX, Clock, Eye, PenLine, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";
import { gradeExam, isAnswered, type ExamAnswers, type ExamQuestion, type QuestionAnswer } from "@/lib/exam";
import { cn } from "@/lib/utils";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { showReward } from "@/components/gamification/reward";
import { useAction } from "@/hooks/use-action";
import { submitAttempt } from "@/server/actions/exams";
import { QuestionCard } from "./question-card";
import { ExamResult } from "./exam-result";

interface ExamInfo {
  id: string;
  title: string;
  timeLimit: number | null;
  moduleId: string;
  moduleName: string;
  questions: ExamQuestion[];
}

type Phase = "intro" | "answer" | "grade" | "done";
interface Draft {
  answers: ExamAnswers;
  startedAt: number;
}

const draftKey = (id: string) => `exam-draft:${id}`;

function loadDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(id), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(id));
  } catch {}
}

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * Exam simulation: conditions first (no notes, timer), answers are only
 * revealed after submission, then honest self-grading of free-text tasks.
 * Rendered client-only (draft lives in localStorage).
 */
export function ExamRunner({ exam }: { exam: ExamInfo }) {
  const router = useRouter();
  const [draft] = useState(() => loadDraft(exam.id));
  const [phase, setPhase] = useState<Phase>(draft ? "answer" : "intro");
  const [answers, setAnswers] = useState<ExamAnswers>(draft?.answers ?? {});
  const [startedAt, setStartedAt] = useState(() => draft?.startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [xp, setXp] = useState(0);
  const submit = useAction(submitAttempt, { refresh: false });

  const limitMs = exam.timeLimit ? exam.timeLimit * 60_000 : null;
  const answered = exam.questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const elapsedSec = ((endedAt ?? now) - startedAt) / 1000;
  const graded = gradeExam(exam.questions, answers);

  useEffect(() => {
    if (phase !== "answer") return;
    const t = setInterval(() => {
      const current = Date.now();
      // No re-render for a clock nobody sees (the time limit is still enforced).
      if (!document.hidden) setNow(current);
      if (limitMs && current - startedAt >= limitMs) {
        toast("Zeit ist um", { description: "Deine Antworten wurden abgegeben." });
        setEndedAt(startedAt + limitMs);
        setPhase("grade");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase, startedAt, limitMs]);

  useEffect(() => {
    if (phase === "answer") saveDraft(exam.id, { answers, startedAt });
  }, [phase, answers, startedAt, exam.id]);

  function start() {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setAnswers({});
    setEndedAt(null);
    setPhase("answer");
    window.scrollTo({ top: 0 });
  }

  function setAnswer(id: string, a: QuestionAnswer) {
    setAnswers((prev) => ({ ...prev, [id]: a }));
  }

  function handIn() {
    setConfirm(false);
    setEndedAt(Date.now());
    setPhase("grade");
    window.scrollTo({ top: 0 });
  }

  async function save() {
    const durationSec = Math.round(elapsedSec);
    const res = await submit.run({ examId: exam.id, durationSec, answers });
    if (!res) return;
    saveDraft(exam.id, null);
    setXp(res.reward.xp);
    showReward(res.reward, "Probeklausur geschrieben");
    setPhase("done");
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Link href={`/exams/${exam.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Zurück</Link>
        <p className="text-sm text-muted-foreground">{exam.moduleName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {exam.questions.length} Aufgaben · {graded.max} Punkte · {exam.timeLimit ? `${exam.timeLimit} Minuten` : "ohne Zeitlimit"}
        </p>
        <ul className="mt-8 space-y-4 text-sm">
          <li className="flex gap-3"><BookX className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><strong className="font-medium">Wie in der echten Prüfung:</strong> keine Unterlagen, keine Karten, kein Nachschlagen. Nur so zeigt dir die Probe, was wirklich sitzt.</span></li>
          <li className="flex gap-3"><Timer className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{exam.timeLimit ? "Der Timer läuft. Bei Ablauf wird automatisch abgegeben." : "Kein Zeitlimit – die Zeit wird trotzdem gemessen."} Du kannst die Seite schließen, dein Stand bleibt erhalten.</span></li>
          <li className="flex gap-3"><Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>Lösungen siehst du erst nach der Abgabe. Freitext bewertest du selbst anhand der Musterlösung.</span></li>
          <li className="flex gap-3"><PenLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>Lieber eine falsche Antwort als keine: Auch Fehler sind Lernmaterial – sie werden mit einem Klick zu Karteikarten.</span></li>
        </ul>
        <Button size="lg" className="mt-10 w-full" onClick={start}>Prüfung beginnen</Button>
      </div>
    );
  }

  const remaining = limitMs ? (limitMs - (now - startedAt)) / 1000 : null;
  const reviewMode = phase !== "answer";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b bg-background px-4 py-3 sm:mx-0 sm:rounded-b-xl sm:border-x sm:px-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{exam.title}</p>
            <p className="text-xs text-muted-foreground">
              {phase === "answer" && `${answered} von ${exam.questions.length} bearbeitet`}
              {phase === "grade" && (graded.pending ? `${graded.pending} Freitext${graded.pending === 1 ? "" : "e"} noch bewerten` : "Alles bewertet")}
              {phase === "done" && "Ergebnis gespeichert"}
            </p>
          </div>
          {phase === "answer" && (
            <>
              <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm tabular-nums", remaining !== null && remaining < 300 && "border-danger/40 text-danger")}>
                <Clock className="size-3.5" />{remaining !== null ? clock(remaining) : clock(elapsedSec)}
              </span>
              <Button size="sm" onClick={() => (answered < exam.questions.length ? setConfirm(true) : handIn())}>Abgeben</Button>
            </>
          )}
          {phase === "grade" && <Button size="sm" onClick={save} loading={submit.pending} disabled={graded.pending > 0}>Ergebnis speichern</Button>}
          {phase === "done" && (
            <>
              <Button size="sm" variant="secondary" onClick={start}><RotateCcw className="size-3.5" />Nochmal</Button>
              <Link href={`/exams/${exam.id}`} className={buttonClass("primary", "sm")}>Fertig</Link>
            </>
          )}
        </div>
        <nav className="mt-2.5 flex flex-wrap gap-1" aria-label="Aufgaben">
          {exam.questions.map((q, i) => {
            const r = graded.results[i]!;
            return (
              <a
                key={q.id}
                href={`#${q.id}`}
                className={cn(
                  "flex size-6 items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors",
                  !reviewMode && (isAnswered(q, answers[q.id]) ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"),
                  reviewMode && r.status === "correct" && "bg-success text-white",
                  reviewMode && r.status === "partial" && "bg-warning text-black",
                  reviewMode && (r.status === "wrong" || r.status === "unanswered") && "bg-danger/80 text-white",
                  reviewMode && r.status === "pending" && "bg-muted text-foreground ring-1 ring-warning",
                )}
              >
                {i + 1}
              </a>
            );
          })}
        </nav>
      </div>

      {phase === "done" && (
        <div className="mb-8">
          <ExamResult moduleId={exam.moduleId} questions={exam.questions} answers={answers} durationSec={Math.round(elapsedSec)} xp={xp} />
        </div>
      )}
      {phase === "grade" && graded.pending > 0 && (
        <p className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Vergleiche deine Freitextantworten mit der Musterlösung und vergib Punkte. Ehrlich bewerten lohnt sich: Nur so zeigt die Note, wo du wirklich stehst.
        </p>
      )}

      <div className="space-y-4 pb-16">
        {exam.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            answer={answers[q.id]}
            mode={reviewMode ? "review" : "answer"}
            onChange={phase === "done" ? undefined : (a) => setAnswer(q.id, a)}
          />
        ))}
        {phase === "answer" && (
          <Button size="lg" className="w-full" onClick={() => (answered < exam.questions.length ? setConfirm(true) : handIn())}>Abgeben</Button>
        )}
        {phase === "grade" && (
          <Button size="lg" className="w-full" onClick={save} loading={submit.pending} disabled={graded.pending > 0}>Ergebnis speichern</Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Jetzt abgeben?"
        description={`${exam.questions.length - answered} Aufgabe${exam.questions.length - answered === 1 ? " ist" : "n sind"} noch unbearbeitet. Ein Versuch bringt oft Teilpunkte.`}
        confirmLabel="Abgeben"
        onConfirm={handIn}
      />
    </div>
  );
}
