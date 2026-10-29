import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getExam } from "@/server/queries/exams";
import { ExamRunnerLoader } from "@/components/exams/exam-runner-loader";

export const metadata: Metadata = { title: "Probeklausur" };

export default async function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const exam = await getExam(user.id, (await params).id);
  if (!exam) notFound();
  return (
    <ExamRunnerLoader
      exam={{ id: exam.id, title: exam.title, timeLimit: exam.timeLimit, moduleId: exam.module.id, moduleName: exam.module.name, questions: exam.questions }}
    />
  );
}
