import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS, commandMatches, formatShortcut, matchesShortcut, toAccelerator, type Command, type KeyInit } from "@/lib/commands";

const key = (k: Partial<KeyInit>): KeyInit => ({ key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...k });

describe("commands", () => {
  it("have unique ids and shortcuts", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const shortcuts = COMMANDS.flatMap((c: Command) => (c.shortcut ? [c.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("are exactly the web items of the native menu bar – same label, same shortcut", () => {
    const rust = readFileSync(join(import.meta.dirname, "../desktop/src/main.rs"), "utf8");
    const items = [...rust.matchAll(/(?:cmd|check)\(app, r, "([^"]+)", "([^"]+)", (?:None|Some\("((?:[^"\\]|\\.)*)"\))\)/g)].map((m) => ({
      id: m[1]!,
      label: m[2]!,
      accel: m[3]?.replace(/\\\\/g, "\\") ?? null,
    }));
    expect(items.map((i) => i.id).sort()).toEqual(COMMANDS.map((c) => c.id).sort());
    for (const c of COMMANDS as readonly Command[]) {
      const item = items.find((i) => i.id === c.id)!;
      expect(item.label, c.id).toBe(c.label);
      expect(item.accel, c.id).toBe(c.shortcut ? toAccelerator(c.shortcut) : null);
    }
  });

  it("shows shortcuts in Mac notation", () => {
    expect(formatShortcut("mod+alt+l")).toBe("⌥⌘L");
    expect(formatShortcut("mod+shift+enter")).toBe("⇧⌘↩");
    expect(formatShortcut("ctrl+shift+tab")).toBe("⌃⇧⇥");
    expect(toAccelerator("mod+alt+shift+c")).toBe("CmdOrCtrl+Alt+Shift+C");
  });

  it("matches keys independent of the keyboard layout", () => {
    expect(matchesShortcut(key({ key: "1", code: "Digit1", metaKey: true }), "mod+1")).toBe(true);
    expect(matchesShortcut(key({ key: "1", code: "Digit1", metaKey: true, shiftKey: true }), "mod+1")).toBe(false);
    // ⌥ turns letters into special characters on a Mac – the key position counts then.
    expect(matchesShortcut(key({ key: "@", code: "KeyL", metaKey: true, altKey: true }), "mod+alt+l")).toBe(true);
    // QWERTZ: the key labelled Z sits where Y is on US keyboards.
    expect(matchesShortcut(key({ key: "z", code: "KeyY", metaKey: true }), "mod+z")).toBe(true);
    expect(matchesShortcut(key({ key: "y", code: "KeyZ", metaKey: true }), "mod+z")).toBe(false);
    // "/" is ⇧7 on a German keyboard.
    expect(matchesShortcut(key({ key: "/", code: "Digit7", metaKey: true, shiftKey: true }), "mod+/")).toBe(true);
    expect(matchesShortcut(key({ key: "/", code: "Slash", metaKey: true }), "mod+/")).toBe(true);
    expect(matchesShortcut(key({ key: "?", code: "Slash", metaKey: true, shiftKey: true }), "mod+/")).toBe(false);
    expect(matchesShortcut(key({ key: "Tab", code: "Tab", ctrlKey: true }), "ctrl+tab")).toBe(true);
    expect(matchesShortcut(key({ key: "Tab", code: "Tab", metaKey: true }), "ctrl+tab")).toBe(false);
    expect(matchesShortcut(key({ key: "Enter", code: "Enter", metaKey: true, shiftKey: true }), "mod+shift+enter")).toBe(true);
    expect(matchesShortcut(key({ key: "n", code: "KeyN" }), "mod+n")).toBe(false);
  });

  it("finds commands by label, menu and keywords", () => {
    const find = (q: string) => COMMANDS.filter((c) => commandMatches(c, q)).map((c) => c.id);
    expect(find("abfragen")).toContain("note.mode.recall");
    expect(find("lernplan")).toContain("plan.create");
    expect(find("sitzung lesen")).toContain("note.mode.read");
    expect(find("pomodoro")).toEqual(["focus.toggle"]);
  });
});
