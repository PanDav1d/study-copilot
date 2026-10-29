import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { structureTree } from "@/server/queries/structure";
import { examPromptContext } from "@/server/queries/exams";
import type { ExamPromptContext } from "@/lib/exam";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { ExamImport } from "@/components/exams/exam-import";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = { title: "Neue Probeklausur" };

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const user = await requireUser();
  const { module: requested } = await searchParams;
  const modules = (await structureTree(user.id)).flatMap((s) => s.modules);
  if (modules.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Lege zuerst ein Modul an"
        description="Eine Probeklausur gehört immer zu einem Modul."
        action={<Link href="/semesters" className={buttonClass()}>Zu den Modulen</Link>}
      />
    );
  }
  const contexts: Record<string, ExamPromptContext> = {};
  for (const m of modules) {
    const ctx = await examPromptContext(user.id, m.id);
    if (ctx) contexts[m.id] = ctx;
  }
  const moduleId = modules.some((m) => m.id === requested) ? requested! : modules[0]!.id;

  return (
    <>
      <PageHeader
        breadcrumbs={<Link href="/exams" className="hover:text-foreground">Probeklausuren</Link>}
        title="Neue Probeklausur"
        description="Prompt kopieren → in eine KI deiner Wahl einfügen → Antwort hier einfügen."
      />
      <ExamImport moduleId={moduleId} contexts={contexts} />
    </>
  );
}
