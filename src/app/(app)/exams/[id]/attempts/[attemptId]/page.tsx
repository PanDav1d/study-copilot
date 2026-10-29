import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getAttempt, getExam } from "@/server/queries/exams";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/misc";
import { ExamResult } from "@/components/exams/exam-result";
import { QuestionCard } from "@/components/exams/question-card";

export const metadata: Metadata = { title: "Versuch" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const user = await requireUser();
  const { id, attemptId } = await params;
  const [exam, attempt] = await Promise.all([getExam(user.id, id), getAttempt(user.id, id, attemptId)]);
  if (!exam || !attempt) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumbs={<><Link href="/exams" className="hover:text-foreground">Probeklausuren</Link> / <Link href={`/exams/${exam.id}`} className="hover:text-foreground">{exam.title}</Link></>}
        title={`Versuch vom ${fmtDateTime(attempt.createdAt)}`}
      />
      <div className="space-y-4">
        <ExamResult moduleId={exam.module.id} questions={exam.questions} answers={attempt.answers} durationSec={attempt.durationSec} />
        {exam.questions.map((q, i) => (
          <QuestionCard key={q.id} index={i} question={q} answer={attempt.answers[q.id]} mode="review" />
        ))}
      </div>
    </div>
  );
}
