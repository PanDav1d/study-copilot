"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { COMMANDS, commandById, isCommandId, matchesShortcut, type Command, type CommandId, type KeyInit } from "@/lib/commands";
import { formatEdit, type FormatKind } from "@/lib/format";

/**
 * Command runtime of one window (the app, or the split pane's iframe).
 *
 * Handlers live in layers: "pane" = the page (a session, a PDF …), "base" =
 * generic per-window behaviour (text formatting, history), "shell" = the app
 * around it (tabs, dialogs, navigation; only in the main window). A pane
 * command goes to the page in the focused pane – in split view that may be the
 * iframe – and falls back to the shell when the page does not know it.
 *
 * Sources: keyboard shortcuts, the native menu bar of the desktop app (it
 * dispatches `study:command` on the window), the command palette.
 */

type Layer = "pane" | "base" | "shell";
export type Pane = "left" | "right";

interface Entry {
  run: () => void;
  enabled: boolean;
  checked: boolean;
  layer: Layer;
  seq: number;
}

/** What a window's page offers – the split pane reports it to the main window. */
export interface PaneCommandState {
  known: string[];
  available: string[];
  checked: string[];
}

const registry = new Map<string, Entry[]>();
const listeners = new Set<() => void>();
let seq = 0;
let version = 0;

function changed() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeCommands(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-renders when handlers, the focused pane or the split pane's commands change. */
export function useCommandsVersion() {
  return useSyncExternalStore(subscribeCommands, () => version, () => 0);
}

/**
 * Registers a handler while the component is mounted. `enabled: false` keeps
 * the command visible but greyed out (menu bar, palette); `checked` shows a tick.
 */
export function useCommand(id: CommandId, run: () => void, opts: { enabled?: boolean; checked?: boolean; layer?: Layer } = {}) {
  const ref = useRef(run);
  useEffect(() => {
    ref.current = run;
  });
  const { enabled = true, checked = false, layer = "pane" } = opts;
  useEffect(() => {
    const entry: Entry = { run: () => ref.current(), enabled, checked, layer, seq: ++seq };
    registry.set(id, [...(registry.get(id) ?? []), entry]);
    changed();
    return () => {
      registry.set(id, (registry.get(id) ?? []).filter((e) => e !== entry));
      changed();
    };
  }, [id, enabled, checked, layer]);
}

/** The newest entry of the first layer that has one – a disabled page handler does not fall through. */
function entryOf(id: string, layers: Layer[]): Entry | undefined {
  const list = registry.get(id) ?? [];
  for (const layer of layers) {
    const inLayer = list.filter((e) => e.layer === layer);
    if (inLayer.length) return inLayer.reduce((a, b) => (b.seq > a.seq ? b : a));
  }
  return undefined;
}

export function localPaneState(): PaneCommandState {
  const state: PaneCommandState = { known: [], available: [], checked: [] };
  for (const c of COMMANDS) {
    if (c.scope !== "pane") continue;
    const e = entryOf(c.id, ["pane", "base"]);
    if (!e) continue;
    state.known.push(c.id);
    if (e.enabled) state.available.push(c.id);
    if (e.checked) state.checked.push(c.id);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Routing (main window): which pane is focused, how to reach the split pane.
// ---------------------------------------------------------------------------

interface Router {
  focus: () => Pane;
  forward: (id: CommandId) => void;
}

let router: Router | null = null;
let frameState: PaneCommandState | null = null;

/** Set by the workspace. Call `notifyCommands` when the focused pane changes. */
export function setCommandRouter(r: Router | null) {
  router = r;
  changed();
}

export function setFrameCommandState(s: PaneCommandState | null) {
  frameState = s;
  changed();
}

export const notifyCommands = changed;

type Resolved = { target: "frame" | "local" | "shell" | "none"; entry?: Entry; available: boolean; checked: boolean };

function resolve(cmd: Command, pane: Pane, fallbackOnly = false): Resolved {
  if (cmd.scope === "pane" && !fallbackOnly) {
    if (pane === "right" && frameState) {
      if (frameState.known.includes(cmd.id)) return { target: "frame", available: frameState.available.includes(cmd.id), checked: frameState.checked.includes(cmd.id) };
    } else if (pane === "left") {
      const e = entryOf(cmd.id, ["pane", "base"]);
      if (e) return { target: "local", entry: e, available: e.enabled, checked: e.checked };
    }
  }
  const s = entryOf(cmd.id, ["shell"]);
  return s ? { target: "shell", entry: s, available: s.enabled, checked: s.checked } : { target: "none", available: false, checked: false };
}

function focusedPane(): Pane {
  return router?.focus() ?? "left";
}

export function commandState(id: string) {
  const r = resolve(commandById(id)!, focusedPane());
  return { available: r.available, checked: r.checked };
}

function unavailable(cmd: Command) {
  toast(cmd.where ? `„${cmd.label}“ gibt es nur ${cmd.where}.` : `„${cmd.label}“ ist hier gerade nicht verfügbar.`);
}

/**
 * Runs a command in the main window. `pane` = where it came from (a key in the
 * main document is the left pane); without it the focused pane counts.
 */
export function runCommand(id: CommandId, opts: { pane?: Pane; fallbackOnly?: boolean } = {}) {
  const cmd = commandById(id)!;
  const r = resolve(cmd, opts.pane ?? focusedPane(), opts.fallbackOnly);
  if (!r.available) return unavailable(cmd);
  if (r.target === "frame") router?.forward(id);
  else r.entry?.run();
}

/** Inside the split pane: run here if the page knows the command, otherwise ask the main window. */
function runInFrame(id: CommandId, post: (msg: FrameCommandMessage) => void) {
  const cmd = commandById(id)!;
  if (cmd.scope === "pane") {
    const e = entryOf(id, ["pane", "base"]);
    if (e) {
      if (e.enabled) e.run();
      else unavailable(cmd);
      return;
    }
  }
  post({ type: "study:command", id, fallbackOnly: cmd.scope === "pane" });
}

export type FrameCommandMessage = { type: "study:command"; id: string; fallbackOnly?: boolean } | { type: "study:commands"; state: PaneCommandState };

/** Menu bar snapshot for the desktop shell: enabled and ticked items. */
export function menuSnapshot() {
  const pane = focusedPane();
  const e: string[] = [];
  const c: string[] = [];
  for (const cmd of COMMANDS) {
    const r = resolve(cmd, pane);
    if (r.available) e.push(cmd.id);
    if (r.checked) c.push(cmd.id);
  }
  return { e, c };
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

const DIALOG_OK = new Set<string>(["format.bold", "format.italic", "format.code", "format.task", "palette.open", "help.shortcuts"]);

function shortcutFor(e: KeyboardEvent): Command | undefined {
  if (e.defaultPrevented || e.isComposing || e.repeat) return undefined;
  return COMMANDS.find((c) => "shortcut" in c && c.shortcut && !("keysElsewhere" in c && c.keysElsewhere) && matchesShortcut(e as KeyInit, c.shortcut));
}

function dialogOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * The last key that matched a command – the menu bar must not run it a second
 * time if the page already handled it (WebKit only passes unhandled keys on).
 */
let lastKey: { id: string; at: number; event: KeyboardEvent | null } = { id: "", at: 0, event: null };

function rememberKey(e: KeyboardEvent) {
  const cmd = COMMANDS.find((c) => "shortcut" in c && c.shortcut && matchesShortcut(e as KeyInit, c.shortcut));
  if (cmd) lastKey = { id: cmd.id, at: Date.now(), event: e };
}

function useCommandKeys(onCommand: (cmd: Command, e: KeyboardEvent) => void, skip?: (e: KeyboardEvent) => boolean) {
  const ref = useRef(onCommand);
  useEffect(() => {
    ref.current = onCommand;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skip?.(e)) return;
      const cmd = shortcutFor(e);
      if (!cmd) {
        // "?" outside of text fields opens the shortcut overview, like in many web apps.
        if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(document.activeElement) && !dialogOpen()) {
          e.preventDefault();
          ref.current(commandById("help.shortcuts")!, e);
        }
        return;
      }
      e.preventDefault();
      if (dialogOpen() && !DIALOG_OK.has(cmd.id)) return;
      ref.current(cmd, e);
    };
    window.addEventListener("keydown", rememberKey, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", rememberKey, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [skip]);
}

// ---------------------------------------------------------------------------
// Generic per-window commands: Markdown formatting in text areas, history.
// ---------------------------------------------------------------------------

export function isTyping(el: Element | null): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled;
}

/** Any field that takes text – single keys like "?" belong to it. */
function isEditable(el: Element | null) {
  return !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(el.type)) || (el as HTMLElement).isContentEditable);
}

/** Applies Markdown formatting to the focused text area – keeps the native undo stack. */
export function applyFormat(kind: FormatKind) {
  const el = document.activeElement;
  if (!isTyping(el)) return;
  const edit = formatEdit(el.value, el.selectionStart, el.selectionEnd, kind);
  el.setSelectionRange(edit.from, edit.to);
  if (!document.execCommand("insertText", false, edit.insert)) {
    el.setRangeText(edit.insert, edit.from, edit.to, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(edit.selStart, edit.selEnd);
}

function useTypingFocus() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const update = () => setTyping(isTyping(document.activeElement));
    // During focusout the next element is not focused yet.
    const later = () => setTimeout(update);
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return typing;
}

function BaseCommands() {
  const typing = useTypingFocus();
  useCommand("format.bold", () => applyFormat("bold"), { layer: "base", enabled: typing });
  useCommand("format.italic", () => applyFormat("italic"), { layer: "base", enabled: typing });
  useCommand("format.code", () => applyFormat("code"), { layer: "base", enabled: typing });
  useCommand("format.task", () => applyFormat("task"), { layer: "base", enabled: typing });
  useCommand("nav.back", () => window.history.back(), { layer: "base" });
  useCommand("nav.forward", () => window.history.forward(), { layer: "base" });
  return null;
}

// ---------------------------------------------------------------------------
// Runtimes
// ---------------------------------------------------------------------------

/** Main window: keys, native menu bar (desktop), menu state for the desktop shell. */
export function CommandRuntime({ desktop }: { desktop: boolean }) {
  useCommandKeys((cmd) => runCommand(cmd.id as CommandId, { pane: "left" }));

  // Native menu bar ⇄ web. The shell evaluates `dispatchEvent(new CustomEvent("study:command", …))`
  // for a click; the page tells it which items are enabled and ticked (only when that changed).
  useEffect(() => {
    let last = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (!desktop) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const json = JSON.stringify(menuSnapshot());
        if (json === last) return;
        last = json;
        void fetch(`studycopilot://localhost/menu?s=${encodeURIComponent(json)}`).catch(() => {});
      }, 60);
    };
    const onMenu = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (!isCommandId(id)) return;
      // Only a key the page did not handle reaches the menu – just in case WebKit ever sends both.
      if (!(lastKey.id === id && Date.now() - lastKey.at < 300 && lastKey.event?.defaultPrevented)) runCommand(id);
      // A click toggles a tick in the menu right away – send the real state even if nothing changed.
      last = "";
      send();
    };
    window.addEventListener("study:command", onMenu);
    send();
    const unsubscribe = subscribeCommands(send);
    return () => {
      window.removeEventListener("study:command", onMenu);
      unsubscribe();
      clearTimeout(timer);
    };
  }, [desktop]);

  return <BaseCommands />;
}

/** Split pane (iframe): its own keys and page commands, reported to the main window. */
export function EmbeddedCommandRuntime({ skipKey }: { skipKey: (e: KeyboardEvent) => boolean }) {
  const post = (msg: FrameCommandMessage) => window.parent.postMessage(msg, window.location.origin);
  useCommandKeys((cmd) => runInFrame(cmd.id as CommandId, post), skipKey);

  useEffect(() => {
    const send = () => window.parent.postMessage({ type: "study:commands", state: localPaneState() } satisfies FrameCommandMessage, window.location.origin);
    let queued = false;
    const queue = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        send();
      });
    };
    send();
    const unsubscribe = subscribeCommands(queue);
    const onMessage = (e: MessageEvent<FrameCommandMessage>) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === "study:command" && isCommandId(e.data.id)) runInFrame(e.data.id, () => {});
    };
    window.addEventListener("message", onMessage);
    return () => {
      unsubscribe();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return <BaseCommands />;
}
