"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { toDateInput } from "@/lib/dates";
import { createNote } from "@/server/actions/notes";

/** One click: create the session (Cornell sheet) for a lecture from the calendar and open it. */
export function CreateSessionForEvent({ event, moduleId }: { event: { id: string; start: Date }; moduleId: string }) {
  const router = useRouter();
  const create = useAction(createNote, { refresh: false });
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={create.pending}
      onClick={async () => {
        const res = await create.run({ moduleId, date: toDateInput(event.start), eventId: event.id });
        if (res) router.push(`/notes/${res.id}`);
      }}
    >
      <Plus className="size-3.5" /> Mitschrift
    </Button>
  );
}
