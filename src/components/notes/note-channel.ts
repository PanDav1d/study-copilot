"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Same-origin channel between the panes (main window and split iframe): open
 * session editors announce themselves, the PDF viewer sends snippets to the
 * one used last. BroadcastChannel reaches every pane and window of the app.
 */
type Msg =
  | { type: "ping" }
  | { type: "here"; noteId: string; title: string; at: number }
  | { type: "bye"; noteId: string }
  | { type: "insert"; noteId: string; markdown: string };

const NAME = "study.notes";
const open = () => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME));

/** In the session editor: be a target for inserts. `insert` receives the Markdown. */
export function useNoteTarget(noteId: string, title: string, insert: (markdown: string) => void) {
  const insertRef = useRef(insert);
  useEffect(() => {
    insertRef.current = insert;
  });
  useEffect(() => {
    const ch = open();
    if (!ch) return;
    let at = Date.now();
    const announce = () => ch.postMessage({ type: "here", noteId, title, at } satisfies Msg);
    const onFocus = () => {
      at = Date.now();
      announce();
    };
    ch.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data?.type === "ping") announce();
      else if (e.data?.type === "insert" && e.data.noteId === noteId && typeof e.data.markdown === "string") insertRef.current(e.data.markdown);
    };
    announce();
    window.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("focusin", onFocus);
      ch.postMessage({ type: "bye", noteId } satisfies Msg);
      ch.close();
    };
  }, [noteId, title]);
}

/** In the PDF viewer: the open session that was used last (or null) and a way to send to it. */
export function useNoteTargets() {
  const [targets, setTargets] = useState<Map<string, { title: string; at: number }>>(new Map());
  const chRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const ch = open();
    if (!ch) return;
    chRef.current = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m?.type === "here") setTargets((t) => new Map(t).set(m.noteId, { title: m.title, at: m.at }));
      else if (m?.type === "bye")
        setTargets((t) => {
          const next = new Map(t);
          next.delete(m.noteId);
          return next;
        });
    };
    ch.postMessage({ type: "ping" } satisfies Msg);
    return () => {
      ch.close();
      chRef.current = null;
    };
  }, []);
  const latest = [...targets.entries()].sort((a, b) => b[1].at - a[1].at)[0];
  return {
    target: latest ? { noteId: latest[0], title: latest[1].title } : null,
    send: (noteId: string, markdown: string) => chRef.current?.postMessage({ type: "insert", noteId, markdown } satisfies Msg),
  };
}
