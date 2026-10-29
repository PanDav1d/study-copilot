"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Download, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { DocumentDialog, type DocumentValues } from "@/components/forms/document-dialog";
import { useAction } from "@/hooks/use-action";
import { deleteDocument } from "@/server/actions/documents";

function downloadFile(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  a.click();
}

export function DocumentMenu({ doc, redirectTo, trigger }: { doc: DocumentValues; redirectTo?: string; trigger?: ReactNode }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const del = useAction(deleteDocument, { success: "Unterlage gelöscht" });
  return (
    <>
      <Dropdown trigger={trigger ?? <Button variant="ghost" size="icon-sm" aria-label="Aktionen"><MoreHorizontal className="size-4" /></Button>}>
        <DropdownItem icon={<ExternalLink className="size-4" />} onSelect={() => window.open(`/api/documents/${doc.id}/file`, "_blank", "noopener")}>In neuem Tab öffnen</DropdownItem>
        <DropdownItem icon={<Download className="size-4" />} onSelect={() => downloadFile(`/api/documents/${doc.id}/file?download=1`)}>Herunterladen</DropdownItem>
        <DropdownItem icon={<Pencil className="size-4" />} onSelect={() => setDialog("edit")}>Bearbeiten / zuordnen</DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Löschen</DropdownItem>
      </Dropdown>
      {dialog === "edit" && <DocumentDialog open onOpenChange={() => setDialog(null)} initial={doc} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title="Unterlage löschen?"
        description={<>„{doc.title}“ wird endgültig gelöscht. Verknüpfungen zu Sitzungen und Karteikarten werden entfernt.</>}
        onConfirm={async () => {
          if ((await del.run({ id: doc.id })) !== undefined && redirectTo) router.push(redirectTo);
        }}
      />
    </>
  );
}
