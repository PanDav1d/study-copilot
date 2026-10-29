"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, Layers, MoreHorizontal, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Kbd } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { emptyRow, type CornellRow } from "@/lib/cornell";
import { cn } from "@/lib/utils";
import { AutoTextarea } from "./auto-textarea";

export type SheetMode = "edit" | "read" | "recall";

/** Grid shared by header and rows: cue column ⅓, notes column ⅔. */
const GRID = "grid @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]";

/** Keeps exactly one empty row at the end while editing, so typing never needs an extra click. */
export function withTrailingRow(rows: CornellRow[]) {
  const last = rows[rows.length - 1];
  return !last || last.cue.trim() || last.content.trim() ? [...rows, emptyRow()] : rows;
}

function ColumnHeader() {
  return (
    <div className={cn(GRID, "hidden border-b text-xs font-semibold tracking-wide text-muted-foreground uppercase @xl:grid")}>
      <div className="border-r bg-cornell-cue px-4 py-2 @md:px-5">Stichwörter &amp; Fragen</div>
      <div className="px-4 py-2 @md:px-5">Notizen</div>
    </div>
  );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase @xl:hidden">{children}</p>;
}

/**
 * The Cornell sheet as a two-column table. Each row pairs a cue (keyword or
 * question) with the notes that answer it – which is exactly what recall mode
 * and the flashcard conversion work on.
 */
export function CornellSheet({
  rows,
  mode,
  onChange,
  onFocusContent,
  onMakeCard,
  cardFronts,
  onRecallComplete,
}: {
  rows: CornellRow[];
  mode: SheetMode;
  onChange: (rows: CornellRow[]) => void;
  /** Reports the textarea that last had focus (for inserting PDF links). */
  onFocusContent: (el: HTMLTextAreaElement) => void;
  onMakeCard: (row: CornellRow) => void;
  /** Normalised fronts of existing cards – rows already turned into a card get a marker. */
  cardFronts: Set<string>;
  /** Called once all quizzable rows were answered in recall mode. */
  onRecallComplete?: (result: { known: CornellRow[]; unknown: CornellRow[] }) => void;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = useRef<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [assessed, setAssessed] = useState<Record<string, boolean>>({});

  // Move focus after rows were added/removed (set by the keyboard handlers).
  useEffect(() => {
    if (!focusNext.current) return;
    const el = refs.current.get(focusNext.current);
    focusNext.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const setRef = (key: string) => (el: HTMLTextAreaElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  const update = (id: string, patch: Partial<CornellRow>) =>
    onChange(withTrailingRow(rows.map((r) => (r.id === id ? { ...r, ...patch } : r))));

  const insertAfter = (index: number) => {
    const row = emptyRow();
    focusNext.current = `${row.id}:cue`;
    onChange([...rows.slice(0, index + 1), row, ...rows.slice(index + 1)]);
  };

  const remove = (index: number) => {
    const prev = rows[index - 1];
    if (prev) focusNext.current = `${prev.id}:content`;
    onChange(withTrailingRow(rows.filter((_, i) => i !== index)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(withTrailingRow(next));
  };

  const visible = mode === "edit" ? rows : rows.filter((r) => r.cue.trim() || r.content.trim());
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  // Only rows with a question *and* an answer can be recalled.
  const quizzable = visible.filter((r) => r.cue.trim() && r.content.trim());
  const answered = quizzable.filter((r) => r.id in assessed).length;

  const assess = (row: CornellRow, known: boolean) => {
    const next = { ...assessed, [row.id]: known };
    setAssessed(next);
    if (quizzable.every((r) => r.id in next)) {
      onRecallComplete?.({
        known: quizzable.filter((r) => next[r.id]),
        unknown: quizzable.filter((r) => !next[r.id]),
      });
    }
  };
  const restartRecall = () => {
    setRevealed(new Set());
    setAssessed({});
  };

  if (visible.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground italic">
        Noch leer – wechsle zu „Schreiben“, um loszulegen.
      </div>
    );
  }

  return (
    <div>
      {mode === "recall" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5 text-sm @md:px-5">
          <div className="min-w-0">
            <p className="font-medium">Erst antworten, dann aufdecken</p>
            <p className="text-xs text-muted-foreground">Sag die Antwort laut oder schreib sie kurz auf. Danach ehrlich einschätzen – das verankert Wissen am stärksten.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">{answered}/{quizzable.length}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-primary/10">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${quizzable.length ? (answered / quizzable.length) * 100 : 0}%` }} />
            </div>
            {answered > 0 && (
              <Button size="icon-sm" variant="ghost" onClick={restartRecall} aria-label="Abfrage neu starten" title="Neu starten">
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
      <ColumnHeader />
      <div role="table" aria-label="Cornell-Notizen">
        {visible.map((row, index) => {
          const isLast = mode === "edit" && index === visible.length - 1;
          const hasCard = !!row.cue.trim() && cardFronts.has(norm(row.cue));
          return (
            <div key={row.id} role="row" className={cn(GRID, "group relative border-b last:border-b-0")}>
              {/* Cue column */}
              <div role="cell" className={cn("relative border-b border-dashed bg-cornell-cue px-4 py-3 @md:px-5 @xl:border-r @xl:border-b-0 @xl:border-solid", hasCard && "pr-9 @md:pr-9")}>
                <MobileLabel>Stichwort / Frage</MobileLabel>
                {mode === "edit" ? (
                  <AutoTextarea
                    ref={setRef(`${row.id}:cue`)}
                    value={row.cue}
                    minRows={1}
                    placeholder={isLast && index > 0 ? "Nächstes Stichwort / Frage …" : "Begriff oder Frage …"}
                    aria-label={`Stichwort oder Frage, Zeile ${index + 1}`}
                    className="font-medium"
                    onFocus={(e) => onFocusContent(e.currentTarget)}
                    onChange={(e) => update(row.id, { cue: e.target.value })}
                    onKeyDown={(e) => {
                      // Enter jumps to the notes of the same row; Shift+Enter = line break.
                      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        refs.current.get(`${row.id}:content`)?.focus();
                      } else if (e.key === "Backspace" && !row.cue && !row.content && rows.length > 1 && !isLast) {
                        e.preventDefault();
                        remove(index);
                      }
                    }}
                  />
                ) : row.cue.trim() ? (
                  <Markdown className="font-medium">{row.cue}</Markdown>
                ) : null}
                {hasCard && (
                  <span className="absolute top-2 right-2 text-primary" title="Als Karteikarte vorhanden">
                    <Layers className="size-3.5" aria-label="Karteikarte vorhanden" />
                  </span>
                )}
              </div>

              {/* Notes column */}
              <div role="cell" className={cn("min-w-0 px-4 py-3 @md:px-5", mode === "edit" && !isLast && "pr-11 @md:pr-11")}>
                <MobileLabel>Notizen</MobileLabel>
                {mode === "edit" ? (
                  <AutoTextarea
                    ref={setRef(`${row.id}:content`)}
                    value={row.content}
                    minRows={isLast && index === 0 ? 6 : 2}
                    placeholder={index === 0 ? "Mitschrift zu diesem Stichwort – Markdown: **fett**, Listen, Tabellen, `Code` …" : "Notizen …"}
                    aria-label={`Notizen, Zeile ${index + 1}`}
                    onFocus={(e) => onFocusContent(e.currentTarget)}
                    onChange={(e) => update(row.id, { content: e.target.value })}
                    onKeyDown={(e) => {
                      // ⌘↩ = new row (⇧⌘↩ / ⌥⌘↩ stay free for the session commands).
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        insertAfter(index);
                      }
                    }}
                  />
                ) : mode === "recall" && row.cue.trim() && row.content.trim() && !revealed.has(row.id) ? (
                  <button
                    type="button"
                    onClick={() => setRevealed((s) => new Set(s).add(row.id))}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Eye className="size-4" /> Aufdecken
                  </button>
                ) : row.content.trim() ? (
                  <>
                    <Markdown className={cn(mode === "recall" && "flip-in")}>{row.content}</Markdown>
                    {mode === "recall" && row.cue.trim() && (
                      row.id in assessed ? (
                        <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", assessed[row.id] ? "text-success" : "text-danger")}>
                          {assessed[row.id] ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          {assessed[row.id] ? "Gewusst" : "Nicht gewusst"}
                        </p>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => assess(row, false)}><X className="size-3.5 text-danger" /> Nicht gewusst</Button>
                          <Button size="sm" variant="secondary" onClick={() => assess(row, true)}><Check className="size-3.5 text-success" /> Gewusst</Button>
                        </div>
                      )
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">–</p>
                )}
              </div>

              {mode === "edit" && !isLast && (
                <div className="absolute top-2 right-2 opacity-100 transition @xl:opacity-0 @xl:group-focus-within:opacity-100 @xl:group-hover:opacity-100">
                  <Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label={`Aktionen für Zeile ${index + 1}`}><MoreHorizontal className="size-4" /></Button>}>
                    <DropdownItem icon={<Plus className="size-4" />} onSelect={() => insertAfter(index)}>Zeile darunter einfügen</DropdownItem>
                    <DropdownItem icon={<ArrowUp className="size-4" />} onSelect={() => move(index, -1)}>Nach oben</DropdownItem>
                    <DropdownItem icon={<ArrowDown className="size-4" />} onSelect={() => move(index, 1)}>Nach unten</DropdownItem>
                    {row.cue.trim() && (
                      <DropdownItem icon={<Layers className="size-4" />} onSelect={() => onMakeCard(row)}>Als Karteikarte …</DropdownItem>
                    )}
                    <DropdownSeparator />
                    <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => remove(index)}>Zeile löschen</DropdownItem>
                  </Dropdown>
                </div>
              )}
              {mode !== "edit" && row.cue.trim() && !hasCard && (
                <div className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100">
                  <Button variant="ghost" size="sm" onClick={() => onMakeCard(row)} title="Diese Zeile als Karteikarte anlegen">
                    <Layers className="size-3.5" /> Karte
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mode === "edit" && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground @md:px-5">
          <Kbd>Enter</Kbd> im Stichwort springt zu den Notizen · <Kbd>⌘/Strg</Kbd>+<Kbd>Enter</Kbd> neue Zeile · leere Zeile am Ende füllt sich automatisch
        </p>
      )}
    </div>
  );
}
