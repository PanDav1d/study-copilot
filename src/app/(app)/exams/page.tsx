import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listExams } from "@/server/queries/exams";
import { buttonClass } from "@/components/ui/button";
import { LearnTabs } from "@/components/study/learn-tabs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ExamList } from "@/components/exams/exam-list";

export const metadata: Metadata = { title: "Probeklausuren" };

export default async function ExamsPage() {
  const user = await requireUser();
  const exams = await listExams(user.id);
  const newButton = <Link href="/exams/new" className={buttonClass()}><Plus className="size-4" /> Probeklausur</Link>;

  return (
    <>
      <LearnTabs active="exams" />
      <PageHeader
        title="Probeklausuren"
        description="Prüfung unter echten Bedingungen proben – die wirksamste Vorbereitung. Erzeugen lässt sich eine Klausur mit jeder KI aus deinen eigenen Notizen."
        actions={exams.length > 0 && newButton}
      />
      {exams.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Noch keine Probeklausur"
          description="Kopiere einen fertigen Prompt mit deinen Mitschriften in ChatGPT, Claude & Co. und füge die Antwort ein – fertig ist die Klausur."
          action={newButton}
        />
      ) : (
        <ExamList exams={exams} />
      )}
    </>
  );
}
