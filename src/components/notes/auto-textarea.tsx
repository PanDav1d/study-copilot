"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { dropImages, pasteImages } from "@/components/media/upload-image";

/** Textarea that grows with its content, indents with Tab and takes pasted/dropped images. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(
  function AutoTextarea({ className, minRows = 3, onKeyDown, onPaste, onDrop, value, ...props }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!);

    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);

    return (
      <textarea
        ref={inner}
        rows={minRows}
        value={value}
        className={cn("w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60", className)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const el = e.currentTarget;
            e.preventDefault();
            // execCommand keeps the native undo stack intact.
            if (!document.execCommand("insertText", false, "  ")) {
              el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          onKeyDown?.(e);
        }}
        onPaste={(e) => {
          pasteImages(e);
          onPaste?.(e);
        }}
        onDrop={(e) => {
          dropImages(e);
          onDrop?.(e);
        }}
        {...props}
      />
    );
  },
);

/** Insert text at the cursor of a textarea and notify React. */
export function insertAtCursor(el: HTMLTextAreaElement | null, text: string) {
  if (!el) return;
  el.focus();
  if (!document.execCommand("insertText", false, text)) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
