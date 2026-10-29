/**
 * Markdown task lists ("- [ ] Normalformen") as a checklist: exam topics are
 * ticked off right in the rendered text. Line numbers are 1-based, like the
 * source positions react-markdown reports for list items.
 */

const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s|$)/;
const FENCE = /^\s*(```|~~~)/;

export interface TaskItem {
  line: number;
  done: boolean;
  text: string;
}

export function taskItems(md: string): TaskItem[] {
  const items: TaskItem[] = [];
  let fenced = false;
  md.split("\n").forEach((raw, i) => {
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced) return;
    const m = TASK.exec(raw);
    if (m) items.push({ line: i + 1, done: m[2] !== " ", text: raw.slice(m[0].length).trim() });
  });
  return items;
}

export function taskProgress(md: string) {
  const items = taskItems(md);
  return { done: items.filter((t) => t.done).length, total: items.length };
}

/** Ticks / unticks the task on `line`. Anything else stays byte for byte the same. */
export function toggleTask(md: string, line: number): string {
  if (!taskItems(md).some((t) => t.line === line)) return md;
  const lines = md.split("\n");
  lines[line - 1] = lines[line - 1]!.replace(TASK, (_all, prefix: string, mark: string) => `${prefix}[${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

/** Appends `- [ ] text` as a top-level task right after the last one – or at the end if there is none. */
export function appendTask(md: string, text: string): string {
  const entry = `- [ ] ${text.trim().replace(/\s*\n\s*/g, " ")}`;
  const items = taskItems(md);
  if (items.length === 0) return md.trim() ? `${md.replace(/\s+$/, "")}\n\n${entry}` : entry;
  const lines = md.split("\n");
  const indentOf = (l: string) => /^\s*/.exec(l)![0];
  const indent = items.map((t) => indentOf(lines[t.line - 1]!)).reduce((a, b) => (b.length < a.length ? b : a));
  // Sub-items and continuation lines of the last task stay with it.
  let at = items.at(-1)!.line;
  while (at < lines.length && lines[at]!.trim() && indentOf(lines[at]!).length > indent.length) at++;
  lines.splice(at, 0, `${indent}${entry}`);
  return lines.join("\n");
}
