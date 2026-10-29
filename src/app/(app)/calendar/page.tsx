import type { Metadata } from "next";
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { requireUser } from "@/server/auth";
import { calendarRange } from "@/server/queries/calendar";
import { db } from "@/lib/db";
import { parseLocalDate, toDateInput } from "@/lib/dates";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Kalender" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const anchor = (sp.date && parseLocalDate(sp.date)) || new Date();

  const from = view === "month" ? startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }) : startOfWeek(anchor, { weekStartsOn: 1 });
  const to = view === "month" ? addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }), 1) : addDays(from, 7);
  to.setHours(0, 0, 0, 0);

  const [{ items, dueByDay }, topicRows] = await Promise.all([
    calendarRange(user.id, from, to),
    db.flashcard.findMany({ where: { userId: user.id, topic: { not: null } }, distinct: ["moduleId", "topic"], select: { moduleId: true, topic: true } }),
  ]);
  const topics: Record<string, string[]> = {};
  for (const r of topicRows) (topics[r.moduleId] ??= []).push(r.topic!);

  return (
    <CalendarView
      view={view}
      anchor={toDateInput(anchor)}
      from={toDateInput(from)}
      to={toDateInput(to)}
      items={items}
      dueByDay={dueByDay}
      topicOptions={topics}
    />
  );
}
