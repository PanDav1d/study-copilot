"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** Image inside rendered Markdown: lazy, framed, click to view full size. */
export function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated attachment, no optimisation pipeline */}
        <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" className="md-image" title="Klicken zum Vergrößern" />
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <RadixDialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-10" aria-describedby={undefined}>
          <RadixDialog.Title className="sr-only">{alt || "Bild"}</RadixDialog.Title>
          <RadixDialog.Close asChild>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt ?? ""} className="max-h-full max-w-full cursor-zoom-out rounded-lg bg-white object-contain shadow-2xl" />
          </RadixDialog.Close>
          <RadixDialog.Close className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" aria-label="Schließen">
            <X className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
