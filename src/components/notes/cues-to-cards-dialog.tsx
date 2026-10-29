"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { rowsToFlashcardDrafts, withoutExisting, type CornellRow } from "@/lib/cornell";
import { createFlashcards } from "@/server/actions/flashcards";
import { showReward } from "@/components/gamification/reward";

/**
 * Turns the rows of a Cornell sheet into flashcards: cue → front, notes → back.
 */
export function CuesToCardsDialog({
  open,
  onOpenChange,
  rows,
  existingFronts,
  moduleId,
  noteId,
  defaultTopic,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: CornellRow[];
  existingFronts: string[];
  moduleId: string;
  noteId: string;
  defaultTopic: string;
}) {
  const initial = useMemo(() => withoutExisting(rowsToFlashcardDrafts(rows), existingFronts), [rows, existingFronts]);
  const [drafts, setDrafts] = useState(() => initial.map((d) => ({ ...d, selected: true })));
  const [topic, setTopic] = useState(defaultTopic);
  const create = useAction(createFlashcards);
  const selected = drafts.filter((d) => d.selected);
  const missing = selected.filter((d) => !d.back.trim()).length;

  async function submit() {
    const res = await create.run({ moduleId, noteId, topic, cards: selected.map(({ front, back }) => ({ front, back })) });
    if (res) {
      onOpenChange(false);
      showReward(res.reward, `${res.count} Karteikarte${res.count === 1 ? "" : "n"} erstellt`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Karteikarten aus Zeilen erzeugen"
      description={initial.length ? "Stichwort/Frage wird zur Vorderseite, die Notizen der Zeile zur Rückseite. Kürze die Antworten ruhig auf das Wesentliche." : undefined}
    >
      {initial.length === 0 ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Keine neuen Zeilen gefunden.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Jede Zeile mit einem Stichwort bzw. einer Frage in der linken Spalte wird zu einer Karte; die rechte Spalte ist die Antwort.</li>
            <li>Zeilen, zu denen es schon eine Karte gibt, werden übersprungen.</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Thema für alle Karten" htmlFor="ctc-topic">
            <Input id="ctc-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <ul className="space-y-3">
            {drafts.map((d, i) => (
              <li key={i} className="rounded-xl border p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-2 size-4 accent-primary"
                    checked={d.selected}
                    onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                    aria-label="Karte übernehmen"
                  />
                  <div className="grid flex-1 gap-2">
                    <Input value={d.front} onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} aria-label="Vorderseite" />
                    <Textarea
                      rows={3}
                      value={d.back}
                      placeholder="Antwort …"
                      aria-label="Rückseite"
                      aria-invalid={d.selected && !d.back.trim()}
                      onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))}
                    />
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {missing > 0 && <span className="mr-auto text-xs text-danger">{missing} Antwort{missing === 1 ? "" : "en"} fehlen</span>}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        {initial.length > 0 && (
          <Button onClick={submit} loading={create.pending} disabled={selected.length === 0 || missing > 0}>
            {selected.length} Karte{selected.length === 1 ? "" : "n"} erstellen
          </Button>
        )}
      </div>
    </Dialog>
  );
}
