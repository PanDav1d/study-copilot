/**
 * App commands – one list for the native menu bar of the desktop app
 * (desktop/src/main.rs uses the same ids and shortcuts, tests/commands.test.ts
 * keeps both in sync), the keyboard shortcuts, the command palette (⇧⌘P) and
 * the shortcut overview (⌘/).
 *
 * Scope "pane" commands act on the page in the focused pane (in split view
 * that may be the right one); "shell" commands act on the app itself.
 */

export type MenuName = "app" | "file" | "edit" | "view" | "note" | "go" | "study" | "window" | "help";
export type CommandScope = "pane" | "shell";

export interface Command {
  id: string;
  label: string;
  menu: MenuName;
  scope: CommandScope;
  /** e.g. "mod+shift+n" – mod = ⌘ (Ctrl elsewhere), ctrl = the Control key itself. */
  shortcut?: string;
  /** The key is handled by an older handler (workspace, PDF viewer …); the command only serves menu and palette. */
  keysElsewhere?: boolean;
  /** Extra search words for the palette. */
  keywords?: string;
  /** Where it works, for the "not here" hint – e.g. "in einer Sitzung". */
  where?: string;
}

export const MENU_LABELS: Record<MenuName, string> = {
  app: "Study Copilot",
  file: "Ablage",
  edit: "Bearbeiten",
  view: "Darstellung",
  note: "Sitzung",
  go: "Gehe zu",
  study: "Lernen",
  window: "Fenster",
  help: "Hilfe",
};

const SESSION = "in einer Sitzung";

export const COMMANDS = [
  { id: "nav.settings", label: "Einstellungen …", menu: "app", scope: "shell", shortcut: "mod+,", keywords: "optionen fsrs export passwort" },
  { id: "nav.claude", label: "Claude verbinden …", menu: "app", scope: "shell", keywords: "mcp ki ai" },

  { id: "new.note", label: "Neue Sitzung …", menu: "file", scope: "shell", shortcut: "mod+n", keywords: "mitschrift cornell notiz" },
  { id: "new.card", label: "Neue Karteikarte …", menu: "file", scope: "pane", shortcut: "mod+shift+n", keywords: "flashcard" },
  { id: "new.event", label: "Neuer Termin …", menu: "file", scope: "shell", shortcut: "mod+alt+n", keywords: "kalender lerneinheit vorlesung" },
  { id: "new.upload", label: "PDF hochladen …", menu: "file", scope: "shell", shortcut: "mod+u", keywords: "unterlage datei import" },
  { id: "tab.open", label: "Öffnen …", menu: "file", scope: "shell", shortcut: "mod+o", keysElsewhere: true, keywords: "tab sitzung unterlage fach" },
  { id: "tab.openBeside", label: "Daneben öffnen …", menu: "file", scope: "shell", shortcut: "mod+alt+o", keywords: "split geteilt rechts" },
  { id: "tab.close", label: "Tab schließen", menu: "file", scope: "shell", shortcut: "mod+w" },
  { id: "tab.reopen", label: "Geschlossenen Tab wieder öffnen", menu: "file", scope: "shell", shortcut: "mod+shift+t" },
  { id: "page.save", label: "Sichern", menu: "file", scope: "pane", shortcut: "mod+s", keywords: "speichern" },
  { id: "file.export", label: "Alle Daten exportieren …", menu: "file", scope: "shell", keywords: "backup json sicherung" },

  { id: "edit.find", label: "Suchen …", menu: "edit", scope: "pane", shortcut: "mod+f", keysElsewhere: true, keywords: "finden pdf" },
  { id: "search.focus", label: "Überall suchen …", menu: "edit", scope: "shell", shortcut: "mod+k", keywords: "suche global" },
  { id: "format.bold", label: "Fett", menu: "edit", scope: "pane", shortcut: "mod+b", keywords: "markdown format" },
  { id: "format.italic", label: "Kursiv", menu: "edit", scope: "pane", shortcut: "mod+i", keywords: "markdown format" },
  { id: "format.code", label: "Code", menu: "edit", scope: "pane", shortcut: "mod+alt+c", keywords: "markdown format monospace" },
  { id: "format.task", label: "Als Checkliste", menu: "edit", scope: "pane", shortcut: "mod+shift+l", keywords: "markdown aufgabe abhaken liste" },

  { id: "view.sidebar", label: "Seitenleiste", menu: "view", scope: "shell", shortcut: "mod+\\", keywords: "navigation einblenden ausblenden" },
  { id: "view.split", label: "Geteilte Ansicht", menu: "view", scope: "shell", shortcut: "mod+shift+\\", keysElsewhere: true, keywords: "split nebeneinander" },
  { id: "view.swap", label: "Seiten tauschen", menu: "view", scope: "shell", keywords: "split links rechts" },
  { id: "view.focusLeft", label: "Linke Seite", menu: "view", scope: "shell", shortcut: "mod+alt+arrowleft", keysElsewhere: true, keywords: "split fokus" },
  { id: "view.focusRight", label: "Rechte Seite", menu: "view", scope: "shell", shortcut: "mod+alt+arrowright", keysElsewhere: true, keywords: "split fokus" },
  { id: "view.theme", label: "Dunkles Design", menu: "view", scope: "shell", shortcut: "mod+shift+d", keywords: "dark mode hell dunkel" },

  { id: "note.mode.edit", label: "Schreiben", menu: "note", scope: "pane", shortcut: "mod+1", where: SESSION, keywords: "modus bearbeiten mitschreiben" },
  { id: "note.mode.read", label: "Lesen", menu: "note", scope: "pane", shortcut: "mod+2", where: SESSION, keywords: "modus ansicht" },
  { id: "note.mode.recall", label: "Abfragen", menu: "note", scope: "pane", shortcut: "mod+3", where: SESSION, keywords: "modus recite selbsttest verdecken" },
  { id: "note.toggleEdit", label: "Schreiben / Lesen umschalten", menu: "note", scope: "pane", shortcut: "mod+e", where: "in einer Sitzung oder Notiz", keywords: "bearbeiten" },
  { id: "note.next", label: "Nächster Schritt", menu: "note", scope: "pane", shortcut: "mod+shift+enter", where: SESSION, keywords: "5r cornell weiter" },
  { id: "note.summary", label: "Zusammenfassung schreiben", menu: "note", scope: "pane", where: SESSION, keywords: "reflect" },
  { id: "note.cards", label: "Karteikarten aus Zeilen …", menu: "note", scope: "pane", shortcut: "mod+shift+k", where: SESSION, keywords: "flashcards erstellen" },
  { id: "note.insertLink", label: "PDF-Link einfügen …", menu: "note", scope: "pane", shortcut: "mod+alt+k", where: "beim Schreiben einer Sitzung", keywords: "seite verweis" },
  { id: "note.linkDoc", label: "Unterlage verknüpfen …", menu: "note", scope: "pane", where: SESSION, keywords: "pdf" },
  { id: "note.copyMarkdown", label: "Als Markdown kopieren", menu: "note", scope: "pane", shortcut: "mod+alt+shift+c", where: SESSION, keywords: "export teilen chatgpt claude" },
  { id: "note.delete", label: "Sitzung löschen …", menu: "note", scope: "pane", where: SESSION },

  { id: "nav.back", label: "Zurück", menu: "go", scope: "pane", shortcut: "mod+[" },
  { id: "nav.forward", label: "Vor", menu: "go", scope: "pane", shortcut: "mod+]" },
  { id: "nav.home", label: "Übersicht", menu: "go", scope: "shell", shortcut: "mod+alt+1", keywords: "dashboard start" },
  { id: "nav.calendar", label: "Kalender", menu: "go", scope: "shell", shortcut: "mod+alt+2", keywords: "termine woche" },
  { id: "nav.notes", label: "Sitzungen", menu: "go", scope: "shell", shortcut: "mod+alt+3", keywords: "mitschriften" },
  { id: "nav.review", label: "Lernbereich", menu: "go", scope: "shell", shortcut: "mod+alt+4", keywords: "lernen" },
  { id: "nav.flashcards", label: "Karteikarten", menu: "go", scope: "shell", shortcut: "mod+alt+5" },
  { id: "nav.exams", label: "Probeklausuren", menu: "go", scope: "shell", shortcut: "mod+alt+6" },
  { id: "nav.documents", label: "Unterlagen", menu: "go", scope: "shell", shortcut: "mod+alt+7", keywords: "pdf" },
  { id: "nav.modules", label: "Module", menu: "go", scope: "shell", shortcut: "mod+alt+8", keywords: "semester fächer" },
  { id: "nav.progress", label: "Fortschritt", menu: "go", scope: "shell", shortcut: "mod+alt+9", keywords: "xp level erfolge" },

  { id: "study.review", label: "Fällige Karten lernen", menu: "study", scope: "shell", shortcut: "mod+l", keywords: "fsrs wiederholen lernsitzung" },
  { id: "study.cram", label: "Prüfungsmodus für dieses Modul", menu: "study", scope: "shell", where: "in einem Modul, einer Sitzung oder Unterlage", keywords: "cram alle karten" },
  { id: "plan.create", label: "Lernplan erstellen …", menu: "study", scope: "shell", shortcut: "mod+alt+l", keywords: "klausurenphase planen kalender woche" },
  { id: "focus.toggle", label: "Fokus-Timer starten / pausieren", menu: "study", scope: "shell", shortcut: "mod+alt+p", keywords: "pomodoro konzentration" },
  { id: "exam.new", label: "Probeklausur erstellen …", menu: "study", scope: "shell", keywords: "prüfung test" },

  { id: "tab.next", label: "Nächster Tab", menu: "window", scope: "shell", shortcut: "ctrl+tab", keysElsewhere: true },
  { id: "tab.prev", label: "Vorheriger Tab", menu: "window", scope: "shell", shortcut: "ctrl+shift+tab", keysElsewhere: true },

  { id: "palette.open", label: "Befehle …", menu: "help", scope: "shell", shortcut: "mod+shift+p", keywords: "palette aktion" },
  { id: "help.shortcuts", label: "Tastenkürzel", menu: "help", scope: "shell", shortcut: "mod+/", keywords: "hilfe shortcuts tasten" },
] as const satisfies readonly Command[];

export type CommandId = (typeof COMMANDS)[number]["id"];

const BY_ID = new Map<string, Command>(COMMANDS.map((c) => [c.id, c]));

export function commandById(id: string): Command | undefined {
  return BY_ID.get(id);
}

export function isCommandId(id: unknown): id is CommandId {
  return typeof id === "string" && BY_ID.has(id);
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

export interface KeyInit {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

interface Parsed {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export function parseShortcut(spec: string): Parsed {
  const parts = spec.split("+");
  // "mod++" would end in an empty part; no shortcut uses "+" as key.
  const key = parts.pop()!.toLowerCase();
  const has = (m: string) => parts.includes(m);
  return { mod: has("mod"), ctrl: has("ctrl"), shift: has("shift"), alt: has("alt"), key };
}

/** Keys whose position differs per layout: matched by the US key code as well as by character. */
const CODES: Record<string, string> = { "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", ",": "Comma", "/": "Slash", ".": "Period" };

/** Does the key event match the shortcut? ⌥ changes the character on a Mac, so letters and digits are also matched by code. */
export function matchesShortcut(e: KeyInit, spec: string): boolean {
  const s = parseShortcut(spec);
  if (s.ctrl) {
    if (!e.ctrlKey || e.metaKey) return false;
  } else if (s.mod) {
    if (!(e.metaKey || e.ctrlKey)) return false;
  } else if (e.metaKey || e.ctrlKey) return false;
  if (e.altKey !== s.alt) return false;
  const k = s.key;
  if (/^[a-z]$/.test(k)) {
    if (e.shiftKey !== s.shift) return false;
    // The character decides (QWERTZ: Z and Y swap places); with ⌥ it is a special character, then the key position does.
    const typed = e.key.toLowerCase();
    return /^[a-z]$/.test(typed) ? typed === k : e.code === `Key${k.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(k)) return e.shiftKey === s.shift && e.code === `Digit${k}`;
  if (k in CODES) {
    // Symbols need ⇧ on some layouts (e.g. "/" = ⇧7 on a German keyboard) – shift only counts if the shortcut asks for it.
    if (s.shift && !e.shiftKey) return false;
    if (e.code === CODES[k]) return s.shift === e.shiftKey;
    return e.key === k;
  }
  return e.shiftKey === s.shift && e.key.toLowerCase() === k;
}

const GLYPHS: Record<string, string> = { enter: "↩", tab: "⇥", backspace: "⌫", escape: "⎋", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", " ": "Leertaste" };

/** Mac notation in the usual order ⌃⌥⇧⌘, e.g. "⌥⌘L". */
export function formatShortcut(spec: string): string {
  const s = parseShortcut(spec);
  const key = GLYPHS[s.key] ?? s.key.toUpperCase();
  return `${s.ctrl ? "⌃" : ""}${s.alt ? "⌥" : ""}${s.shift ? "⇧" : ""}${s.mod ? "⌘" : ""}${key}`;
}

/** Same shortcut as a Tauri / muda accelerator, e.g. "CmdOrCtrl+Alt+L". */
export function toAccelerator(spec: string): string {
  const s = parseShortcut(spec);
  const names: Record<string, string> = { enter: "Enter", tab: "Tab", arrowleft: "Left", arrowright: "Right", arrowup: "Up", arrowdown: "Down", "[": "[", "]": "]", "\\": "\\", ",": ",", "/": "/", ".": "." };
  const key = names[s.key] ?? s.key.toUpperCase();
  return [s.ctrl && "Ctrl", s.mod && "CmdOrCtrl", s.alt && "Alt", s.shift && "Shift", key].filter(Boolean).join("+");
}

/** Palette search: every word must appear in label, menu name or keywords. */
export function commandMatches(cmd: Command, query: string) {
  const hay = `${cmd.label} ${MENU_LABELS[cmd.menu]} ${"keywords" in cmd ? (cmd.keywords ?? "") : ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
