import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getExam } from "@/server/queries/exams";
import { fmtGrade, germanGrade, QUESTION_TYPE_LABELS } from "@/lib/exam";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ModuleTag, PageHeader, Stat } from "@/components/ui/misc";
import { DeleteAttemptButton, ExamMenu } from "@/components/exams/exam-menu";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const exam = await getExam(user.id, (await params).id);
  return { title: exam?.title ?? "Probeklausur" };
}

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const exam = await getExam(user.id, (await params).id);
  if (!exam) notFound();

  const max = exam.questions.reduce((s, q) => s + q.points, 0);
  const percents = exam.attempts.map((a) => (a.maxScore ? (a.score / a.maxScore) * 100 : 0));
  const best = percents.length ? Math.max(...percents) : null;
  const types = (["single", "multiple", "text"] as const).map((t) => [t, exam.questions.filter((q) => q.type === t).length] as const).filter(([, n]) => n);
  const topics = [...new Set(exam.questions.map((q) => q.topic).filter(Boolean))] as string[];
  // Oldest → newest for the trend
  const trend = [...exam.attempts].reverse();

  return (
    <>
      <PageHeader
        breadcrumbs={<Link href="/exams" className="hover:text-foreground">Probeklausuren</Link>}
        title={exam.title}
        description={<span className="flex flex-wrap items-center gap-2"><ModuleTag name={exam.module.name} color={exam.module.color} />{exam.questions.length} Aufgaben · {max} Punkte · {exam.timeLimit ? `${exam.timeLimit} Minuten` : "ohne Zeitlimit"}</span>}
        actions={
          <>
            <ExamMenu exam={exam} />
            <Link href={`/exams/${exam.id}/take`} className={buttonClass("primary", "lg")}><Play className="size-4" /> {exam.attempts.length ? "Erneut schreiben" : "Prüfung starten"}</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5"><Stat label="Beste Note" value={best === null ? "–" : fmtGrade(germanGrade(best))} hint={best === null ? "Noch kein Versuch" : `${Math.round(best)} %`} /></Card>
            <Card className="p-5"><Stat label="Zuletzt" value={percents[0] === undefined ? "–" : fmtGrade(germanGrade(percents[0]))} hint={percents[0] === undefined ? undefined : `${Math.round(percents[0])} %`} /></Card>
            <Card className="p-5"><Stat label="Versuche" value={exam.attempts.length} /></Card>
          </div>

          <Card>
            <CardHeader title="Verlauf" description="Wiederholte Proben mit Abstand zeigen, ob das Wissen hält." />
            <CardBody>
              {exam.attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch kein Versuch. Tipp: Schreibe die Klausur einmal jetzt und noch einmal ein paar Tage vor der Prüfung.</p>
              ) : (
                <>
                  <div className="mb-4 flex h-24 items-end gap-1.5" aria-hidden>
                    {trend.map((a) => {
                      const p = a.maxScore ? (a.score / a.maxScore) * 100 : 0;
                      return <div key={a.id} className={cn("min-w-3 flex-1 rounded-t", p >= 50 ? "bg-foreground/80" : "bg-danger/70")} style={{ height: `${Math.max(4, p)}%` }} title={`${Math.round(p)} %`} />;
                    })}
                  </div>
                  <ul className="divide-y">
                    {exam.attempts.map((a) => {
                      const p = a.maxScore ? (a.score / a.maxScore) * 100 : 0;
                      return (
                        <li key={a.id} className="flex items-center gap-3 py-2">
                          <Link href={`/exams/${exam.id}/attempts/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-sm hover:underline">
                            <span className="w-10 font-semibold tabular-nums">{fmtGrade(germanGrade(p))}</span>
                            <span className="text-muted-foreground tabular-nums">{a.score.toLocaleString("de-DE")}/{a.maxScore} P. · {Math.round(p)} % · {Math.round(a.durationSec / 60)} min</span>
                            <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                          </Link>
                          <DeleteAttemptButton id={a.id} />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Aufbau" />
          <CardBody className="space-y-3 text-sm">
            <p>{types.map(([t, n]) => `${n}× ${QUESTION_TYPE_LABELS[t]}`).join(" · ")}</p>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => <span key={t} className="rounded-full border px-2.5 py-0.5 text-xs">{t}</span>)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Inhalte bleiben verborgen, bis du die Klausur geschrieben hast.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
