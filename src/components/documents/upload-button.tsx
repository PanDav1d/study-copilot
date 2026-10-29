"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/forms/upload";

export function UploadButton({ moduleId }: { moduleId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Upload className="size-4" /> Hochladen</Button>
      {open && <UploadDialog open onOpenChange={setOpen} initial={{ moduleId }} />}
    </>
  );
}
