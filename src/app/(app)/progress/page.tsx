import type { Metadata } from "next";
import { Flame, Lock } from "lucide-react";
import { requireUser } from "@/server/auth";
import { gamificationState } from "@/server/gamification";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { levelTitle, XP, xpForLevel } from "@/lib/gamification";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Ring } from "@/components/gamification/ring";
import { ActivityHeatmap } from "@/components/study/forecast-chart";

export const metadata: Metadata = { title: "Fortschritt" };

const RULES: [string, string][] = [
  ["Karteikarte wiederholt", `${XP.review[1]}–${XP.review[4]} XP – auch falsche Antworten zählen`],
  ["Mitschrift begonnen", `${XP.record} XP`],
  ["Fragen formuliert", `${XP.reduce} XP`],
  ["Sitzung abgefragt", `${XP.recite} XP (1× pro Tag und Sitzung)`],
  ["Zusammenfassung geschrieben", `${XP.reflect} XP + ${XP.reflectFresh} XP, wenn innerhalb von 24 h`],
  ["Karteikarte erstellt", `${XP.cardsPerCard} XP (max. 40 XP pro Tag)`],
  ["Probeklausur geschrieben", `${XP.examPerQuestion} XP pro Aufgabe (max. ${XP.examMax} XP)`],
  ["Fokus-Block (Pomodoro) beendet", `${XP.focusPer5Min} XP je 5 Minuten (max. ${XP.focusMax} XP pro Block)`],
  ["Tagesziel erreicht", `+${XP.dailyGoal} XP Bonus`],
];

const METHOD: [string, string, string][] = [
  ["Abrufen statt Wiederlesen", "Sich selbst abzufragen festigt Wissen stärker als erneutes Lesen – auch wenn es sich mühsamer anfühlt. Deshalb Abfragen, Karteikarten und Probeklausuren.", "Roediger & Karpicke 2006"],
  ["Verteilt statt geballt", "Dieselbe Lernzeit, auf mehrere Tage verteilt, bringt deutlich mehr als eine lange Session. FSRS wählt den Abstand für jede Karte einzeln.", "Cepeda et al. 2006"],
  ["Wiederholt bis zum Kriterium", "Jede Runde abfragen, bis alles einmal gewusst wurde – und das über mehrere Tage: der Prüfungsmodus und der Lernplan arbeiten so.", "Rawson & Dunlosky 2011"],
  ["Gemischt üben", "Module und Aufgabentypen abwechseln trainiert, die passende Lösung selbst zu erkennen – genau das verlangt die Klausur.", "Rohrer & Taylor 2007"],
  ["Warum- und Wie-Fragen", "Wer Zusammenhänge erklärt, verknüpft Neues mit Vorwissen. Darum regt der Fragen-Schritt Warum/Wie-Fragen und Praxisbeispiele an.", "Dunlosky et al. 2013"],
  ["Vorwissen aktivieren", "Kurz die letzte Sitzung abzufragen macht das Lernen der neuen leichter (Forward-Testing-Effekt).", "Pastötter & Bäuml 2014"],
  ["Ehrlich einschätzen", "Das Gefühl „kenn ich“ täuscht. Erst antworten, dann aufdecken: So siehst du, was wirklich sitzt.", "Bjork et al. 2013"],
  ["Schlaf festigt", "Im Schlaf wird Gelerntes stabilisiert. Am Abend vor der Prüfung lieber kurz wiederholen und früh schlafen als durchlernen.", "Diekelmann & Born 2010"],
];

export default async function ProgressPage() {
  const user = await requireUser();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 83);
  const [game, events] = await Promise.all([
    gamificationState(user.id),
    db.xpEvent.findMany({ where: { userId: user.id, createdAt: { gte: since } }, select: { amount: true, createdAt: true } }),
  ]);

  const days = Array.from({ length: 84 }, (_, i) => {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    return { date, count: 0 };
  });
  for (const e of events) {
    const idx = Math.floor((new Date(e.createdAt).setHours(0, 0, 0, 0) - since.getTime()) / 86_400_000);
    if (days[idx]) days[idx].count += e.amount;
  }
  const unlocked = game.achievements.filter((a) => a.unlockedAt);
  const goalPct = game.xpToday / game.dailyGoal;

  return (
    <>
      <PageHeader title="Fortschritt" description="Kleine tägliche Schritte schlagen große, seltene Lernsessions." />

      <Card className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <span className="text-[10px] font-medium tracking-wide uppercase opacity-70">Level</span>
            <span className="text-3xl leading-none font-semibold tabular-nums">{game.level}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold tracking-tight">{game.title}</p>
            <p className="text-sm text-muted-foreground">
              {game.totalXp.toLocaleString("de-DE")} XP gesamt · noch {game.needed - game.current} XP bis Level {game.level + 1}{levelTitle(game.level + 1) !== game.title && ` (${levelTitle(game.level + 1)})`}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.round(game.progress * 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{xpForLevel(game.level)}</span>
              <span>{xpForLevel(game.level + 1)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-5">
          <Ring value={goalPct} size={52} stroke={5}>
            <span className="text-xs font-semibold tabular-nums">{Math.min(100, Math.round(goalPct * 100))}%</span>
          </Ring>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Tagesziel</p>
            <p className="text-xl font-semibold tabular-nums">{game.xpToday}<span className="text-sm text-muted-foreground">/{game.dailyGoal} XP</span></p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <div className={cn("flex size-[52px] items-center justify-center rounded-full", game.activeToday ? "bg-orange-500/10" : "bg-muted")}>
            <Flame className={cn("size-6", game.activeToday ? "text-orange-500" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Serie</p>
            <p className="text-xl font-semibold tabular-nums">{game.streak} {game.streak === 1 ? "Tag" : "Tage"}</p>
            {!game.activeToday && game.streak > 0 && <p className="text-xs text-amber-700 dark:text-warning">Heute noch lernen, um sie zu halten</p>}
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <div className="flex size-[52px] items-center justify-center rounded-full bg-muted text-2xl" aria-hidden>🏆</div>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Erfolge</p>
            <p className="text-xl font-semibold tabular-nums">{unlocked.length}<span className="text-sm text-muted-foreground">/{game.achievements.length}</span></p>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Aktivität" description="XP pro Tag, letzte 12 Wochen" />
        <CardBody><ActivityHeatmap data={days} unit="XP" /></CardBody>
      </Card>

      <h2 className="mt-10 mb-3 text-sm font-semibold">Erfolge</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {game.achievements.map((a) => (
          <div key={a.key} className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs", !a.unlockedAt && "bg-muted/30 shadow-none")}>
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-xl", !a.unlockedAt && "grayscale opacity-40")} aria-hidden>
              {a.unlockedAt ? a.emoji : <Lock className="size-4 text-muted-foreground" />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !a.unlockedAt && "text-muted-foreground")}>{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
              {a.unlockedAt && <p className="mt-1 text-[11px] text-muted-foreground">{fmtDate(a.unlockedAt)}</p>}
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-10">
        <CardHeader title="So sammelst du XP" description="Belohnt wird, was nachweislich beim Lernen hilft: aktives Erinnern, Zusammenfassen, verteiltes Wiederholen." />
        <CardBody>
          <dl className="divide-y text-sm">
            {RULES.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between">
                <dt>{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Die Methode dahinter" description="Was die Lernforschung empfiehlt – und wie es in den DHBW-Rhythmus aus Theorie- und Praxisphase passt." />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
            {METHOD.map(([k, v, src]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="mt-0.5 text-muted-foreground">{v} <span className="text-xs whitespace-nowrap">({src})</span></dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Dein DHBW-Rhythmus</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li><span className="text-foreground">Vor jeder Vorlesung</span> 2 Minuten aufwärmen: Die neue Sitzung zeigt Fragen der letzten.</li>
              <li><span className="text-foreground">Am selben Abend</span> Fragen formulieren, abfragen und zusammenfassen – solange es frisch ist.</li>
              <li><span className="text-foreground">Täglich</span> 15–20 Minuten fällige Karten. Wer ab der ersten Woche wiederholt, muss vor der Klausurenphase nichts mehr neu lernen.</li>
              <li><span className="text-foreground">Drei Wochen vor den Klausuren</span> den Lernplan erstellen (Übersicht → Prüfungen → Lernplan): verteilt, gemischt, mit Generalprobe.</li>
              <li><span className="text-foreground">In der Praxisphase</span> nur die fälligen Karten weiterlaufen lassen – ein paar Minuten am Tag halten das Wissen für die Folgemodule und die Bachelorarbeit.</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
