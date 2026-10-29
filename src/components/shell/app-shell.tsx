"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Brain,
  CalendarDays,
  ChevronDown,
  Flame,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Kbd, ModuleDot } from "@/components/ui/misc";
import { NoteCreateDialog } from "@/components/forms/note-dialog";
import { FlashcardDialog } from "@/components/forms/flashcard-dialog";
import { EventDialog, defaultEventValues } from "@/components/forms/event-dialog";
import { UploadDialog } from "@/components/forms/upload";
import { Celebration } from "@/components/gamification/celebration";
import { Ring } from "@/components/gamification/ring";
import { logout } from "@/server/actions/auth";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useStudyData } from "./study-data";
import { EmbeddedWorkspace, Workspace, focusedModuleId, isShellShortcut } from "./workspace";
import { CommandRuntime, EmbeddedCommandRuntime, isTyping, useCommand } from "./commands";
import { CommandPalette, ShortcutsDialog } from "./command-palette";
import { FocusProgressLine, FocusTimer, FocusTraySync, useZen } from "@/components/focus/focus-timer";

/**
 * Five places, nothing more. Flashcards and practice exams live inside
 * "Lernen" (tabs), progress behind the daily-goal ring in the header.
 */
const NAV = [
  { href: "/", label: "Übersicht", icon: LayoutDashboard },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/notes", label: "Sitzungen", icon: NotebookPen, badge: "summaries" as "due" | "summaries" },
  { href: "/review", label: "Lernen", icon: Brain, badge: "due" as const, also: ["/flashcards", "/exams"] },
  { href: "/documents", label: "Unterlagen", icon: FolderOpen },
];

export interface GameSummary {
  level: number;
  title: string;
  current: number;
  needed: number;
  progress: number;
  xpToday: number;
  dailyGoal: number;
  streak: number;
  activeToday: boolean;
}

/** Daily goal ring + streak – always visible, never in the way. */
function GameIndicator({ game }: { game: GameSummary }) {
  const goalPct = game.xpToday / game.dailyGoal;
  return (
    <Link
      href="/progress"
      className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-accent"
      title={`Tagesziel: ${game.xpToday}/${game.dailyGoal} XP · Serie: ${game.streak} Tage`}
    >
      <span className="flex items-center gap-1.5">
        <Ring value={goalPct} size={18} stroke={2.5} />
        <span className="hidden tabular-nums sm:inline">{Math.min(game.xpToday, 9999)}<span className="text-muted-foreground">/{game.dailyGoal}</span></span>
      </span>
      <span className={cn("flex items-center gap-0.5 tabular-nums", !game.activeToday && "text-muted-foreground")}>
        <Flame className={cn("size-4", game.activeToday ? "text-orange-500" : "text-muted-foreground")} aria-hidden />
        {game.streak}
      </span>
    </Link>
  );
}

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: { href: string; also?: string[] }) {
  return [item.href, ...(item.also ?? [])].some((h) => matches(pathname, h));
}

function toggleTheme() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem("theme", next ? "dark" : "light");
  } catch {}
}

function subscribeTheme(l: () => void) {
  const observer = new MutationObserver(l);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const useDark = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);

function ThemeToggle() {
  // The icon is switched purely via CSS so server and client render the same markup.
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Design umschalten" title="Hell/Dunkel umschalten (⇧⌘D)" onClick={toggleTheme}>
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}

type QuickDialog = "note" | "card" | "event" | "upload" | null;

function QuickCreate({ onOpen }: { onOpen: (d: QuickDialog) => void }) {
  return (
    <Dropdown
      trigger={
        <Button size="sm" aria-label="Neu erstellen">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Neu</span>
        </Button>
      }
    >
      <DropdownItem icon={<NotebookPen className="size-4" />} onSelect={() => onOpen("note")}>Sitzung (Mitschrift)</DropdownItem>
      <DropdownItem icon={<Layers className="size-4" />} onSelect={() => onOpen("card")}>Karteikarte</DropdownItem>
      <DropdownItem icon={<CalendarDays className="size-4" />} onSelect={() => onOpen("event")}>Termin / Lerneinheit</DropdownItem>
      <DropdownSeparator />
      <DropdownItem icon={<Upload className="size-4" />} onSelect={() => onOpen("upload")}>PDF hochladen</DropdownItem>
    </Dropdown>
  );
}

function SearchBox() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const focus = () => {
    ref.current?.focus();
    ref.current?.select();
  };
  useCommand("search.focus", focus, { layer: "shell" });
  // Pages without their own search (the PDF viewer has one) search everywhere.
  useCommand("edit.find", focus, { layer: "shell" });
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        name="q"
        placeholder="Suchen …"
        aria-label="Suche in Sitzungen, Karteikarten, Unterlagen"
        className="h-8 w-full rounded-md border bg-muted/40 pr-14 pl-9 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 sm:block"><Kbd>⌘K</Kbd></span>
    </form>
  );
}

function SidebarContent({
  dueCount,
  openSummaries,
  userName,
  desktop,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  dueCount: number;
  openSummaries: number;
  userName: string;
  desktop: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { tree } = useStudyData();
  const [openSemesters, setOpenSemesters] = useState<Record<string, boolean>>(() => (tree[0] ? { [tree[0].id]: true } : {}));
  // With a single semester the extra level is just noise.
  const grouped = tree.length > 1;
  const itemCls = (active: boolean) =>
    cn(
      "flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors",
      collapsed ? "justify-center px-0" : "px-2",
      active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
    );

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} title="Study Copilot" className={cn("mt-2 mb-3 flex h-10 items-center gap-2 rounded-md hover:bg-sidebar-accent", collapsed ? "mx-2 justify-center" : "mx-2 px-2")}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><GraduationCap className="size-3.5" aria-hidden /></span>
        {!collapsed && <span className="text-sm font-semibold tracking-tight">Study Copilot</span>}
      </Link>
      <nav className="space-y-px px-2" aria-label="Hauptnavigation">
        {NAV.map((item) => {
          const { href, label, icon: Icon, badge } = item;
          const active = isActive(pathname, item);
          const count = badge === "due" ? dueCount : badge === "summaries" ? openSummaries : 0;
          return (
            <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={cn(itemCls(active), "relative")}>
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && label}
              {count > 0 &&
                (collapsed ? (
                  <span className={cn("absolute top-1 right-1.5 size-1.5 rounded-full", badge === "due" ? "bg-primary" : "bg-muted-foreground")} aria-label={`${count} offen`} />
                ) : badge === "due" ? (
                  <span className="ml-auto rounded-md bg-primary px-1.5 text-[11px] leading-[18px] font-medium text-primary-foreground tabular-nums">{count}</span>
                ) : (
                  <span className="ml-auto rounded-md border bg-background px-1.5 text-[11px] leading-[16px] font-medium text-muted-foreground tabular-nums" title={`${count} Zusammenfassung(en) offen`}>{count}</span>
                ))}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {collapsed ? (
          <div className="space-y-px border-t pt-3">
            <Link href="/semesters" onClick={onNavigate} title="Alle Module" className={itemCls(matches(pathname, "/semesters"))}>
              <GraduationCap className="size-4" aria-hidden />
            </Link>
            {tree.flatMap((s) => s.modules).map((m) => (
              <Link key={m.id} href={`/modules/${m.id}`} title={m.name} className={itemCls(pathname.startsWith(`/modules/${m.id}`))}>
                <ModuleDot color={m.color} />
              </Link>
            ))}
          </div>
        ) : (
          <>
            <Link href="/semesters" onClick={onNavigate} className="group flex items-center justify-between px-2 pb-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Module
              <span className="opacity-0 transition-opacity group-hover:opacity-100">Alle →</span>
            </Link>
            {tree.length === 0 && (
              <Link href="/semesters" onClick={onNavigate} className="block px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground">
                Lege dein erstes Semester an →
              </Link>
            )}
            {tree.map((s) => {
              const open = !grouped || !!openSemesters[s.id];
              return (
                <div key={s.id} className="mb-1">
                  {grouped && (
                    <button
                      type="button"
                      onClick={() => setOpenSemesters((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                      aria-expanded={open}
                    >
                      <ChevronDown className={cn("size-3.5 transition", !open && "-rotate-90")} aria-hidden />
                      <span className="truncate">{s.name}</span>
                    </button>
                  )}
                  {open &&
                    s.modules.map((m) => {
                      const href = `/modules/${m.id}`;
                      return (
                        <Link key={m.id} href={href} onClick={onNavigate} className={cn(itemCls(pathname.startsWith(href)), "h-7", grouped && "ml-3")}>
                          <ModuleDot color={m.color} />
                          <span className="truncate">{m.name}</span>
                        </Link>
                      );
                    })}
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className={cn("flex items-center gap-1 border-t px-2 py-2", collapsed && "flex-col")}>
        <Link href="/settings" onClick={onNavigate} className={cn("flex h-9 min-w-0 items-center gap-2 rounded-md text-sm hover:bg-sidebar-accent", collapsed ? "justify-center px-1.5" : "flex-1 px-2")} title="Einstellungen">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && <span className="truncate">{userName}</span>}
        </Link>
        {!collapsed && <ThemeToggle />}
        {!collapsed && !desktop && (
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Abmelden" title="Abmelden">
              <LogOut className="size-4" />
            </Button>
          </form>
        )}
        {onToggleCollapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"} title={`${collapsed ? "Ausklappen" : "Einklappen"} (⌘\\)`}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Commands of the app itself: navigation, quick create, sidebar, theme, palette. */
function ShellCommands({
  onDialog,
  sidebarOpen,
  toggleSidebar,
  togglePalette,
  toggleShortcuts,
}: {
  onDialog: (d: QuickDialog) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  togglePalette: () => void;
  toggleShortcuts: () => void;
}) {
  const router = useRouter();
  const dark = useDark();
  const shell = { layer: "shell" } as const;
  const go = (href: string) => () => router.push(href);
  useCommand("nav.home", go("/"), shell);
  useCommand("nav.calendar", go("/calendar"), shell);
  useCommand("nav.notes", go("/notes"), shell);
  useCommand("nav.review", go("/review"), shell);
  useCommand("nav.flashcards", go("/flashcards"), shell);
  useCommand("nav.exams", go("/exams"), shell);
  useCommand("nav.documents", go("/documents"), shell);
  useCommand("nav.modules", go("/semesters"), shell);
  useCommand("nav.progress", go("/progress"), shell);
  useCommand("nav.settings", go("/settings"), shell);
  useCommand("nav.claude", go("/settings#claude"), shell);
  useCommand("study.review", go("/review/session"), shell);
  useCommand("new.note", () => onDialog("note"), shell);
  useCommand("new.card", () => onDialog("card"), shell);
  useCommand("new.event", () => onDialog("event"), shell);
  useCommand("new.upload", () => onDialog("upload"), shell);
  useCommand(
    "file.export",
    () => {
      const a = document.createElement("a");
      a.href = "/api/export";
      a.download = "";
      a.click();
    },
    shell,
  );
  useCommand("page.save", () => toast.success("Alles wird automatisch gespeichert."), shell);
  useCommand("view.sidebar", toggleSidebar, { ...shell, checked: sidebarOpen });
  useCommand("view.theme", toggleTheme, { ...shell, checked: dark });
  useCommand("palette.open", togglePalette, shell);
  useCommand("help.shortcuts", toggleShortcuts, shell);
  return null;
}

export function AppShell({
  children,
  dueCount,
  openSummaries,
  userName,
  game,
  desktop = false,
  initialCollapsed = false,
  embedded: embeddedProp = false,
}: {
  children: ReactNode;
  dueCount: number;
  openSummaries: number;
  userName: string;
  game: GameSummary;
  desktop?: boolean;
  /** From the cookie, so the first render already has the right width. */
  initialCollapsed?: boolean;
  /** Shown inside the split pane (iframe): no shell, no tabs. */
  embedded?: boolean;
}) {
  // Decided once: later refreshes inside the pane no longer carry `?embed=1`.
  const [embedded] = useState(embeddedProp);
  if (embedded) {
    return (
      <EmbeddedWorkspace>
        <EmbeddedCommandRuntime skipKey={isShellShortcut} />
        <main className="pane-main w-full px-4 pt-5 pb-10 [--content-h:100dvh] sm:px-6 has-[[data-bleed]]:p-0">{children}</main>
      </EmbeddedWorkspace>
    );
  }
  return (
    <FullShell dueCount={dueCount} openSummaries={openSummaries} userName={userName} game={game} desktop={desktop} initialCollapsed={initialCollapsed}>
      {children}
    </FullShell>
  );
}

function FullShell({
  children,
  dueCount,
  openSummaries,
  userName,
  game,
  desktop,
  initialCollapsed,
}: {
  children: ReactNode;
  dueCount: number;
  openSummaries: number;
  userName: string;
  game: GameSummary;
  desktop: boolean;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
    setCollapsed(next);
  }, [collapsed]);
  const [dialog, setDialog] = useState<QuickDialog>(null);
  // Quick-create dialogs are pre-filled with the module of the focused page.
  const [moduleId, setModuleId] = useState<string | undefined>();
  const openDialog = (d: QuickDialog) => {
    setModuleId(focusedModuleId() ?? pathname.match(/^\/modules\/([a-z0-9]+)/i)?.[1]);
    setDialog(d);
  };
  const [overlay, setOverlay] = useState<{ kind: "palette"; typing: boolean } | { kind: "shortcuts" } | null>(null);
  // Focus mode: while a Pomodoro block runs, only the content (and the timer) stay.
  const zen = useZen();

  return (
    <div className={cn("min-h-dvh transition-[padding] duration-200 print:pl-0", zen ? "lg:pl-0" : collapsed ? "lg:pl-14" : "lg:pl-60")}>
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r bg-sidebar transition-[width] duration-200 print:hidden", !zen && "lg:block", collapsed ? "w-14" : "w-60")}>
        <SidebarContent dueCount={dueCount} openSummaries={openSummaries} userName={userName} desktop={desktop} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl" aria-label="Navigation">
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" onClick={() => setDrawer(false)} aria-label="Menü schließen">
              <X className="size-4" />
            </Button>
            <SidebarContent dueCount={dueCount} openSummaries={openSummaries} userName={userName} desktop={desktop} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background px-3 sm:px-6 print:hidden">
        <Button variant="ghost" size="icon-sm" className={cn("lg:hidden", zen && "hidden")} onClick={() => setDrawer(true)} aria-label="Menü öffnen">
          <Menu className="size-5" />
        </Button>
        <SearchBox />
        <div className="ml-auto flex items-center gap-2">
          <FocusTimer />
          {!zen && <GameIndicator game={game} />}
          {!zen && <QuickCreate onOpen={openDialog} />}
        </div>
        <FocusProgressLine />
      </header>

      <Celebration />
      <CommandRuntime desktop={desktop} />
      {desktop && <FocusTraySync />}
      <ShellCommands
        onDialog={openDialog}
        sidebarOpen={!collapsed}
        toggleSidebar={toggleCollapsed}
        togglePalette={() => setOverlay((o) => (o?.kind === "palette" ? null : { kind: "palette", typing: isTyping(document.activeElement) }))}
        toggleShortcuts={() => setOverlay((o) => (o?.kind === "shortcuts" ? null : { kind: "shortcuts" }))}
      />
      {overlay?.kind === "palette" && <CommandPalette typing={overlay.typing} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setOverlay(null)} />}
      <Workspace>{children}</Workspace>

      <nav className={cn("fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden", zen && "hidden")} aria-label="Schnellnavigation">
        {NAV.map((item) => {
          const { href, label, icon: Icon, badge } = item;
          const active = isActive(pathname, item);
          return (
            <Link key={href} href={href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
              <Icon className="size-5" aria-hidden />
              {label}
              {badge === "due" && dueCount > 0 && (
                <span className="absolute top-1 left-1/2 ml-2 rounded-md bg-primary px-1 text-[0.6rem] text-primary-foreground">{dueCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {dialog === "note" && <NoteCreateDialog open onOpenChange={(o) => !o && setDialog(null)} moduleId={moduleId} />}
      {dialog === "card" && <FlashcardDialog open onOpenChange={(o) => !o && setDialog(null)} defaults={{ moduleId }} />}
      {dialog === "event" && <EventDialog open onOpenChange={(o) => !o && setDialog(null)} initial={defaultEventValues(new Date(), { moduleId: moduleId ?? null })} />}
      {dialog === "upload" && <UploadDialog open onOpenChange={(o) => !o && setDialog(null)} initial={{ moduleId }} />}
    </div>
  );
}

