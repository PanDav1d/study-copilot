import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getSemester } from "@/server/queries/structure";
import { fmtDate } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ModuleCard } from "@/components/structure/module-card";
import { NewModuleButton, SemesterMenu } from "@/components/structure/actions";
import { Dropzone } from "@/components/forms/upload";
import { DocumentList } from "@/components/documents/document-list";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const s = await getSemester(user.id, (await params).id);
  return { title: s?.name ?? "Semester" };
}

export default async function SemesterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const semester = await getSemester(user.id, (await params).id);
  if (!semester) notFound();
  const ects = semester.modules.reduce((sum, m) => sum + (m.ects ?? 0), 0);

  return (
    <>
      <PageHeader
        breadcrumbs={<Link href="/semesters" className="hover:text-foreground">Semester & Module</Link>}
        title={semester.name}
        description={[
          semester.startDate || semester.endDate ? `${fmtDate(semester.startDate)} – ${fmtDate(semester.endDate)}` : null,
          `${semester.modules.length} Module`,
          ects ? `${ects} ECTS` : null,
        ].filter(Boolean).join(" · ")}
        actions={<><NewModuleButton semesterId={semester.id} /><SemesterMenu semester={semester} /></>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {semester.modules.map((m) => <ModuleCard key={m.id} module={m} />)}
      </div>
      <Card className="mt-8">
        <CardHeader title="Allgemeine Unterlagen" description="PDFs dieses Semesters ohne Modulbezug, z. B. Studien- und Prüfungsordnung, Stundenplan." />
        <CardBody className="space-y-3">
          <DocumentList documents={semester.documents} />
          <Dropzone target={{ semesterId: semester.id }} compact />
        </CardBody>
      </Card>
    </>
  );
}
