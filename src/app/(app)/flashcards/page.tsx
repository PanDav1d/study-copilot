import type { Metadata } from "next";
import Link from "next/link";
import { Brain, Layers } from "lucide-react";
import { requireUser } from "@/server/auth";
import { flashcardTopics, listFlashcards, type FlashcardFilter } from "@/server/queries/flashcards";
import { MASTERY_LABELS, MASTERY_ORDER, summarizeMastery } from "@/lib/srs/scheduler";
import { buttonClass } from "@/components/ui/button";
import { LearnTabs } from "@/components/study/learn-tabs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListFilters } from "@/components/list-filters";
import { FlashcardList, NewFlashcardButton } from "@/components/flashcards/flashcard-list";
import { MasteryBar } from "@/components/study/mastery-bar";

export const metadata: Metadata = { title: "Karteikarten" };

const LEVELS = [
  { value: "due", label: "Heute fällig" },
  ...MASTERY_ORDER.map((l) => ({ value: l, label: MASTERY_LABELS[l] })),
  { value: "suspended", label: "Pausiert" },
];

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ module?: string; topic?: string; q?: string; level?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const level = LEVELS.some((l) => l.value === sp.level) ? (sp.level as FlashcardFilter["level"]) : undefined;
  const [cards, topics] = await Promise.all([
    listFlashcards(user, { moduleId: sp.module, topic: sp.topic, q: sp.q, level }),
    flashcardTopics(user.id, sp.module),
  ]);
  const active = cards.filter((c) => !c.suspended);
  const summary = summarizeMastery(active);
  const reviewHref = `/review/session?${new URLSearchParams({ ...(sp.module && { module: sp.module }), ...(sp.topic && { topic: sp.topic }) })}`;

  return (
    <>
      <LearnTabs active="flashcards" />
      <PageHeader
        title="Karteikarten"
        description={`${cards.length} Karte${cards.length === 1 ? "" : "n"}${level || sp.q || sp.topic ? " (gefiltert)" : ""}`}
        actions={
          <>
            {active.length > 0 && <Link href={reviewHref} className={buttonClass("secondary")}><Brain className="size-4" /> Lernen</Link>}
            <NewFlashcardButton moduleId={sp.module} topics={topics} />
          </>
        }
      >
        {summary.total > 0 && <MasteryBar counts={summary.counts} total={summary.total} legend className="mt-4" />}
      </PageHeader>
      <ListFilters fields={["q", "module", "topic", "level"]} topics={topics} levels={LEVELS} />
      {cards.length === 0 ? (
        <EmptyState icon={Layers} title="Keine Karteikarten gefunden" description="Erstelle Karten direkt hier oder aus den Zeilen deiner Sitzungen." action={<NewFlashcardButton moduleId={sp.module} topics={topics} />} />
      ) : (
        <FlashcardList cards={cards} showModule={!sp.module} topics={topics} />
      )}
    </>
  );
}
