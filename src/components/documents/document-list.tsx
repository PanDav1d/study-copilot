import Link from "next/link";
import { FileText } from "lucide-react";
import { fmtDate } from "@/lib/dates";
import { formatBytes } from "@/lib/utils";
import { ModuleTag } from "@/components/ui/misc";
import { DocumentMenu } from "./document-menu";

export interface DocumentRow {
  id: string;
  title: string;
  description: string;
  size: number;
  createdAt: Date;
  semesterId: string | null;
  moduleId: string | null;
  module?: { id: string; name: string; color: string } | null;
  semester?: { id: string; name: string } | null;
  _count?: { notes: number; flashcards: number };
}

export function DocumentList({ documents, showContext = false, empty = "Noch keine Unterlagen." }: { documents: DocumentRow[]; showContext?: boolean; empty?: string }) {
  if (documents.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-xl border">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <FileText className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/documents/${d.id}`} className="block truncate text-sm font-medium hover:underline">{d.title}</Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatBytes(d.size)}</span>
              <span>·</span>
              <span>{fmtDate(d.createdAt)}</span>
              {showContext && d.module && <ModuleTag name={d.module.name} color={d.module.color} />}
              {showContext && !d.module && d.semester && <span>{d.semester.name}</span>}
              {d._count && d._count.notes + d._count.flashcards > 0 && (
                <span>· {d._count.notes} Sitzung{d._count.notes === 1 ? "" : "en"}, {d._count.flashcards} Karte{d._count.flashcards === 1 ? "" : "n"}</span>
              )}
            </div>
          </div>
          <DocumentMenu doc={d} />
        </li>
      ))}
    </ul>
  );
}
