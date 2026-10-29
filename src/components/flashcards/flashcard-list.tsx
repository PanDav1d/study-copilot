"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, FileText, History, MoreHorizontal, NotebookPen, Pause, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Badge, ModuleTag } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { FlashcardDialog } from "@/components/forms/flashcard-dialog";
import { MasteryBadge } from "@/components/study/mastery-bar";
import { useAction } from "@/hooks/use-action";
import { fmtDaysUntil } from "@/lib/dates";
import { State, type MasteryLevel } from "@/lib/srs/scheduler";
import { cn } from "@/lib/utils";
import { deleteFlashcard, resetFlashcard, setFlashcardSuspended } from "@/server/actions/flashcards";

export interface FlashcardRow {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  moduleId: string;
  noteId: string | null;
  suspended: boolean;
  state: number;
  due: Date;
  reps: number;
  lapses: number;
  level: MasteryLevel;
  retrievability: number;
  module: { id: string; name: string; color: string };
  note: { id: string; title: string } | null;
  documents: { document: { id: string; title: string } }[];
}

function CardItem({ card, showModule, topics }: { card: FlashcardRow; showModule: boolean; topics: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | "reset" | null>(null);
  const suspend = useAction(setFlashcardSuspended);
  const reset = useAction(resetFlashcard, { success: "Lernfortschritt zurückgesetzt" });
  const del = useAction(deleteFlashcard, { success: "Karteikarte gelöscht" });

  return (
    <li className={cn("px-4 py-3", card.suspended && "opacity-60")}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex items-start gap-2">
            <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition", !open && "-rotate-90")} aria-hidden />
            <div className={cn("min-w-0 flex-1", !open && "line-clamp-2")}>
              <Markdown className="font-medium">{card.front}</Markdown>
            </div>
          </div>
        </button>
        <Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label="Aktionen"><MoreHorizontal className="size-4" /></Button>}>
          <DropdownItem icon={<Pencil className="size-4" />} onSelect={() => setDialog("edit")}>Bearbeiten</DropdownItem>
          <DropdownItem icon={<History className="size-4" />} onSelect={() => router.push(`/flashcards/${card.id}`)}>Lernhistorie</DropdownItem>
          <DropdownItem icon={card.suspended ? <Play className="size-4" /> : <Pause className="size-4" />} onSelect={() => suspend.run({ id: card.id, suspended: !card.suspended })}>
            {card.suspended ? "Wieder aktivieren" : "Pausieren"}
          </DropdownItem>
          <DropdownItem icon={<RotateCcw className="size-4" />} onSelect={() => setDialog("reset")}>Als neu lernen</DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDialog("delete")}>Löschen</DropdownItem>
        </Dropdown>
      </div>
      {open && (
        <div className="mt-2 ml-6 rounded-lg border bg-muted/40 p-3 flip-in">
          <Markdown>{card.back}</Markdown>
        </div>
      )}
      <div className="mt-2 ml-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {showModule && <ModuleTag name={card.module.name} color={card.module.color} />}
        {card.topic && <Badge>{card.topic}</Badge>}
        {card.suspended ? <Badge tone="warning">Pausiert</Badge> : <MasteryBadge level={card.level} />}
        {card.state !== State.New && !card.suspended && (
          <span className={card.due <= new Date() ? "font-medium text-primary" : ""}>fällig {fmtDaysUntil(card.due)}</span>
        )}
        {card.reps > 0 && <span>{card.reps}× wiederholt{card.lapses > 0 ? `, ${card.lapses}× vergessen` : ""}</span>}
        {card.note && <Link href={`/notes/${card.note.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><NotebookPen className="size-3" />{card.note.title}</Link>}
        {card.documents.map(({ document: d }) => (
          <Link key={d.id} href={`/documents/${d.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><FileText className="size-3" />{d.title}</Link>
        ))}
      </div>

      {dialog === "edit" && (
        <FlashcardDialog
          open
          onOpenChange={() => setDialog(null)}
          topics={topics}
          initial={{ id: card.id, moduleId: card.moduleId, noteId: card.noteId, front: card.front, back: card.back, topic: card.topic, documentIds: card.documents.map((d) => d.document.id) }}
        />
      )}
      <ConfirmDialog open={dialog === "delete"} onOpenChange={() => setDialog(null)} title="Karteikarte löschen?" description="Die Karte und ihre Lernhistorie werden endgültig gelöscht." onConfirm={() => del.run({ id: card.id })} />
      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={() => setDialog(null)}
        title="Lernfortschritt zurücksetzen?"
        description="Die Karte wird wieder als neu behandelt. Sinnvoll, wenn du den Inhalt stark verändert hast. Die Historie bleibt erhalten."
        confirmLabel="Zurücksetzen"
        onConfirm={() => reset.run({ id: card.id })}
      />
    </li>
  );
}

export function FlashcardList({ cards, showModule = true, topics = [] }: { cards: FlashcardRow[]; showModule?: boolean; topics?: string[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {cards.map((c) => <CardItem key={c.id} card={c} showModule={showModule} topics={topics} />)}
    </ul>
  );
}

export function NewFlashcardButton({ moduleId, noteId, topics = [], variant = "primary", size = "md" }: { moduleId?: string; noteId?: string; topics?: string[]; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><Plus className="size-4" /> Karteikarte</Button>
      {open && <FlashcardDialog open onOpenChange={setOpen} defaults={{ moduleId, noteId: noteId ?? null }} topics={topics} />}
    </>
  );
}
