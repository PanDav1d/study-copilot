"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { fmtGrade, gradeExam, questionToCard, type ExamAnswers, type ExamQuestion } from "@/lib/exam";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { Ring } from "@/components/gamification/ring";
import { showReward } from "@/components/gamification/reward";
import { useAction } from "@/hooks/use-action";
import { createFlashcards } from "@/server/actions/flashcards";

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function verdict(percent: number) {
  if (percent >= 90) return "Hervorragend – das sitzt.";
  if (percent >= 75) return "Stark. Die Lücken unten schließen, dann passt's.";
  if (percent >= 50) return "Bestanden. Jetzt gezielt die schwachen Themen wiederholen.";
  return "Noch nicht bestanden – genau dafür ist die Probe da. Fehler → Karteikarten.";
}

/** Score summary, weakest topics and "mistakes → flashcards". */
export function ExamResult({
  moduleId,
  questions,
  answers,
  durationSec,
  xp,
}: {
  moduleId: string;
  questions: ExamQuestion[];
  answers: ExamAnswers;
  durationSec: number;
  xp?: number;
}) {
  const result = gradeExam(questions, answers);
  const missed = questions.filter((_, i) => result.results[i]!.status !== "correct");
  const [cardsDone, setCardsDone] = useState(false);
  const cards = useAction(createFlashcards, { refresh: false });

  async function makeCards() {
    const byTopic = new Map<string | null, ExamQuestion[]>();
    for (const q of missed) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    let created = 0;
    for (const [topic, qs] of byTopic) {
      const res = await cards.run({ moduleId, noteId: null, topic: topic?.slice(0, 80) ?? null, cards: qs.map(questionToCard) });
      if (!res) return;
      created += res.count;
      showReward(res.reward, undefined, { quiet: true });
    }
    setCardsDone(true);
    toast.success(`${created} Karteikarten erstellt`, { description: "Sie kommen ab heute in deine Wiederholungen." });
  }

  const passed = result.percent >= 50;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-xs sm:p-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <Ring value={result.percent / 100} size={112} stroke={9}>
            <span className="text-2xl font-semibold tabular-nums">{Math.round(result.percent)}%</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Notenschätzung</p>
            <p className={cn("text-4xl font-semibold tracking-tight tabular-nums", passed ? "text-foreground" : "text-danger")}>{fmtGrade(result.grade)}</p>
            <p className="mt-1 text-sm">{verdict(result.percent)}</p>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {result.earned.toLocaleString("de-DE")} / {result.max} Punkte · {fmtDuration(durationSec)}{xp ? ` · +${xp} XP` : ""}
            </p>
          </div>
          {missed.length > 0 && (
            <Button variant={cardsDone ? "secondary" : "primary"} onClick={makeCards} loading={cards.pending} disabled={cardsDone}>
              <Layers className="size-4" /> {cardsDone ? "Karten erstellt" : `${missed.length} Fehler → Karteikarten`}
            </Button>
          )}
        </div>
      </div>

      {result.topics.length > 1 && (
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="mb-3 text-sm font-semibold">Nach Thema <span className="font-normal text-muted-foreground">– schwächste zuerst</span></p>
          <ul className="space-y-2.5">
            {result.topics.map((t) => (
              <li key={t.topic} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
                <span className="truncate">{t.topic}</span>
                <Progress value={t.percent / 100} tone={t.percent >= 75 ? "success" : "primary"} />
                <span className="text-right text-xs text-muted-foreground tabular-nums">{Math.round(t.percent)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
