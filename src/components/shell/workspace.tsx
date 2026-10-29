"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Brain,
  CalendarDays,
  Columns2,
  FileQuestion,
  FileText,
  FolderOpen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Maximize2,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Kbd, ModuleDot } from "@/components/ui/misc";
import { sessionLabel } from "@/lib/labels";
import {
  EMPTY_WORKSPACE,
  MAX_TABS,
  cleanHref,
  closeOthers,
  closeSplit,
  closeTab,
  closeToRight,
  cycleTab,
  idOf,
  kindOf,
  moveTab,
  navigate,
  parseWorkspace,
  placeTab,
  recentPartner,
  retargetSplit,
  setRatio,
  snapRatio,
  swapPanes,
  tabKey,
  withEmbed,
  type Tab,
  type Workspace,
} from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { StudyPlanDialog } from "@/components/calendar/study-plan-dialog";
import { useStudyData } from "./study-data";
import { isCommandId } from "@/lib/commands";
import { notifyCommands, runCommand, setCommandRouter, setFrameCommandState, useCommand, type FrameCommandMessage } from "./commands";

// ---------------------------------------------------------------------------
// Store: module-level, persisted to localStorage only when it changes.
// ---------------------------------------------------------------------------

const KEY = "study.workspace.v1";
let state: Workspace | null = null;
const listeners = new Set<() => void>();

function current(): Workspace {
  if (state === null) {
    try {
      state = parseWorkspace(localStorage.getItem(KEY));
      localStorage.removeItem("study.tabs.v1"); // tabs of the previous version
    } catch {
      state = EMPTY_WORKSPACE;
    }
  }
  return state;
}

function update(fn: (ws: Workspace) => Workspace) {
  const next = fn(current());
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const useWorkspaceState = () => useSyncExternalStore(subscribe, current, () => EMPTY_WORKSPACE);

/** Set right before a navigation that has to open a new tab (picker). */
let pendingNewTab = false;

/** Recently closed tabs, newest last – ⇧⌘T brings them back. */
const closedTabs: string[] = [];
function rememberClosed(ws: Workspace, keys: string[]) {
  for (const k of keys) {
    const tab = ws.tabs.find((t) => t.key === k);
    if (tab) closedTabs.push(tab.href);
  }
  closedTabs.splice(0, Math.max(0, closedTabs.length - 20));
  notifyCommands();
}

/** Module of the page in the focused pane – pre-fills "new …" dialogs. */
let focusedModule: string | undefined;
export function focusedModuleId() {
  return focusedModule;
}

/** Below this width there is no room for two panes: "beside" opens a tab instead. */
const SPLIT_MIN_WIDTH = 768;
/** Each pane keeps at least this width while the divider is dragged. */
const PANE_MIN_PX = 300;

// ---------------------------------------------------------------------------
// Public API for pages: open as tab, open beside, open the picker.
// ---------------------------------------------------------------------------

interface WorkspaceApi {
  openTab: (href: string) => void;
  /** Opens next to the current page – from the split pane that is the main pane. */
  openBeside: (href: string) => void;
  openPicker: (opts?: { beside?: boolean; moduleId?: string }) => void;
}

const fallbackApi: WorkspaceApi = {
  openTab: (href) => window.location.assign(href),
  openBeside: (href) => window.location.assign(href),
  openPicker: () => {},
};

const ApiCtx = createContext<WorkspaceApi>(fallbackApi);

export function useWorkspace() {
  return useContext(ApiCtx);
}

type KeyInit = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

type FrameMessage =
  | { type: "study:nav"; href: string; title: string }
  | { type: "study:open"; href: string; beside: boolean }
  | { type: "study:picker"; beside: boolean; moduleId?: string }
  | { type: "study:focus" }
  | { type: "study:key"; init: KeyInit }
  | FrameCommandMessage;

type ParentMessage = { type: "study:goto"; href: string };

/**
 * Shortcuts of the shell (tabs, panes, search, sidebar). Inside the split pane
 * they are forwarded to the main window, so they work no matter which pane has focus.
 */
export function isShellShortcut(e: KeyInit) {
  if (e.ctrlKey && e.key === "Tab") return true;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return false;
  const k = e.key.toLowerCase();
  if (!e.shiftKey && !e.altKey && (k === "k" || k === "o" || e.code === "Backslash")) return true;
  if (e.shiftKey && !e.altKey && e.code === "Backslash") return true;
  if (e.metaKey && e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) return true;
  if (e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return true;
  return false;
}

/**
 * Inside the split pane (an iframe of the app without shell): reports its
 * location and focus to the main window, forwards "open …" requests and shell
 * shortcuts to it, so the tabs and keys stay in one place.
 */
export function EmbeddedWorkspace({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const post = useCallback((msg: FrameMessage) => window.parent.postMessage(msg, window.location.origin), []);
  useEffect(() => {
    // The title is set after the page rendered.
    const t = setTimeout(() => post({ type: "study:nav", href: cleanHref(`${pathname}${search ? `?${search}` : ""}`), title: plainTitle() }), 250);
    return () => clearTimeout(t);
  }, [pathname, search, post]);
  useEffect(() => {
    const onFocus = () => post({ type: "study:focus" });
    const onKey = (e: KeyboardEvent) => {
      if (!isShellShortcut(e)) return;
      e.preventDefault();
      const { key, code, metaKey, ctrlKey, shiftKey, altKey } = e;
      post({ type: "study:key", init: { key, code, metaKey, ctrlKey, shiftKey, altKey } });
    };
    const onMessage = (e: MessageEvent<ParentMessage>) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === "study:goto" && typeof e.data.href === "string" && e.data.href.startsWith("/")) router.push(e.data.href, { scroll: false });
    };
    window.addEventListener("pointerdown", onFocus, true);
    window.addEventListener("focusin", onFocus, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("pointerdown", onFocus, true);
      window.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [post, router]);
  const api = useMemo<WorkspaceApi>(
    () => ({
      openTab: (href) => post({ type: "study:open", href, beside: false }),
      openBeside: (href) => post({ type: "study:open", href, beside: true }),
      openPicker: (opts) => post({ type: "study:picker", beside: !!opts?.beside, moduleId: opts?.moduleId }),
    }),
    [post],
  );
  return <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>;
}

function plainTitle() {
  return document.title.replace(/ · Study Copilot$/, "");
}

// ---------------------------------------------------------------------------
// Labels & icons, resolved live from the study data (renames show up at once).
// ---------------------------------------------------------------------------

const PAGES: [string, string, LucideIcon][] = [
  ["/", "Übersicht", LayoutDashboard],
  ["/calendar", "Kalender", CalendarDays],
  ["/notes", "Sitzungen", NotebookPen],
  ["/review/session", "Lernsitzung", Brain],
  ["/review", "Lernen", Brain],
  ["/flashcards", "Karteikarten", Layers],
  ["/exams", "Probeklausuren", FileQuestion],
  ["/documents", "Unterlagen", FolderOpen],
  ["/semesters", "Module", GraduationCap],
  ["/progress", "Fortschritt", Trophy],
  ["/settings", "Einstellungen", Settings],
  ["/search", "Suche", Search],
];

interface Label {
  title: string;
  color?: string;
  Icon?: LucideIcon;
  /** Module the tab belongs to – scope of the "+" picker. */
  moduleId?: string;
  missing?: boolean;
}

function useLabels() {
  const { tree, documents } = useStudyData();
  return useMemo(() => {
    const modules = new Map<string, { name: string; color: string }>();
    const notes = new Map<string, { label: string; color: string; moduleId: string }>();
    for (const s of tree)
      for (const m of s.modules) {
        modules.set(m.id, { name: m.name, color: m.color });
        for (const n of m.notes) notes.set(n.id, { label: sessionLabel(n), color: m.color, moduleId: m.id });
      }
    const docs = new Map(documents.map((d) => [d.id, d]));
    return (tab: Pick<Tab, "key" | "title">): Label => {
      const id = idOf(tab.key);
      switch (kindOf(tab.key)) {
        case "note": {
          const n = notes.get(id!);
          return n ? { title: n.label, color: n.color, moduleId: n.moduleId } : { title: tab.title || "Sitzung", Icon: NotebookPen, missing: true };
        }
        case "doc": {
          const d = docs.get(id!);
          return d ? { title: d.title, Icon: FileText, moduleId: d.moduleId ?? undefined } : { title: tab.title || "Unterlage", Icon: FileText, missing: true };
        }
        case "module": {
          const m = modules.get(id!);
          return m ? { title: m.name, color: m.color, moduleId: id! } : { title: tab.title || "Modul", Icon: GraduationCap, missing: true };
        }
        default: {
          const page = PAGES.find(([p]) => tab.key === p) ?? PAGES.find(([p]) => p !== "/" && tab.key.startsWith(`${p}/`));
          const exact = page?.[0] === tab.key;
          return { title: exact ? page![1] : tab.title || page?.[1] || "Seite", Icon: page?.[2] ?? LayoutDashboard };
        }
      }
    };
  }, [tree, documents]);
}

function TabIcon({ label, className }: { label: Label; className?: string }) {
  if (label.color) return <ModuleDot color={label.color} className={cn("size-2", className)} />;
  const Icon = label.Icon ?? LayoutDashboard;
  return <Icon className={cn("size-3.5 shrink-0", label.Icon === FileText && "text-danger", className)} aria-hidden />;
}

// ---------------------------------------------------------------------------
// The workspace: tab strip + main pane (+ divider + split pane)
// ---------------------------------------------------------------------------

type DropTarget = { type: "bar"; index: number; x: number } | { type: "left" | "right" };
type Pane = "left" | "right";
type MenuAction = "left" | "right" | "swap" | "unsplit" | "close" | "others" | "close-right";

/**
 * Wraps the page content. Only the main tab is a real page; the split partner
 * is the same app in an iframe without shell. All other tabs are inert data –
 * open tabs cost no CPU in the background, and nothing is prefetched.
 *
 * In split view both panes scroll on their own below the tab strip, each with
 * a slim header; the focused pane is marked and receives "open" requests.
 */
export function Workspace({ children }: { children: ReactNode }) {
  const ws = useWorkspaceState();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const label = useLabels();
  const { tree, documents } = useStudyData();
  const [picker, setPicker] = useState<{ beside: boolean; moduleId?: string } | null>(null);
  const [plan, setPlan] = useState<{ moduleId?: string } | null>(null);
  const [frameRev, setFrameRev] = useState(0);
  const [drag, setDrag] = useState<{ key: string; target: DropTarget | null } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [focusState, setFocus] = useState<Pane>("left");
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const go = useCallback((href: string | null) => href && router.push(href, { scroll: false }), [router]);
  const splitTab = ws.split ? ws.tabs.find((t) => t.key === ws.split) : undefined;
  const split = !!splitTab;
  const focus: Pane = split ? focusState : "left";

  // Every navigation of the main pane lands in a tab.
  useEffect(() => {
    const href = cleanHref(`${pathname}${search ? `?${search}` : ""}`);
    const newTab = pendingNewTab;
    pendingNewTab = false;
    update((w) => navigate(w, href, "", Date.now(), { newTab }));
    const t = setTimeout(() => {
      const title = plainTitle();
      update((w) => ({ ...w, tabs: w.tabs.map((x) => (x.key === tabKey(href) && x.title !== title ? { ...x, title } : x)) }));
    }, 400);
    return () => clearTimeout(t);
  }, [pathname, search]);

  // Tabs of deleted sessions, documents or modules disappear (visible tabs stay until left).
  useEffect(() => {
    const exists = (t: Tab) => {
      const id = idOf(t.key);
      switch (kindOf(t.key)) {
        case "note":
          return tree.some((s) => s.modules.some((m) => m.notes.some((n) => n.id === id)));
        case "module":
          return tree.some((s) => s.modules.some((m) => m.id === id));
        case "doc":
          return documents.some((d) => d.id === id);
        default:
          return true;
      }
    };
    update((w) => {
      const tabs = w.tabs.filter((t) => t.key === w.active || exists(t));
      return tabs.length === w.tabs.length ? w : { ...w, tabs, split: tabs.some((t) => t.key === w.split) ? w.split : null };
    });
  }, [tree, documents]);

  // The split pane scrolls on its own; carry the scroll position over when it opens / closes.
  const mainScroll = useRef(0);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || window.innerWidth < SPLIT_MIN_WIDTH) return;
    if (split) {
      main.scrollTop = window.scrollY;
      window.scrollTo(0, 0);
    } else window.scrollTo(0, mainScroll.current);
  }, [split]);

  const focusPane = useCallback((pane: Pane) => {
    if (pane === "right" && frameRef.current) {
      frameRef.current.focus();
      frameRef.current.contentWindow?.focus();
    } else mainRef.current?.focus({ preventScroll: true });
    setFocus(pane);
  }, []);

  const api = useMemo<WorkspaceApi>(
    () => ({
      openTab: (href) => {
        pendingNewTab = true;
        router.push(href, { scroll: false });
      },
      openBeside: (href) => {
        const key = tabKey(href);
        const w = current();
        // No room for two panes, or it is the main page itself: just go there.
        if (window.innerWidth < SPLIT_MIN_WIDTH || key === w.active) {
          if (key !== w.active) pendingNewTab = true;
          router.push(href, { scroll: false });
          return;
        }
        if (key === w.split) {
          // Already beside: the pane navigates itself (no reload, e.g. jump to a PDF page).
          frameRef.current?.contentWindow?.postMessage({ type: "study:goto", href } satisfies ParentMessage, window.location.origin);
          update((x) => ({ ...x, tabs: x.tabs.map((t) => (t.key === key ? { ...t, href, usedAt: Date.now() } : t)) }));
          return;
        }
        update((x) => {
          const now = Date.now();
          const exists = x.tabs.some((t) => t.key === key);
          const at = x.tabs.findIndex((t) => t.key === x.active);
          const tab = { key, href, title: "", usedAt: now };
          const tabs = exists ? x.tabs.map((t) => (t.key === key ? { ...t, href, usedAt: now } : t)) : [...x.tabs.slice(0, at + 1), tab, ...x.tabs.slice(at + 1)];
          const next = { ...x, tabs, split: key };
          // Keep the limit without closing the two visible tabs.
          while (next.tabs.length > MAX_TABS) {
            const victim = next.tabs.filter((t) => t.key !== next.active && t.key !== next.split).reduce((a, b) => (b.usedAt < a.usedAt ? b : a));
            next.tabs = next.tabs.filter((t) => t !== victim);
          }
          return next;
        });
        setFrameRev((r) => r + 1);
      },
      openPicker: (opts) => setPicker({ beside: !!opts?.beside, moduleId: opts?.moduleId }),
    }),
    [router],
  );

  const toggleSplit = useCallback(() => {
    const w = current();
    if (w.split) {
      update(closeSplit);
      return;
    }
    if (window.innerWidth < SPLIT_MIN_WIDTH) return;
    const partner = recentPartner(w);
    if (partner) api.openBeside(partner.href);
    else setPicker({ beside: true });
  }, [api]);

  const swap = useCallback(() => {
    const res = swapPanes(current());
    update(() => res.ws);
    setFrameRev((r) => r + 1);
    go(res.go);
  }, [go]);

  /** The split pane becomes the only (main) view. */
  const maximizeRight = useCallback(() => {
    const w = current();
    if (!w.split) return;
    const res = placeTab(w, w.split, "left");
    update(() => closeSplit(res.ws));
    go(res.go);
  }, [go]);

  // Messages from the split pane.
  useEffect(() => {
    const onMessage = (e: MessageEvent<FrameMessage>) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data;
      switch (msg?.type) {
        case "study:nav":
          if (typeof msg.href === "string") update((w) => retargetSplit(w, msg.href, msg.title, Date.now()));
          break;
        case "study:open":
          // From the right pane, "beside" is the main pane – and so is a new tab.
          if (typeof msg.href === "string" && msg.href.startsWith("/") && !msg.href.startsWith("//")) {
            if (tabKey(msg.href) === current().split) api.openBeside(msg.href);
            else api.openTab(msg.href);
          }
          break;
        case "study:picker":
          setPicker({ beside: true, moduleId: msg.moduleId });
          break;
        case "study:focus":
          setFocus("right");
          break;
        case "study:key":
          // Replay the shortcut here, as if it had been pressed in the main window.
          if (msg.init && isShellShortcut(msg.init)) document.body.dispatchEvent(new KeyboardEvent("keydown", { ...msg.init, bubbles: true, cancelable: true }));
          break;
        case "study:commands":
          if (msg.state && Array.isArray(msg.state.known)) setFrameCommandState(msg.state);
          break;
        case "study:command":
          if (isCommandId(msg.id)) runCommand(msg.id, { pane: "right", fallbackOnly: msg.fallbackOnly });
          break;
      }
    };
    // Clicking into the iframe only blurs this window.
    const onBlur = () => setTimeout(() => document.activeElement === frameRef.current && setFocus("right"));
    window.addEventListener("message", onMessage);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("blur", onBlur);
    };
  }, [api]);

  // Keys: ⌘O open, ⌘⇧\ split on/off, ⌘⌥←/→ switch pane, Ctrl+Tab / ⌘⇧[ ] switch tabs.
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setPicker({ beside: !!current().split && focusRef.current === "right" });
        return;
      }
      if (mod && e.shiftKey && !e.altKey && e.code === "Backslash") {
        e.preventDefault();
        toggleSplit();
        return;
      }
      if (mod && e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && current().split) {
        e.preventDefault();
        focusPane(e.key === "ArrowLeft" ? "left" : "right");
        return;
      }
      const ctrlTab = e.ctrlKey && e.key === "Tab";
      const bracket = e.metaKey && e.shiftKey && (e.code === "BracketRight" || e.code === "BracketLeft");
      if (!ctrlTab && !bracket) return;
      const step = ctrlTab ? (e.shiftKey ? -1 : 1) : e.code === "BracketRight" ? 1 : -1;
      const target = cycleTab(current(), step);
      if (!target || target.key === current().active) return;
      e.preventDefault();
      go(target.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleSplit, focusPane]);

  const closeAndGo = (key: string) => {
    rememberClosed(current(), [key]);
    const res = closeTab(current(), key);
    update(() => res.ws);
    go(res.go);
  };

  const drop = (key: string, target: DropTarget) => {
    if (target.type === "bar") return update((w) => moveTab(w, key, target.index));
    const res = placeTab(current(), key, target.type);
    update(() => res.ws);
    setFrameRev((r) => r + 1);
    go(res.go);
  };

  const menu = (action: MenuAction, key: string) => {
    const apply = (res: { ws: Workspace; go: string | null }) => {
      update(() => res.ws);
      go(res.go);
    };
    switch (action) {
      case "left":
      case "right":
        return drop(key, { type: action });
      case "swap":
        return swap();
      case "unsplit":
        return update(closeSplit);
      case "close":
        return closeAndGo(key);
      case "others":
        rememberClosed(current(), current().tabs.filter((t) => t.key !== key).map((t) => t.key));
        return apply(closeOthers(current(), key));
      case "close-right": {
        const w = current();
        rememberClosed(w, w.tabs.slice(w.tabs.findIndex((t) => t.key === key) + 1).map((t) => t.key));
        return apply(closeToRight(w, key));
      }
    }
  };

  const activeTab = ws.active ? (ws.tabs.find((t) => t.key === ws.active) ?? { key: ws.active, title: "" }) : null;
  const activeLabel = activeTab ? label(activeTab) : null;
  const focusModule = (focus === "right" && splitTab ? label(splitTab) : activeLabel)?.moduleId;

  // Commands: the focused pane decides where page commands go.
  useEffect(() => {
    focusedModule = focusModule;
  }, [focusModule]);
  useEffect(() => {
    setCommandRouter({
      focus: () => (current().split ? focusRef.current : "left"),
      forward: (id) => frameRef.current?.contentWindow?.postMessage({ type: "study:command", id } satisfies FrameCommandMessage, window.location.origin),
    });
    return () => setCommandRouter(null);
  }, []);
  useEffect(() => {
    notifyCommands();
  }, [focus, split]);
  useEffect(() => {
    if (!split) setFrameCommandState(null);
  }, [split, frameRev]);
  const shell = { layer: "shell" } as const;
  useCommand("tab.open", () => setPicker({ beside: split && focus === "right" }), shell);
  useCommand("tab.openBeside", () => setPicker({ beside: true }), shell);
  useCommand("tab.close", () => {
    const w = current();
    const key = w.split && focus === "right" ? w.split : w.active;
    if (key) closeAndGo(key);
  }, shell);
  useCommand("tab.reopen", () => {
    const href = closedTabs.pop();
    notifyCommands();
    if (href) api.openTab(href);
  }, { ...shell, enabled: closedTabs.length > 0 });
  useCommand("view.split", toggleSplit, { ...shell, checked: split });
  useCommand("view.swap", swap, { ...shell, enabled: split });
  useCommand("view.focusLeft", () => focusPane("left"), { ...shell, enabled: split, checked: split && focus === "left" });
  useCommand("view.focusRight", () => focusPane("right"), { ...shell, enabled: split, checked: split && focus === "right" });
  const cycle = (step: 1 | -1) => {
    const target = cycleTab(current(), step);
    if (target && target.key !== current().active) go(target.href);
  };
  useCommand("tab.next", () => cycle(1), { ...shell, enabled: ws.tabs.length > 1 });
  useCommand("tab.prev", () => cycle(-1), { ...shell, enabled: ws.tabs.length > 1 });
  useCommand("study.cram", () => go(`/review/session?module=${focusModule}&mode=cram`), { ...shell, enabled: !!focusModule });
  useCommand("exam.new", () => go(focusModule ? `/exams/new?module=${focusModule}` : "/exams/new"), shell);
  useCommand("plan.create", () => setPlan({ moduleId: focusModule }), shell);

  return (
    <ApiCtx.Provider value={api}>
      <TabStrip
        ws={ws}
        label={label}
        contentRef={contentRef}
        drag={drag}
        setDrag={setDrag}
        focus={focus}
        onActivate={(t) => (t.key === ws.split ? focusPane("right") : t.key === ws.active ? focusPane("left") : go(t.href))}
        onClose={closeAndGo}
        onDrop={drop}
        onMenu={menu}
        onPlus={() => setPicker({ beside: split && focus === "right" })}
        onToggleSplit={toggleSplit}
        scopeName={activeLabel?.moduleId ? label({ key: `/modules/${activeLabel.moduleId}`, title: "" }).title : null}
      />
      <div ref={contentRef} className={cn("workspace-content relative", split && "md:flex md:h-[var(--content-h)] md:overflow-hidden print:block print:h-auto print:overflow-visible")} style={{ "--split-ratio": ws.ratio } as React.CSSProperties}>
        <section
          className={cn("flex min-w-0 flex-col", split && "md:shrink-0 md:basis-[calc(var(--split-ratio)*100%)] print:basis-full")}
          onPointerDownCapture={() => setFocus("left")}
          onFocusCapture={() => setFocus("left")}
          aria-label={split ? `Links: ${activeLabel?.title ?? ""}` : undefined}
        >
          {split && activeLabel && (
            <PaneHeader className="hidden md:flex" label={activeLabel} focused={focus === "left"} side="left">
              <PaneButton label="Nur diese Ansicht" onClick={() => update(closeSplit)}>
                <Maximize2 />
              </PaneButton>
            </PaneHeader>
          )}
          <main
            ref={mainRef}
            tabIndex={-1}
            onScroll={(e) => (mainScroll.current = e.currentTarget.scrollTop)}
            className={cn(
              "pane-main min-w-0 outline-none has-[[data-bleed]]:p-0",
              split
                ? "is-split px-4 pt-5 pb-24 sm:px-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pb-16 print:overflow-visible"
                : "mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-8 lg:pb-12 has-[[data-wide]]:max-w-none",
            )}
          >
            {children}
          </main>
        </section>
        {splitTab && (
          <>
            <Divider contentRef={contentRef} ratio={ws.ratio} onResizing={setResizing} onCommit={(r) => update((w) => setRatio(w, r))} onCollapse={(side) => (side === "right" ? update(closeSplit) : maximizeRight())} />
            <SidePane
              tab={splitTab}
              label={label(splitTab)}
              rev={frameRev}
              frameRef={frameRef}
              inert={!!drag || resizing}
              focused={focus === "right"}
              onSwap={swap}
              onMaximize={maximizeRight}
              onClose={() => update(closeSplit)}
            />
          </>
        )}
        {drag && <DropOverlay target={drag.target} ratio={split ? ws.ratio : 0.5} split={split} />}
      </div>
      {plan && <StudyPlanDialog preselectModuleId={plan.moduleId} onClose={() => setPlan(null)} />}
      {picker && (
        <TabPicker
          beside={picker.beside}
          moduleId={picker.moduleId ?? activeLabel?.moduleId}
          onClose={() => setPicker(null)}
          onOpen={(href, beside) => {
            setPicker(null);
            (beside ? api.openBeside : api.openTab)(href);
          }}
        />
      )}
    </ApiCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Tab strip with drag & drop (pointer events: works in the desktop webview and
// keeps tracking over the iframe thanks to pointer capture) and a context menu
// ---------------------------------------------------------------------------

/** Tiny "which side" mark for the two visible tabs in split view. */
function PaneMark({ side, focused }: { side: Pane; focused: boolean }) {
  return (
    <svg viewBox="0 0 14 10" className={cn("h-2.5 w-3.5 shrink-0", focused ? "text-link" : "text-muted-foreground")} aria-label={side === "left" ? "links" : "rechts"}>
      <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x={side === "left" ? 1.5 : 7} y="1.5" width="5.5" height="7" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function TabStrip({
  ws,
  label,
  contentRef,
  drag,
  setDrag,
  focus,
  onActivate,
  onClose,
  onDrop,
  onMenu,
  onPlus,
  onToggleSplit,
  scopeName,
}: {
  ws: Workspace;
  label: (t: Tab) => Label;
  contentRef: React.RefObject<HTMLDivElement | null>;
  drag: { key: string; target: DropTarget | null } | null;
  setDrag: (d: { key: string; target: DropTarget | null } | null) => void;
  focus: Pane;
  onActivate: (t: Tab) => void;
  onClose: (key: string) => void;
  onDrop: (key: string, target: DropTarget) => void;
  onMenu: (action: MenuAction, key: string) => void;
  onPlus: () => void;
  onToggleSplit: () => void;
  scopeName: string | null;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ key: string; x: number; y: number; dragging: boolean; target: DropTarget | null } | null>(null);
  const suppressClick = useRef(false);

  // Keep the active tab visible in a long strip.
  useEffect(() => {
    if (!ws.active) return;
    barRef.current?.querySelector(`[data-tab="${CSS.escape(ws.active)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ws.active]);

  const targetAt = (key: string, x: number, y: number): DropTarget | null => {
    const bar = barRef.current?.getBoundingClientRect();
    if (bar && y <= bar.bottom + 8) {
      const others = Array.from(barRef.current!.querySelectorAll<HTMLElement>("[data-tab]")).filter((el) => el.dataset.tab !== key);
      const rects = others.map((el) => el.getBoundingClientRect());
      const index = rects.filter((r) => r.left + r.width / 2 < x).length;
      const edge = index < rects.length ? rects[index]!.left : (rects.at(-1)?.right ?? bar.left);
      return { type: "bar", index, x: edge - bar.left + barRef.current!.scrollLeft };
    }
    const content = contentRef.current?.getBoundingClientRect();
    // Split view needs room (md and up).
    if (!content || window.innerWidth < SPLIT_MIN_WIDTH || x < content.left || x > content.right) return null;
    const w = current();
    const boundary = content.left + content.width * (w.split ? w.ratio : 0.5);
    const side = x < boundary ? "left" : "right";
    if ((side === "left" && key === w.active) || (side === "right" && key === w.split)) return null;
    if (side === "right" && key === w.active && w.tabs.length < 2) return null;
    return { type: side };
  };

  const split = !!ws.split;

  return (
    <>
      <div className="sticky top-12 z-20 hidden h-10 items-end gap-1 border-b bg-background px-2 sm:px-4 md:flex print:hidden">
        <div
          ref={barRef}
          role="tablist"
          aria-label="Geöffnete Tabs"
          className="relative flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]"
          onDoubleClick={(e) => e.target === e.currentTarget && onPlus()}
        >
          {ws.tabs.map((t) => {
            const l = label(t);
            const active = t.key === ws.active;
            const isSplit = t.key === ws.split;
            const visible = active || isSplit;
            const focused = split && ((active && focus === "left") || (isSplit && focus === "right"));
            return (
              <ContextMenu.Root key={t.key}>
                <ContextMenu.Trigger asChild>
                  <div
                    data-tab={t.key}
                    role="tab"
                    tabIndex={0}
                    aria-selected={visible}
                    title={`${l.title}${isSplit ? " · rechts" : active && split ? " · links" : ""}`}
                    className={cn(
                      "group relative -mb-px flex h-8 max-w-52 min-w-24 shrink-0 cursor-default touch-none items-center gap-2 rounded-t-lg border border-b-0 pr-1 pl-3 text-[13px] transition-colors select-none",
                      visible ? "border-border bg-card text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      (split ? focused : active) && "font-medium",
                      drag?.key === t.key && "opacity-40",
                      l.missing && "italic",
                    )}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      onActivate(t);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onActivate(t);
                      }
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        onClose(t.key);
                      }
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || (e.target as HTMLElement).closest("[data-close]")) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      pointer.current = { key: t.key, x: e.clientX, y: e.clientY, dragging: false, target: null };
                    }}
                    onPointerMove={(e) => {
                      const p = pointer.current;
                      if (!p || p.key !== t.key) return;
                      if (!p.dragging) {
                        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
                        p.dragging = true;
                        setDrag({ key: t.key, target: null });
                      }
                      if (ghostRef.current) ghostRef.current.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
                      const target = targetAt(t.key, e.clientX, e.clientY);
                      if (JSON.stringify(target) !== JSON.stringify(p.target)) {
                        p.target = target;
                        setDrag({ key: t.key, target });
                      }
                    }}
                    onPointerUp={() => {
                      const p = pointer.current;
                      pointer.current = null;
                      if (!p?.dragging) return;
                      suppressClick.current = true;
                      setDrag(null);
                      if (p.target) onDrop(p.key, p.target);
                    }}
                    onPointerCancel={() => {
                      pointer.current = null;
                      setDrag(null);
                    }}
                  >
                    {visible && <span className="absolute inset-x-0 -bottom-px h-px bg-card" aria-hidden />}
                    {focused && <span className="absolute inset-x-2 top-0 h-0.5 rounded-b bg-link" aria-hidden />}
                    <TabIcon label={l} />
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {split && visible && <PaneMark side={isSplit ? "right" : "left"} focused={focused} />}
                    <button
                      type="button"
                      data-close
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(t.key);
                      }}
                      aria-label={`${l.title} schließen`}
                      title="Schließen (Mittelklick)"
                      className={cn("shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground", !visible && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="z-50 min-w-56 rounded-md border bg-background p-1 text-sm shadow-md">
                    {!active && <MenuItem icon={<PanelLeft />} onSelect={() => onMenu("left", t.key)}>{split ? "Links öffnen" : "Öffnen"}</MenuItem>}
                    {!isSplit && (
                      <MenuItem icon={<PanelRight />} onSelect={() => onMenu("right", t.key)}>
                        {active ? "Nach rechts verschieben" : split ? "Rechts öffnen" : "Rechts daneben öffnen"}
                      </MenuItem>
                    )}
                    {split && visible && (
                      <MenuItem icon={<ArrowLeftRight />} onSelect={() => onMenu("swap", t.key)}>
                        Seiten tauschen
                      </MenuItem>
                    )}
                    {split && (
                      <MenuItem icon={<Columns2 />} onSelect={() => onMenu("unsplit", t.key)} hint="⌘⇧\">
                        Geteilte Ansicht beenden
                      </MenuItem>
                    )}
                    <ContextMenu.Separator className="my-1 h-px bg-border" />
                    <MenuItem icon={<X />} onSelect={() => onMenu("close", t.key)}>
                      Schließen
                    </MenuItem>
                    <MenuItem onSelect={() => onMenu("others", t.key)} disabled={ws.tabs.length < 2}>
                      Andere Tabs schließen
                    </MenuItem>
                    <MenuItem onSelect={() => onMenu("close-right", t.key)} disabled={ws.tabs.at(-1)?.key === t.key}>
                      Tabs rechts davon schließen
                    </MenuItem>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            );
          })}
          {drag?.target?.type === "bar" && <span className="pointer-events-none absolute top-1.5 bottom-0 w-0.5 rounded bg-link" style={{ left: drag.target.x - 1 }} aria-hidden />}
        </div>
        <button
          type="button"
          onClick={onPlus}
          className="mb-1 flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title={scopeName ? `Aus ${scopeName} öffnen … (⌘O)` : "Öffnen … (⌘O)"}
          aria-label="Tab öffnen"
        >
          <Plus className="size-4" />
          {scopeName && <span className="max-w-32 truncate">{scopeName}</span>}
        </button>
        <button
          type="button"
          onClick={onToggleSplit}
          aria-pressed={split}
          className={cn("mb-1 ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", split && "bg-accent text-foreground")}
          title={split ? "Geteilte Ansicht beenden (⌘⇧\\)" : "Geteilte Ansicht (⌘⇧\\)"}
          aria-label="Geteilte Ansicht"
        >
          <Columns2 className="size-4" />
        </button>
      </div>
      {drag && (
        <div ref={ghostRef} className="pointer-events-none fixed top-0 left-0 z-[70] flex max-w-56 items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-[13px] shadow-lg" aria-hidden>
          {(() => {
            const t = ws.tabs.find((x) => x.key === drag.key);
            if (!t) return null;
            const l = label(t);
            return (
              <>
                <TabIcon label={l} />
                <span className="truncate">{l.title}</span>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}

function MenuItem({ children, onSelect, icon, hint, disabled }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"
    >
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <span className="pl-4 text-xs text-muted-foreground">{hint}</span>}
    </ContextMenu.Item>
  );
}

function DropOverlay({ target, ratio, split }: { target: DropTarget | null; ratio: number; split: boolean }) {
  const zone = (side: Pane, text: string, Icon: LucideIcon) => {
    const on = target?.type === side;
    return (
      <div className={cn("flex min-w-0 p-2", side === "left" ? "shrink-0" : "flex-1")} style={side === "left" ? { width: `${ratio * 100}%` } : undefined}>
        <div
          className={cn(
            "flex flex-1 flex-col items-center rounded-xl border-2 border-dashed transition-all duration-150",
            on ? "border-link bg-link/10 backdrop-blur-[1px]" : "border-transparent",
          )}
        >
          <span
            className={cn(
              "sticky top-[42vh] mt-24 inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm font-medium shadow-lg transition-all duration-150",
              on ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
          >
            <Icon className="size-4 text-link" /> {text}
          </span>
        </div>
      </div>
    );
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-30 hidden md:flex" aria-hidden>
      {zone("left", split ? "Links öffnen" : "Hier öffnen", PanelLeft)}
      {zone("right", split ? "Rechts öffnen" : "Rechts daneben öffnen", PanelRight)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panes: header, divider, split pane
// ---------------------------------------------------------------------------

function PaneHeader({ label, focused, side, className, before, children }: { label: Label; focused: boolean; side: Pane; className?: string; before?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cn("relative h-9 shrink-0 items-center gap-0.5 border-b px-1.5 text-[13px] transition-colors print:hidden", focused ? "bg-background" : "bg-muted/40", className ?? "flex")}>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 transition-colors", focused ? "bg-link" : "bg-transparent")} aria-hidden />
      {before}
      <span className="flex min-w-0 flex-1 items-center gap-2 px-1.5">
        <TabIcon label={label} />
        <span className={cn("truncate font-medium", !focused && "text-muted-foreground")} title={`${label.title} (${side === "left" ? "links" : "rechts"})`}>
          {label.title}
        </span>
      </span>
      {children}
    </div>
  );
}

function PaneButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5">
      {children}
    </button>
  );
}

/**
 * Draggable divider: snaps to ⅓ · ½ · ⅔, keeps both panes usable, and closes a
 * pane when dragged to the edge. Keyboard: ←/→, Home/End, Enter = 50/50.
 */
function Divider({
  contentRef,
  ratio,
  onResizing,
  onCommit,
  onCollapse,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  ratio: number;
  onResizing: (r: boolean) => void;
  onCommit: (r: number) => void;
  onCollapse: (side: Pane) => void;
}) {
  const [live, setLive] = useState<{ ratio: number; collapse: Pane | null } | null>(null);
  const measure = (clientX: number) => {
    const box = contentRef.current!.getBoundingClientRect();
    const raw = (clientX - box.left) / box.width;
    const min = Math.max(0.2, PANE_MIN_PX / box.width);
    const collapse: Pane | null = raw < min * 0.5 ? "left" : raw > 1 - min * 0.5 ? "right" : null;
    return { ratio: snapRatio(Math.min(1 - min, Math.max(min, raw))), collapse };
  };
  const apply = (r: number) => contentRef.current?.style.setProperty("--split-ratio", String(r));
  const end = () => {
    onResizing(false);
    document.documentElement.classList.remove("is-resizing");
  };
  const step = (r: number) => {
    apply(r);
    onCommit(r);
  };
  const pct = Math.round((live?.ratio ?? ratio) * 100);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Breite der Ansichten (Doppelklick: 50/50)"
      aria-valuenow={pct}
      aria-valuemin={20}
      aria-valuemax={80}
      className="group relative z-20 hidden w-px shrink-0 cursor-col-resize touch-none bg-border outline-none md:block print:hidden"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onResizing(true);
        document.documentElement.classList.add("is-resizing");
        setLive({ ratio, collapse: null });
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const m = measure(e.clientX);
        apply(m.ratio);
        setLive((l) => (l && l.ratio === m.ratio && l.collapse === m.collapse ? l : m));
      }}
      onPointerUp={(e) => {
        if (!live) return;
        const m = measure(e.clientX);
        setLive(null);
        end();
        if (m.collapse) {
          apply(ratio);
          onCollapse(m.collapse);
        } else onCommit(m.ratio);
      }}
      onPointerCancel={() => {
        setLive(null);
        end();
        apply(ratio);
      }}
      onDoubleClick={() => step(0.5)}
      onKeyDown={(e) => {
        const next = e.key === "ArrowLeft" ? ratio - 0.02 : e.key === "ArrowRight" ? ratio + 0.02 : e.key === "Home" ? 0.2 : e.key === "End" ? 0.8 : e.key === "Enter" ? 0.5 : null;
        if (next === null) return;
        e.preventDefault();
        step(Math.min(0.8, Math.max(0.2, next)));
      }}
    >
      {/* Generous hit area around the 1px line */}
      <span className="absolute inset-y-0 -right-2 -left-2" aria-hidden />
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-link opacity-0 transition-opacity delay-100 group-hover:opacity-50 group-focus-visible:opacity-100",
          live && "opacity-100 delay-0",
          live?.collapse && "bg-danger",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 flex h-9 w-2.5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-[3px] rounded-full border bg-background shadow-sm transition-opacity",
          live ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        aria-hidden
      >
        <span className="size-[3px] rounded-full bg-muted-foreground" />
        <span className="size-[3px] rounded-full bg-muted-foreground" />
        <span className="size-[3px] rounded-full bg-muted-foreground" />
      </span>
      {live && (
        <span className={cn("pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums shadow-md", live.collapse ? "bg-danger text-white" : "bg-foreground text-background")}>
          {live.collapse ? (live.collapse === "left" ? "Links schließen" : "Rechts schließen") : `${pct} : ${100 - pct}`}
        </span>
      )}
    </div>
  );
}

function SidePane({
  tab,
  label,
  rev,
  frameRef,
  inert,
  focused,
  onSwap,
  onMaximize,
  onClose,
}: {
  tab: Tab;
  label: Label;
  rev: number;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  inert: boolean;
  focused: boolean;
  onSwap: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  // The frame keeps its own navigation; it is only reloaded when the tab is
  // replaced from outside (drop, swap, "open beside").
  const [src, setSrc] = useState(() => withEmbed(tab.href));
  const [mount, setMount] = useState(0);
  const [loading, setLoading] = useState(true);
  const seenRev = useRef(rev);
  useEffect(() => {
    let frameKey = tab.key;
    try {
      const loc = frameRef.current?.contentWindow?.location;
      if (loc && loc.href !== "about:blank") frameKey = tabKey(loc.pathname);
    } catch {}
    if (frameKey !== tab.key || rev !== seenRev.current) {
      seenRev.current = rev;
      setSrc(withEmbed(tab.href));
      setMount((m) => m + 1); // reload even if the URL is the same
      setLoading(true);
    }
    // `tab.href` is intentionally not a dependency: it follows the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key, rev, frameRef]);

  const history = (dir: 1 | -1) => {
    try {
      frameRef.current?.contentWindow?.history.go(dir);
    } catch {}
  };

  return (
    <section className="relative hidden min-w-0 flex-1 flex-col bg-background md:flex print:hidden" aria-label={`Rechts: ${label.title}`}>
      <PaneHeader
        label={label}
        focused={focused}
        side="right"
        before={
          <>
            <PaneButton label="Zurück" onClick={() => history(-1)}>
              <ArrowLeft />
            </PaneButton>
            <PaneButton label="Vor" onClick={() => history(1)}>
              <ArrowRight />
            </PaneButton>
          </>
        }
      >
        <PaneButton label="Seiten tauschen" onClick={onSwap}>
          <ArrowLeftRight />
        </PaneButton>
        <PaneButton label="Nur diese Ansicht" onClick={onMaximize}>
          <Maximize2 />
        </PaneButton>
        <PaneButton label="Rechte Ansicht schließen (⌘⇧\)" onClick={onClose}>
          <X />
        </PaneButton>
      </PaneHeader>
      <div className="relative min-h-0 flex-1">
        <iframe
          key={mount}
          ref={frameRef}
          src={src}
          title={label.title}
          onLoad={() => setLoading(false)}
          className={cn("absolute inset-0 size-full bg-background transition-opacity duration-200", loading && "opacity-0", inert && "pointer-events-none")}
        />
        {loading && (
          <div className="pointer-events-none absolute inset-0 space-y-3 p-6" aria-hidden>
            <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            <div className="mt-6 h-32 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "+" picker: search the current module (or everything) and open as tab / beside
// ---------------------------------------------------------------------------

interface PickItem {
  href: string;
  title: string;
  sub?: string;
  label: Label;
}

function TabPicker({ beside, moduleId, onClose, onOpen }: { beside: boolean; moduleId?: string; onClose: () => void; onOpen: (href: string, beside: boolean) => void }) {
  const { tree, documents } = useStudyData();
  const modules = useMemo(() => tree.flatMap((s) => s.modules), [tree]);
  const mod = modules.find((m) => m.id === moduleId);
  const [scope, setScope] = useState<"module" | "all">(mod ? "module" : "all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const needle = q.trim().toLowerCase();

  const items = useMemo(() => {
    const inScope = scope === "module" && mod ? [mod] : modules;
    const list: PickItem[] = [];
    if (scope === "all") for (const [href, title, Icon] of PAGES) if (href !== "/review/session") list.push({ href, title, label: { title, Icon } });
    for (const m of inScope) list.push({ href: `/modules/${m.id}`, title: scope === "module" ? `${m.name} – Übersicht` : m.name, sub: "Fach", label: { title: m.name, color: m.color } });
    for (const m of inScope) for (const n of m.notes) list.push({ href: `/notes/${n.id}`, title: sessionLabel(n), sub: m.name, label: { title: "", color: m.color } });
    for (const d of documents)
      if (scope === "all" || d.moduleId === mod?.id) list.push({ href: `/documents/${d.id}`, title: d.title, sub: d.module?.name ?? "Unterlage", label: { title: d.title, Icon: FileText } });
    return list.filter((i) => !needle || i.title.toLowerCase().includes(needle) || i.sub?.toLowerCase().includes(needle)).slice(0, 60);
  }, [scope, mod, modules, documents, needle]);

  const pick = (i: PickItem | undefined, alt: boolean) => i && onOpen(i.href, alt ? !beside : beside);

  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={beside ? "Daneben öffnen" : "Öffnen"}
      description={
        <span>
          <Kbd>↵</Kbd> {beside ? "daneben" : "als Tab"} · <Kbd>⌘↵</Kbd> {beside ? "als Tab" : "daneben"} · Tabs lassen sich auch auf den Inhalt ziehen.
        </span>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Input
          autoFocus
          placeholder={scope === "module" && mod ? `In ${mod.name} suchen …` : "Sitzungen, Unterlagen, Fächer, Seiten …"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(items[sel], e.metaKey || e.ctrlKey);
            }
          }}
        />
      </div>
      {mod && (
        <div className="mb-3 inline-flex rounded-lg bg-muted p-0.5 text-[13px]" role="tablist" aria-label="Suchbereich">
          {([["module", mod.name], ["all", "Alle Fächer"]] as const).map(([s, text]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => {
                setScope(s);
                setSel(0);
              }}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium", scope === s ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {s === "module" && <ModuleDot color={mod.color} className="size-2" />}
              <span className="max-w-40 truncate">{text}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="max-h-[55dvh] overflow-y-auto" role="listbox" aria-label="Ergebnisse">
        {items.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nichts gefunden.</li>}
        {items.map((i, n) => (
          <li key={i.href} role="option" aria-selected={n === sel} className={cn("group flex items-center gap-2 rounded-lg pr-1", n === sel && "bg-muted")} onMouseEnter={() => setSel(n)}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left text-sm" onClick={() => pick(i, false)}>
              <TabIcon label={i.label} />
              <span className="truncate">{i.title}</span>
              {i.sub && <span className="ml-auto shrink-0 truncate pl-2 text-xs text-muted-foreground">{i.sub}</span>}
            </button>
            <button
              type="button"
              onClick={() => pick(i, true)}
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
              title={beside ? "Als Tab öffnen" : "Daneben öffnen"}
              aria-label={beside ? `${i.title} als Tab öffnen` : `${i.title} daneben öffnen`}
            >
              {beside ? <Plus className="size-4" /> : <Columns2 className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
