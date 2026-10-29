import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { reviewQueue, type ReviewMode } from "@/server/queries/flashcards";
import { schedulerSettings } from "@/server/queries/settings";
import { db } from "@/lib/db";
import { ReviewSession } from "@/components/study/review-session";

export const metadata: Metadata = { title: "Lernsitzung" };

export default async function ReviewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string; note?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mode: ReviewMode = sp.mode === "cram" ? "cram" : "due";
  const [queue, module] = await Promise.all([
    reviewQueue(user, { moduleId: sp.module, topic: sp.topic, noteId: sp.note, mode }),
    sp.module ? db.module.findFirst({ where: { id: sp.module, userId: user.id }, select: { name: true } }) : null,
  ]);
  const title = [mode === "cram" ? "Prüfungsvorbereitung" : "Wiederholung", module?.name ?? "Alle Module", sp.topic].filter(Boolean).join(" · ");

  return (
    <ReviewSession
      key={JSON.stringify(sp)}
      initialQueue={queue}
      settings={schedulerSettings(user)}
      title={title}
      backHref={sp.module ? `/modules/${sp.module}` : "/review"}
      mode={mode}
    />
  );
}
