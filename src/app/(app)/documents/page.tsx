import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listDocuments } from "@/server/queries/documents";
import { formatBytes } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListFilters } from "@/components/list-filters";
import { DocumentList } from "@/components/documents/document-list";
import { UploadButton } from "@/components/documents/upload-button";
import { Dropzone } from "@/components/forms/upload";

export const metadata: Metadata = { title: "Unterlagen" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ module?: string; q?: string }> }) {
  const user = await requireUser();
  const { module, q } = await searchParams;
  const docs = await listDocuments(user.id, { moduleId: module, q });
  const size = docs.reduce((s, d) => s + d.size, 0);

  return (
    <>
      <PageHeader
        title="Unterlagen"
        description={`${docs.length} PDF${docs.length === 1 ? "" : "s"} · ${formatBytes(size)}`}
        actions={<UploadButton moduleId={module} />}
      />
      <ListFilters fields={["q", "module"]} />
      <div className="space-y-4">
        <Dropzone target={{ moduleId: module }} compact />
        {docs.length === 0 ? (
          <EmptyState icon={FolderOpen} title={q || module ? "Keine passenden Unterlagen" : "Noch keine Unterlagen"} description="Ziehe Vorlesungsfolien, Skripte und Übungsblätter hierher und ordne sie Modulen und Sitzungen zu." />
        ) : (
          <DocumentList documents={docs} showContext />
        )}
      </div>
    </>
  );
}
