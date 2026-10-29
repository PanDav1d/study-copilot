/**
 * Markdown formatting for text areas (⌘B, ⌘I, ⌥⌘C, ⇧⌘L): what to replace and
 * where the selection ends up. Applying it again removes the formatting.
 */

export type FormatKind = "bold" | "italic" | "code" | "task";

export interface FormatEdit {
  /** Replace value[from, to) with `insert` … */
  from: number;
  to: number;
  insert: string;
  /** … then select this range. */
  selStart: number;
  selEnd: number;
}

const MARKS: Record<Exclude<FormatKind, "task">, string> = { bold: "**", italic: "_", code: "`" };
const TASK = /^(\s*)(?:[-*+]\s+)?\[[ xX]\]\s?/;
const BULLET = /^(\s*)[-*+]\s+/;

export function formatEdit(value: string, start: number, end: number, kind: FormatKind): FormatEdit {
  if (kind === "task") return taskEdit(value, start, end);
  const selected = value.slice(start, end);
  // Several lines of code become a code block.
  if (kind === "code" && selected.includes("\n")) {
    const fenced = /^```[^\n]*\n([\s\S]*)\n```$/.exec(selected);
    const insert = fenced ? fenced[1]! : `\`\`\`\n${selected}\n\`\`\``;
    return { from: start, to: end, insert, selStart: start, selEnd: start + insert.length };
  }
  const m = MARKS[kind];
  // Already wrapped – around the selection or inside it: unwrap.
  if (value.slice(start - m.length, start) === m && value.slice(end, end + m.length) === m && !(kind === "italic" && value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**")) {
    return { from: start - m.length, to: end + m.length, insert: selected, selStart: start - m.length, selEnd: end - m.length };
  }
  if (selected.length >= 2 * m.length && selected.startsWith(m) && selected.endsWith(m)) {
    const inner = selected.slice(m.length, -m.length);
    return { from: start, to: end, insert: inner, selStart: start, selEnd: start + inner.length };
  }
  // Spaces at the edges stay outside ("**word** " instead of "**word **").
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const core = selected.trim();
  const insert = `${selected.slice(0, lead)}${m}${core}${m}${selected.slice(selected.length - trail)}`;
  const selStart = start + lead + m.length;
  return { from: start, to: end, insert, selStart, selEnd: selStart + core.length };
}

/** Every touched line becomes a task (bullets are kept, headings skipped) – or, if all already are, a plain line again. */
function taskEdit(value: string, start: number, end: number): FormatEdit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split("\n");
  // Empty lines and headings stay as they are.
  const skip = (l: string) => !l.trim() || /^\s*#/.test(l);
  const allTasks = lines.every((l) => skip(l) || TASK.test(l));
  const out = lines.map((l) => {
    if (skip(l)) return l;
    if (allTasks) return l.replace(TASK, "$1");
    if (TASK.test(l)) return l;
    const bullet = BULLET.exec(l);
    return bullet ? `${bullet[1]}- [ ] ${l.slice(bullet[0].length)}` : `${/^\s*/.exec(l)![0]}- [ ] ${l.trimStart()}`;
  });
  const insert = out.join("\n");
  // A single empty line: put the cursor behind the new box.
  const caret = lines.length === 1 ? from + insert.length : null;
  return { from, to, insert, selStart: caret ?? from, selEnd: caret ?? from + insert.length };
}
