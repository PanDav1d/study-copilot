"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] w-full flex-col border bg-background shadow-lg focus:outline-none",
            "inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg leading-none font-semibold tracking-tight">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="-mt-1 -mr-2 rounded-md p-1 text-muted-foreground opacity-70 transition hover:opacity-100" aria-label="Schließen">
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pt-2 pb-6">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-6">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
