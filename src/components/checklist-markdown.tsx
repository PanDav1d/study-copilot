"use client";

import { createContext, useContext } from "react";
import { Check } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

/** Source line of the list item a checkbox belongs to. */
const LineCtx = createContext<number | null>(null);

/**
 * Markdown whose task list items ("- [ ] …") can be ticked off in place.
 * `onToggle` gets the 1-based source line (see lib/checklist.ts).
 */
export function ChecklistMarkdown({ children, onToggle, className }: { children: string; onToggle: (line: number) => void; className?: string }) {
  return (
    <Markdown
      className={cn("checklist", className)}
      components={{
        li({ node, children: content, ...props }) {
          return (
            <li {...props}>
              <LineCtx.Provider value={node?.position?.start.line ?? null}>{content}</LineCtx.Provider>
            </li>
          );
        },
        input({ node: _node, ...props }) {
          if (props.type !== "checkbox") return <input {...props} />;
          return <TaskBox checked={!!props.checked} onToggle={onToggle} />;
        },
      }}
    >
      {children}
    </Markdown>
  );
}

function TaskBox({ checked, onToggle }: { checked: boolean; onToggle: (line: number) => void }) {
  const line = useContext(LineCtx);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Als offen markieren" : "Abhaken"}
      disabled={line === null}
      onClick={() => line !== null && onToggle(line)}
      className={cn(
        "mr-2 inline-flex size-4 translate-y-[3px] items-center justify-center rounded-[5px] border align-baseline transition-colors",
        checked ? "border-success bg-success text-white" : "border-input bg-background hover:border-foreground/50",
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
