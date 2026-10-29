import { describe, expect, it } from "vitest";
import {
  EMPTY_WORKSPACE,
  cleanHref,
  closeOthers,
  closeTab,
  closeToRight,
  cycleTab,
  kindOf,
  moveTab,
  navigate,
  parseWorkspace,
  placeTab,
  recentPartner,
  retargetSplit,
  snapRatio,
  swapPanes,
  tabKey,
  withEmbed,
  type Workspace,
} from "@/lib/tabs";

/** Navigates through the hrefs in order, like clicking through the app. */
function visit(...hrefs: (string | [string, { newTab: boolean }])[]) {
  let ws: Workspace = EMPTY_WORKSPACE;
  hrefs.forEach((h, i) => {
    const [href, opts] = Array.isArray(h) ? h : [h, {}];
    ws = navigate(ws, href, "", i + 1, opts);
  });
  return ws;
}
const keys = (ws: Workspace) => ws.tabs.map((t) => t.key);

describe("tab keys", () => {
  it("identifies resources by id and pages by path", () => {
    expect(tabKey("/notes/abc?side=x")).toBe("/notes/abc");
    expect(tabKey("/documents/d1?page=4")).toBe("/documents/d1");
    expect(tabKey("/modules/m1?tab=sessions")).toBe("/modules/m1");
    expect(tabKey("/calendar?view=week")).toBe("/calendar");
    expect(tabKey("/review/session/")).toBe("/review/session");
    expect(kindOf("/notes/abc")).toBe("note");
    expect(kindOf("/documents/d1")).toBe("doc");
    expect(kindOf("/modules/m1")).toBe("module");
    expect(kindOf("/calendar")).toBe("page");
  });

  it("adds and strips the embed marker", () => {
    expect(withEmbed("/notes/a")).toBe("/notes/a?embed=1");
    expect(cleanHref(withEmbed("/documents/d?page=2"))).toBe("/documents/d?page=2");
  });
});

describe("navigation", () => {
  it("plain pages replace each other, resources get their own tab", () => {
    const ws = visit("/", "/calendar", "/modules/m1", "/notes/n1", "/documents/d1");
    expect(keys(ws)).toEqual(["/calendar", "/modules/m1", "/notes/n1", "/documents/d1"]);
    expect(ws.active).toBe("/documents/d1");
  });

  it("a page opened from a resource tab gets a new tab next to it", () => {
    const ws = visit("/notes/n1", "/notes/n2", "/calendar");
    expect(keys(ws)).toEqual(["/notes/n1", "/notes/n2", "/calendar"]);
    const back = navigate(ws, "/notes/n1", "", 10);
    expect(navigate(back, "/review", "", 11).tabs.map((t) => t.key)).toEqual(["/notes/n1", "/review", "/notes/n2", "/calendar"]);
  });

  it("reuses an existing tab and remembers its URL", () => {
    const ws = visit("/notes/n1", "/notes/n2", "/notes/n1?focus=summary");
    expect(keys(ws)).toEqual(["/notes/n1", "/notes/n2"]);
    expect(ws.tabs[0]!.href).toBe("/notes/n1?focus=summary");
  });

  it("newTab forces a tab even for plain pages", () => {
    expect(keys(visit("/", ["/calendar", { newTab: true }]))).toEqual(["/", "/calendar"]);
  });

  it("evicts the least recently used tab beyond the limit, never the visible ones", () => {
    let ws = visit("/notes/a", "/notes/b", "/notes/c");
    ws = { ...ws, split: "/notes/a" };
    ws = navigate(ws, "/notes/d", "", 10, { max: 3 });
    expect(keys(ws)).toEqual(["/notes/a", "/notes/c", "/notes/d"]);
  });
});

describe("closing", () => {
  it("activates the right, then the left neighbour", () => {
    const ws = visit("/notes/a", "/notes/b", "/notes/c");
    const mid = closeTab({ ...ws, active: "/notes/b" }, "/notes/b");
    expect(mid.go).toBe("/notes/c");
    const last = closeTab(ws, "/notes/c");
    expect(last.go).toBe("/notes/b");
    expect(closeTab(visit("/notes/a"), "/notes/a").go).toBe("/");
  });

  it("the split partner takes over when the main tab closes; closing the partner ends the split", () => {
    const ws = { ...visit("/notes/a", "/notes/b", "/notes/c"), split: "/notes/a" };
    const res = closeTab(ws, "/notes/c");
    expect(res.ws).toMatchObject({ active: "/notes/a", split: null });
    expect(res.go).toBe("/notes/a");
    expect(closeTab(ws, "/notes/a")).toMatchObject({ ws: { active: "/notes/c", split: null }, go: null });
  });
});

describe("drag & drop", () => {
  it("reorders", () => {
    const ws = visit("/notes/a", "/notes/b", "/notes/c");
    expect(keys(moveTab(ws, "/notes/c", 0))).toEqual(["/notes/c", "/notes/a", "/notes/b"]);
    expect(moveTab(ws, "/notes/a", 0)).toBe(ws);
  });

  it("dropping right opens the tab beside the main one", () => {
    const ws = visit("/notes/a", "/notes/b");
    expect(placeTab(ws, "/notes/a", "right")).toEqual({ ws: { ...ws, split: "/notes/a" }, go: null });
  });

  it("dropping the main tab right moves the last used other tab to the left", () => {
    const ws = visit("/notes/a", "/documents/d", "/notes/b");
    const res = placeTab(ws, "/notes/b", "right");
    expect(res.ws).toMatchObject({ active: "/documents/d", split: "/notes/b" });
    expect(res.go).toBe("/documents/d");
  });

  it("dropping left makes it the main tab and moves the current one right", () => {
    const ws = visit("/notes/a", "/notes/b");
    const res = placeTab(ws, "/notes/a", "left");
    expect(res.ws).toMatchObject({ active: "/notes/a", split: "/notes/b" });
    expect(res.go).toBe("/notes/a");
  });

  it("swaps panes, also when the split tab is clicked", () => {
    const ws = { ...visit("/notes/a", "/notes/b"), split: "/notes/a" };
    expect(swapPanes(ws).ws).toMatchObject({ active: "/notes/a", split: "/notes/b" });
    expect(navigate(ws, "/notes/a", "", 9)).toMatchObject({ active: "/notes/a", split: "/notes/b" });
  });
});

describe("split pane navigating on its own", () => {
  it("its tab follows, or an existing tab is reused", () => {
    const ws = { ...visit("/notes/a", "/notes/b", "/documents/d"), split: "/notes/b" };
    const moved = retargetSplit(ws, "/notes/x", "X", 20);
    expect(keys(moved)).toEqual(["/notes/a", "/notes/x", "/documents/d"]);
    expect(moved.split).toBe("/notes/x");
    expect(retargetSplit(ws, "/notes/a?focus=summary", "", 21)).toMatchObject({ split: "/notes/a" });
    expect(retargetSplit(ws, "/documents/d", "", 22)).toBe(ws);
  });
});

describe("persistence", () => {
  it("cycles", () => {
    const ws = visit("/notes/a", "/notes/b");
    expect(cycleTab(ws, 1)?.key).toBe("/notes/a");
    expect(cycleTab(EMPTY_WORKSPACE, 1)).toBeNull();
  });

  it("parses stored state defensively", () => {
    expect(parseWorkspace(null)).toEqual(EMPTY_WORKSPACE);
    expect(parseWorkspace("{broken")).toEqual(EMPTY_WORKSPACE);
    const ws = { ...visit("/notes/a", "/notes/b"), split: "/notes/a", ratio: 3 };
    const evil = { key: "/x", href: "https://evil.example", title: "", usedAt: 1 };
    const parsed = parseWorkspace(JSON.stringify({ ...ws, tabs: [...ws.tabs, evil, { key: "/notes/z", href: "/notes/other", title: "", usedAt: 1 }] }));
    expect(keys(parsed)).toEqual(["/notes/a", "/notes/b"]);
    expect(parsed).toMatchObject({ active: "/notes/b", split: "/notes/a", ratio: 0.8 });
  });
});

describe("tab menu actions", () => {
  it("closes the other tabs", () => {
    const ws = { ...visit("/notes/a", "/notes/b", "/notes/c"), split: "/notes/a" };
    const res = closeOthers(ws, "/notes/b");
    expect(keys(res.ws)).toEqual(["/notes/b"]);
    expect(res.ws).toMatchObject({ active: "/notes/b", split: null });
    expect(res.go).toBe("/notes/b");
  });

  it("closes the tabs to the right, keeping visible ones if possible", () => {
    const ws = visit("/notes/a", "/notes/b", "/notes/c");
    const keep = closeToRight({ ...ws, active: "/notes/a", split: "/notes/c" }, "/notes/b");
    expect(keys(keep.ws)).toEqual(["/notes/a", "/notes/b"]);
    expect(keep.ws).toMatchObject({ active: "/notes/a", split: null });
    expect(keep.go).toBeNull();
    const moved = closeToRight(ws, "/notes/a"); // active /notes/c goes
    expect(moved.ws.active).toBe("/notes/a");
    expect(moved.go).toBe("/notes/a");
    expect(closeToRight(ws, "/notes/c").ws).toBe(ws);
  });

  it("picks the last used other tab as split partner", () => {
    const ws = visit("/notes/a", "/notes/b", "/notes/c");
    expect(recentPartner(ws)?.key).toBe("/notes/b");
    expect(recentPartner(visit("/notes/a"))).toBeNull();
  });

  it("snaps the divider to thirds and half", () => {
    expect(snapRatio(0.505)).toBe(0.5);
    expect(snapRatio(0.34)).toBeCloseTo(1 / 3);
    expect(snapRatio(0.45)).toBe(0.45);
    expect(snapRatio(0.95)).toBe(0.8);
  });
});
