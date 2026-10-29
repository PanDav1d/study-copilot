"use client";

import { Check } from "lucide-react";
import { useOptimistic, startTransition } from "react";
import { useAction } from "@/hooks/use-action";
import { setEventCompleted } from "@/server/actions/events";
import { cn } from "@/lib/utils";

export function StudyTaskToggle({ id, completed }: { id: string; completed: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(completed);
  const { run } = useAction(setEventCompleted);
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? "Als offen markieren" : "Als erledigt markieren"}
      title={optimistic ? "Erledigt" : "Als erledigt markieren"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await run({ id, completed: !optimistic });
        })
      }
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition",
        optimistic ? "border-success bg-success text-white" : "border-input hover:border-success",
      )}
    >
      {optimistic && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
