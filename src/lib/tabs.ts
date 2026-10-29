/**
 * Workspace tabs: everything opens in a tab – pages, modules, sessions and
 * documents – and any two tabs can be placed side by side.
 *
 * A tab is identified by its *key* (the resource: `/notes/<id>`, `/documents/<id>`,
 * `/modules/<id>`, otherwise the pathname) and remembers the full URL it was last on.
 * Navigation decides where a page lands:
 *   - a tab with the same key exists → that tab is activated,
 *   - sessions, documents and modules ("resources") always get their own tab,
 *   - plain pages (overview, calendar, …) replace the active tab if that is a
 *     plain page too – so clicking through the app does not pile up tabs.
 *
 * Only the active tab (and the split partner) is ever rendered; the others are
 * just these few fields. Pure functions, no DOM – see components/shell/workspace.tsx.
 */

export type TabKind = "note" | "doc" | "module" | "page";

export interface Tab {
  key: string;
  /** Last URL of this tab (path + query). */
  href: string;
  /** Fallback label (document title) – live labels come from the study data. */
  title: string;
  usedAt: number;
}

export interface Workspace {
  tabs: Tab[];
  /** Tab in the main (left) pane. */
  active: string | null;
  /** Tab shown to the right of it, or null. */
  split: string | null;
  /** Width share of the left pane, 0.2–0.8. */
  ratio: number;
}

export const EMPTY_WORKSPACE: Workspace = { tabs: [], active: null, split: null, ratio: 0.5 };
export const MAX_TABS = 12;

const RESOURCE = /^\/(notes|documents|modules)\/([a-z0-9]{1,64})(?:\/|$)/i;

export function pathOf(href: string) {
  const p = href.split(/[?#]/, 1)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function tabKey(href: string) {
  const path = pathOf(href);
  const m = path.match(RESOURCE);
  return m ? `/${m[1]!.toLowerCase()}/${m[2]}` : path;
}

export function kindOf(key: string): TabKind {
  const m = key.match(RESOURCE);
  if (!m) return "page";
  return m[1] === "notes" ? "note" : m[1] === "documents" ? "doc" : "module";
}

export function idOf(key: string) {
  return key.match(RESOURCE)?.[2] ?? null;
}

/** Removes the embed marker used by the split pane. */
export function cleanHref(href: string) {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("embed");
  const q = params.toString();
  return `${path}${q ? `?${q}` : ""}`;
}

export function withEmbed(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}embed=1`;
}

function clampRatio(r: number) {
  return Math.min(0.8, Math.max(0.2, r));
}

/** Drops the least recently used tabs beyond the limit – never the visible ones. */
function evict(ws: Workspace, max: number): Workspace {
  let tabs = ws.tabs;
  while (tabs.length > max) {
    const candidates = tabs.filter((t) => t.key !== ws.active && t.key !== ws.split);
    if (!candidates.length) break;
    const victim = candidates.reduce((a, b) => (b.usedAt < a.usedAt ? b : a));
    tabs = tabs.filter((t) => t !== victim);
  }
  return tabs === ws.tabs ? ws : { ...ws, tabs };
}

/**
 * The app navigated to `href` in the main pane. `newTab` forces a new tab
 * (the "+" picker), otherwise the rules above apply.
 */
export function navigate(ws: Workspace, href: string, title: string, now: number, opts: { newTab?: boolean; max?: number } = {}): Workspace {
  const key = tabKey(href);
  const existing = ws.tabs.find((t) => t.key === key);
  if (existing) {
    const tabs = ws.tabs.map((t) => (t.key === key ? { ...t, href, title: title || t.title, usedAt: now } : t));
    // Showing the split partner on the left: the panes swap.
    const split = ws.split === key ? (ws.active !== key ? ws.active : null) : ws.split;
    return { ...ws, tabs, active: key, split };
  }
  const tab: Tab = { key, href, title, usedAt: now };
  const at = ws.tabs.findIndex((t) => t.key === ws.active);
  const replace = !opts.newTab && at >= 0 && kindOf(key) === "page" && kindOf(ws.active!) === "page";
  const tabs = replace
    ? ws.tabs.map((t, i) => (i === at ? tab : t))
    : at >= 0
      ? [...ws.tabs.slice(0, at + 1), tab, ...ws.tabs.slice(at + 1)]
      : [...ws.tabs, tab];
  return evict({ ...ws, tabs, active: key }, opts.max ?? MAX_TABS);
}

/** Closes a tab. `go` is the URL the main pane has to show afterwards (if it changes). */
export function closeTab(ws: Workspace, key: string): { ws: Workspace; go: string | null } {
  const i = ws.tabs.findIndex((t) => t.key === key);
  if (i < 0) return { ws, go: null };
  const tabs = ws.tabs.filter((t) => t.key !== key);
  if (key === ws.split) return { ws: { ...ws, tabs, split: null }, go: null };
  if (key !== ws.active) return { ws: { ...ws, tabs }, go: null };
  // The split partner takes over the main pane; otherwise the right, then the left neighbour.
  const next = ws.split ? tabs.find((t) => t.key === ws.split)! : (ws.tabs[i + 1] ?? ws.tabs[i - 1] ?? null);
  return { ws: { ...ws, tabs, active: next?.key ?? null, split: null }, go: next?.href ?? "/" };
}

/** Closes every tab except `key`; that tab ends up alone in the main pane. */
export function closeOthers(ws: Workspace, key: string): { ws: Workspace; go: string | null } {
  const tab = ws.tabs.find((t) => t.key === key);
  if (!tab) return { ws, go: null };
  return { ws: { ...ws, tabs: [tab], active: key, split: null }, go: key === ws.active ? null : tab.href };
}

/** Closes the tabs to the right of `key`. If a visible tab goes, `key` takes the main pane. */
export function closeToRight(ws: Workspace, key: string): { ws: Workspace; go: string | null } {
  const i = ws.tabs.findIndex((t) => t.key === key);
  if (i < 0 || i === ws.tabs.length - 1) return { ws, go: null };
  const tabs = ws.tabs.slice(0, i + 1);
  const keeps = (k: string | null) => k !== null && tabs.some((t) => t.key === k);
  if (keeps(ws.active)) return { ws: { ...ws, tabs, split: keeps(ws.split) ? ws.split : null }, go: null };
  const split = keeps(ws.split) && ws.split !== key ? ws.split : null;
  return { ws: { ...ws, tabs, active: key, split }, go: tabs[i]!.href };
}

/** The tab to show beside the main one when the split is toggled on: the last used other tab. */
export function recentPartner(ws: Workspace): Tab | null {
  return ws.tabs.filter((t) => t.key !== ws.active).reduce<Tab | null>((a, b) => (!a || b.usedAt > a.usedAt ? b : a), null);
}

/** Split ratio while dragging the divider: snaps to ⅓, ½, ⅔ when close. */
export function snapRatio(r: number, threshold = 0.015) {
  for (const s of [1 / 3, 0.5, 2 / 3]) if (Math.abs(r - s) < threshold) return s;
  return clampRatio(r);
}

/** Drag & drop in the tab strip: moves `key` to position `index` (of the list without it). */
export function moveTab(ws: Workspace, key: string, index: number): Workspace {
  const tab = ws.tabs.find((t) => t.key === key);
  if (!tab) return ws;
  const rest = ws.tabs.filter((t) => t.key !== key);
  const at = Math.max(0, Math.min(rest.length, index));
  const tabs = [...rest.slice(0, at), tab, ...rest.slice(at)];
  return tabs.every((t, i) => t === ws.tabs[i]) ? ws : { ...ws, tabs };
}

/**
 * Places a tab next to the main pane. On the right it becomes the split
 * partner; on the left it becomes the main tab and the current one moves right.
 * Returns the URL the main pane must navigate to, if any.
 */
export function placeTab(ws: Workspace, key: string, side: "left" | "right"): { ws: Workspace; go: string | null } {
  const tab = ws.tabs.find((t) => t.key === key);
  if (!tab) return { ws, go: null };
  if (side === "right") {
    if (key === ws.split) return { ws, go: null };
    if (key !== ws.active) return { ws: { ...ws, split: key }, go: null };
    // Dragging the main tab to the right: the previously used other tab fills the left.
    const other = ws.tabs.filter((t) => t.key !== key).reduce<Tab | null>((a, b) => (!a || b.usedAt > a.usedAt ? b : a), null);
    if (!other) return { ws, go: null };
    return { ws: { ...ws, active: other.key, split: key }, go: other.href };
  }
  if (key === ws.active) return { ws, go: null };
  const split = ws.active && ws.active !== key ? ws.active : ws.split === key ? null : ws.split;
  return { ws: { ...ws, active: key, split }, go: tab.href };
}

export function swapPanes(ws: Workspace): { ws: Workspace; go: string | null } {
  if (!ws.split || !ws.active) return { ws, go: null };
  const right = ws.tabs.find((t) => t.key === ws.split);
  return right ? { ws: { ...ws, active: right.key, split: ws.active }, go: right.href } : { ws, go: null };
}

export function closeSplit(ws: Workspace): Workspace {
  return ws.split ? { ...ws, split: null } : ws;
}

export function setRatio(ws: Workspace, ratio: number): Workspace {
  const r = clampRatio(ratio);
  return r === ws.ratio ? ws : { ...ws, ratio: r };
}

/**
 * The split pane navigated on its own (a link inside it). Its tab follows; if
 * it now shows a resource that already has a tab, that tab is reused.
 */
export function retargetSplit(ws: Workspace, href: string, title: string, now: number): Workspace {
  if (!ws.split) return ws;
  const key = tabKey(href);
  if (key === ws.split) {
    const tabs = ws.tabs.map((t) => (t.key === key ? { ...t, href, title: title || t.title, usedAt: now } : t));
    return { ...ws, tabs };
  }
  if (key === ws.active) return ws; // same page on both sides – leave the tab as it was
  const updated: Tab = { key, href, title, usedAt: now };
  const tabs = ws.tabs.some((t) => t.key === key)
    ? ws.tabs.map((t) => (t.key === key ? updated : t))
    : ws.tabs.map((t) => (t.key === ws.split ? updated : t));
  return { ...ws, tabs, split: key };
}

/** Ctrl+Tab / Ctrl+Shift+Tab, wrapping around. */
export function cycleTab(ws: Workspace, step: 1 | -1): Tab | null {
  const { tabs } = ws;
  if (!tabs.length) return null;
  const i = tabs.findIndex((t) => t.key === ws.active);
  return tabs[(i < 0 ? 0 : i + step + tabs.length) % tabs.length]!;
}

/** Defensive parse of what was stored in localStorage. */
export function parseWorkspace(raw: string | null): Workspace {
  if (!raw) return EMPTY_WORKSPACE;
  try {
    const data = JSON.parse(raw) as Partial<Workspace> | null;
    if (!data || !Array.isArray(data.tabs)) return EMPTY_WORKSPACE;
    const seen = new Set<string>();
    const tabs = data.tabs
      .filter((t): t is Tab => {
        if (!t || typeof t.key !== "string" || typeof t.href !== "string" || typeof t.title !== "string" || typeof t.usedAt !== "number") return false;
        // Only in-app paths, and the href has to belong to its key.
        if (!t.href.startsWith("/") || t.href.startsWith("//") || tabKey(t.href) !== t.key || seen.has(t.key)) return false;
        seen.add(t.key);
        return true;
      })
      .slice(0, MAX_TABS);
    const has = (k: unknown): k is string => typeof k === "string" && seen.has(k);
    const active = has(data.active) ? data.active : null;
    const split = has(data.split) && data.split !== active ? data.split : null;
    return { tabs, active, split, ratio: clampRatio(typeof data.ratio === "number" ? data.ratio : 0.5) };
  } catch {
    return EMPTY_WORKSPACE;
  }
}
