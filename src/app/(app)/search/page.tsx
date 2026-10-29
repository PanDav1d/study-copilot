import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, FileText, GraduationCap, Layers, NotebookPen, Search } from "lucide-react";
import { requireUser } from "@/server/auth";
import { searchAll, snippet } from "@/server/queries/search";
import { fmtDate } from "@/lib/dates";
import { parseRows, rowsText } from "@/lib/cornell";
import { EmptyState, ModuleTag, PageHeader } from "@/components/ui/misc";
import { sessionTitle } from "@/lib/labels";

export const metadata: Metadata = { title: "Suche" };

function Group({ title, icon: Icon, count, children }: { title: string; icon: typeof Search; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-muted-foreground" />{title} <span className="text-muted-foreground">({count})</span></h2>
      <ul className="divide-y rounded-xl border bg-card">{children}</ul>
    </section>
  );
}

function Row({ href, title, meta, text }: { href: string; title: string; meta?: ReactNode; text?: string }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2.5 hover:bg-muted/50">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{title}</span>{meta}</div>
        {text && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{text}</p>}
      </Link>
    </li>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const r = await searchAll(user.id, q);
  const total = r ? Object.values(r).reduce((s, l) => s + l.length, 0) : 0;

  return (
    <>
      <PageHeader title={q ? `Suche: „${q}“` : "Suche"} description={r ? `${total} Treffer` : "Mindestens 2 Zeichen eingeben."} />
      {r && total === 0 && <EmptyState icon={Search} title="Keine Treffer" description="Versuche einen anderen Begriff." />}
      {r && (
        <div className="space-y-6">
          <Group title="Module" icon={GraduationCap} count={r.modules.length}>
            {r.modules.map((m) => <Row key={m.id} href={`/modules/${m.id}`} title={m.name} meta={<span className="text-xs text-muted-foreground">{m.semester.name}</span>} />)}
          </Group>
          <Group title="Sitzungen" icon={NotebookPen} count={r.notes.length}>
            {r.notes.map((n) => <Row key={n.id} href={`/notes/${n.id}`} title={sessionTitle(n)} meta={<><ModuleTag name={n.module.name} color={n.module.color} /><span className="text-xs text-muted-foreground">{fmtDate(n.date)}</span></>} text={snippet(`${rowsText(parseRows(n.sections))}\n${n.summary}`, q)} />)}
          </Group>
          <Group title="Karteikarten" icon={Layers} count={r.flashcards.length}>
            {r.flashcards.map((c) => <Row key={c.id} href={`/flashcards/${c.id}`} title={c.front.slice(0, 160)} meta={<ModuleTag name={c.module.name} color={c.module.color} />} text={snippet(c.back, q)} />)}
          </Group>
          <Group title="Unterlagen" icon={FileText} count={r.documents.length}>
            {r.documents.map((d) => <Row key={d.id} href={`/documents/${d.id}`} title={d.title} meta={d.module && <ModuleTag name={d.module.name} color={d.module.color} />} text={d.originalName} />)}
          </Group>
          <Group title="Termine" icon={CalendarDays} count={r.events.length}>
            {r.events.map((e) => <Row key={e.id} href={`/calendar?date=${fmtDate(e.start, "yyyy-MM-dd")}`} title={e.title} meta={<span className="text-xs text-muted-foreground">{fmtDate(e.start, "dd.MM.yyyy HH:mm")}</span>} />)}
          </Group>
        </div>
      )}
    </>
  );
}
