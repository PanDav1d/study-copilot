"use client";

import { useState } from "react";
import { Command as CommandIcon, CornerDownLeft } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Kbd } from "@/components/ui/misc";
import { COMMANDS, MENU_LABELS, commandMatches, formatShortcut, type Command, type CommandId, type MenuName } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { FormatKind } from "@/lib/format";
import { applyFormat, commandState, runCommand, useCommandsVersion } from "./commands";

const MENU_ORDER: MenuName[] = ["note", "file", "edit", "go", "study", "view", "window", "app", "help"];
const FORMAT = /^format\./;

/** Keyboard shortcut as key caps: "⌥⌘L" → ⌥ ⌘ L. */
export function Keys({ spec, className }: { spec: string; className?: string }) {
  const text = formatShortcut(spec);
  const caps = text.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? [text];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {caps.map((c, i) => <Kbd key={i}>{c}</Kbd>)}
    </span>
  );
}

/** ⇧⌘P: every command the app has, searchable – only what works right now. */
export function CommandPalette({ onClose, typing }: { onClose: () => void; typing: boolean }) {
  // Availability is read live; this re-renders whenever it changes.
  useCommandsVersion();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  // Formatting: offered when a text area had the focus – the palette's own input has it now.
  const usable = COMMANDS.filter((c: Command) => c.id !== "palette.open" && (FORMAT.test(c.id) ? typing : commandState(c.id).available) && commandMatches(c, q));
  const groups = MENU_ORDER.map((menu) => ({ menu, items: usable.filter((c) => c.menu === menu) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // After the dialog gave the focus back – formatting needs the text area to be focused again.
    setTimeout(() => (FORMAT.test(c.id) ? applyFormat(c.id.slice("format.".length) as FormatKind) : runCommand(c.id as CommandId)), 60);
  };

  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={<span className="inline-flex items-center gap-2"><CommandIcon className="size-4" /> Befehle</span>}
      description={<span><Kbd>↑</Kbd> <Kbd>↓</Kbd> auswählen · <Kbd>↵</Kbd> ausführen · alles auch in der Menüleiste</span>}
    >
      <Input
        autoFocus
        placeholder="Was möchtest du tun? z. B. „abfragen“, „lernplan“, „pdf“ …"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(flat.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(flat[sel]);
          }
        }}
        className="mb-3"
      />
      <div className="max-h-[55dvh] overflow-y-auto" role="listbox" aria-label="Befehle">
        {flat.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Kein passender Befehl.</p>}
        {groups.map((g) => (
          <div key={g.menu} className="mb-2">
            <p className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{MENU_LABELS[g.menu]}</p>
            {g.items.map((c) => {
              const i = flat.indexOf(c);
              const checked = commandState(c.id).checked;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(c)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", i === sel && "bg-muted")}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c.label}
                    {checked && <span className="ml-2 text-xs text-muted-foreground">· an</span>}
                  </span>
                  {"shortcut" in c && c.shortcut && <Keys spec={c.shortcut} />}
                  {i === sel && <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** Keys handled by the pages themselves (not menu commands). */
const PAGE_KEYS: { title: string; keys: [string, string][] }[] = [
  {
    title: "In der Mitschrift",
    keys: [
      ["↩", "Vom Stichwort in die Notizen"],
      ["⌘↩", "Neue Zeile darunter"],
      ["⌫", "Leere Zeile löschen"],
      ["⇥", "Einrücken"],
      ["⌘V", "Screenshot einfügen"],
    ],
  },
  {
    title: "Beim Lernen",
    keys: [
      ["Leertaste", "Aufdecken"],
      ["1–4", "Bewerten (Nochmal … Einfach)"],
      ["⌘↩", "Aufdecken beim Tippen"],
      ["⌘Z", "Letzte Bewertung zurück"],
    ],
  },
  {
    title: "Im PDF",
    keys: [
      ["← →", "Seite zurück / vor"],
      ["G", "Zu Seite …"],
      ["A", "Ausschnitt aufziehen"],
      ["R", "Drehen"],
      ["⌘F · ⌘G", "Suchen · nächster Treffer"],
      ["⌘+ ⌘− ⌘0", "Zoom · Seitenbreite"],
    ],
  },
];

/** ⌘/ or "?": all shortcuts at a glance, grouped like the menu bar. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const groups = MENU_ORDER.map((menu) => ({ menu, items: COMMANDS.filter((c: Command) => c.menu === menu && "shortcut" in c && c.shortcut) })).filter((g) => g.items.length);
  return (
    <Dialog open onOpenChange={onClose} size="xl" title="Tastenkürzel" description={<span>Alle Befehle findest du auch in der Menüleiste und mit <Kbd>⇧⌘P</Kbd>.</span>}>
      <div className="columns-1 gap-8 sm:columns-2 lg:columns-3">
        {groups.map((g) => (
          <section key={g.menu} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{MENU_LABELS[g.menu]}</h3>
            <ul className="space-y-1">
              {g.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{c.label.replace(/ …$/, "")}</span>
                  <Keys spec={"shortcut" in c ? c.shortcut! : ""} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {PAGE_KEYS.map((g) => (
          <section key={g.title} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</h3>
            <ul className="space-y-1">
              {g.keys.map(([k, label]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{label}</span>
                  <span className="shrink-0 whitespace-nowrap"><Kbd>{k}</Kbd></span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
