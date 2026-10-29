import { cookies, headers } from "next/headers";
import { requireUser } from "@/server/auth";
import { knownRooms, structureTree } from "@/server/queries/structure";
import { documentOptions } from "@/server/queries/documents";
import { openSummaryCount } from "@/server/queries/tasks";
import { gamificationState } from "@/server/gamification";
import { db } from "@/lib/db";
import { State, endOfLocalDay } from "@/lib/srs/scheduler";
import { AppShell } from "@/components/shell/app-shell";
import { EMBED_HEADER, SIDEBAR_COOKIE } from "@/lib/constants";
import { isDesktop } from "@/lib/env";
import { StudyDataProvider } from "@/components/shell/study-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  const embedded = (await headers()).get(EMBED_HEADER) === "1";
  const [tree, documents, openSummaries, game, dueCount, rooms] = await Promise.all([
    structureTree(user.id),
    documentOptions(user.id),
    openSummaryCount(user.id),
    gamificationState(user.id),
    db.flashcard.count({
      where: { userId: user.id, suspended: false, state: { not: State.New }, due: { lte: endOfLocalDay(new Date()) } },
    }),
    knownRooms(user.id),
  ]);

  return (
    <StudyDataProvider value={{ tree, documents, rooms }}>
      <AppShell
        dueCount={dueCount}
        openSummaries={openSummaries}
        userName={user.name}
        desktop={isDesktop()}
        initialCollapsed={sidebarCollapsed}
        embedded={embedded}
        game={{
          level: game.level,
          title: game.title,
          current: game.current,
          needed: game.needed,
          progress: game.progress,
          xpToday: game.xpToday,
          dailyGoal: game.dailyGoal,
          streak: game.streak,
          activeToday: game.activeToday,
        }}
      >
        {children}
      </AppShell>
    </StudyDataProvider>
  );
}
