import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listSemesters } from "@/server/queries/structure";
import { fmtDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ModuleCard } from "@/components/structure/module-card";
import { NewModuleButton, NewSemesterButton, SemesterMenu } from "@/components/structure/actions";

export const metadata: Metadata = { title: "Semester & Module" };

export default async function SemestersPage() {
  const user = await requireUser();
  const semesters = await listSemesters(user.id);

  return (
    <>
      <PageHeader title="Module" description="Die Struktur deines Studiums – jedes Modul bündelt Sitzungen, Karteikarten, Termine und Unterlagen." actions={<NewSemesterButton />} />
      {semesters.length === 0 && (
        <EmptyState icon={GraduationCap} title="Noch keine Semester" description="Lege dein aktuelles Semester an und füge anschließend deine Module hinzu." action={<NewSemesterButton />} />
      )}
      <div className="space-y-8">
        {semesters.map((s) => (
          <section key={s.id} aria-labelledby={`sem-${s.id}`}>
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 id={`sem-${s.id}`} className="text-lg font-semibold tracking-tight">
                  <Link href={`/semesters/${s.id}`} className="hover:underline">{s.name}</Link>
                </h2>
                {(s.startDate || s.endDate) && (
                  <p className="text-sm text-muted-foreground">{fmtDate(s.startDate)} – {fmtDate(s.endDate)}</p>
                )}
              </div>
              <NewModuleButton semesterId={s.id} variant="secondary" size="sm" />
              <SemesterMenu semester={s} />
            </div>
            {s.modules.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Noch keine Module in diesem Semester.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {s.modules.map((m) => <ModuleCard key={m.id} module={m} />)}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
