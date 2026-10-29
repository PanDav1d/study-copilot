"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Flame, NotebookPen, PartyPopper, Undo2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, Kbd, ModuleTag, Progress } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/form";
import { Markdown } from "@/components/markdown";
import { fmtInterval } from "@/lib/dates";
import {
  GRADES,
  LEARN_AHEAD_MS,
  RATING_HINTS,
  RATING_LABELS,
  State,
  previewIntervals,
  type Grade,
  type SchedulerSettings,
  type StoredCardState,
} from "@/lib/srs/scheduler";
import { cn } from "@/lib/utils";
import { reviewFlashcard, undoReview } from "@/server/actions/flashcards";
import type { Reward } from "@/server/gamification";
import { showReward } from "@/components/gamification/reward";
import type { ReviewQueueItem } from "@/server/queries/flashcards";

type SerializedState = ReviewQueueItem["cardState"];

function parseState(s: SerializedState): StoredCardState {
  return { ...s, due: new Date(s.due), lastReview: s.lastReview ? new Date(s.lastReview) : null };
}

const GRADE_STYLES: Record<Grade, string> = {
  1: "border-danger/40 hover:bg-danger/10 text-danger",
  2: "border-warning/50 hover:bg-warning/15 text-amber-700 dark:text-warning",
  3: "border-success/40 hover:bg-success/10 text-success",
  4: "border-sky-500/40 hover:bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

interface Snapshot {
  queue: ReviewQueueItem[];
  cardId: string;
  stats: Record<Grade, number>;
  combo: number;
  xp: number;
}

/** Combo milestones get a short, encouraging message (variable, not every card). */
const COMBO_MESSAGES: Record<number, string> = {
  5: "5 in Folge – läuft!",
  10: "10er-Combo! ⚡",
  15: "15 am Stück – stark.",
  25: "25er-Combo! 🔥",
  50: "50 in Folge. Unaufhaltsam.",
};

/** Re-show a card later in the session (learning steps) – at least `gap` cards later. */
function requeue(queue: ReviewQueueItem[], item: ReviewQueueItem, gap = 3) {
  const pos = Math.min(queue.length, gap);
  return [...queue.slice(0, pos), item, ...queue.slice(pos)];
}

export function ReviewSession({
  initialQueue,
  settings,
  title,
  backHref,
  mode,
}: {
  initialQueue: ReviewQueueItem[];
  settings: SchedulerSettings;
  title: string;
  backHref: string;
  mode: "due" | "cram";
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [uniqueDone, setUniqueDone] = useState<Set<string>>(new Set());
  const [previewLabels, setPreviewLabels] = useState<Record<Grade, string> | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [floatXp, setFloatXp] = useState<{ id: number; amount: number } | null>(null);
  const [unlocked, setUnlocked] = useState<Reward["achievements"]>([]);
  const shownAt = useRef(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // Fixed at session start: revalidation after each rating re-renders the page with a shorter queue.
  const [total] = useState(() => new Set(initialQueue.map((c) => c.id)).size);
  const current = queue[0];
  const reviewed = stats[1] + stats[2] + stats[3] + stats[4];

  // Start the answer timer whenever a new card is shown.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.id, queue.length]);

  /** Show the next card: reset the per-card UI state. */
  const advance = useCallback((next: ReviewQueueItem[]) => {
    setQueue(next);
    setRevealed(false);
    setAnswer("");
    setPreviewLabels(null);
  }, []);

  const reveal = useCallback(() => {
    if (!current) return;
    // Interval previews are computed at reveal time, the moment closest to the rating.
    const now = new Date();
    const p = previewIntervals(parseState(current.cardState), now, settings);
    setPreviewLabels({ 1: fmtInterval(now, p[1]), 2: fmtInterval(now, p[2]), 3: fmtInterval(now, p[3]), 4: fmtInterval(now, p[4]) });
    setRevealed(true);
  }, [current, settings]);

  const rate = useCallback(
    async (grade: Grade) => {
      if (!current || busy) return;
      setBusy(true);
      const durationMs = Math.min(Date.now() - shownAt.current, 3_600_000);
      const res = await reviewFlashcard({ flashcardId: current.id, rating: grade, durationMs }).catch(() => null);
      setBusy(false);
      if (!res || !res.ok) {
        toast.error(res && !res.ok ? res.error : "Bewertung konnte nicht gespeichert werden.");
        return;
      }
      setHistory((h) => [...h.slice(-19), { queue, cardId: current.id, stats, combo, xp }]);
      setStats((s) => ({ ...s, [grade]: s[grade] + 1 }));

      // Gamification: combo of known cards, XP feedback right at the moment of answering.
      const nextCombo = grade > 1 ? combo + 1 : 0;
      setCombo(nextCombo);
      setBestCombo((b) => Math.max(b, nextCombo));
      if (COMBO_MESSAGES[nextCombo]) toast(COMBO_MESSAGES[nextCombo], { duration: 1800 });
      const reward = res.data.reward;
      setXp((x) => x + reward.xp);
      if (reward.xp > 0) setFloatXp({ id: Date.now(), amount: reward.xp });
      if (reward.achievements.length) setUnlocked((u) => [...u, ...reward.achievements]);
      showReward(reward, undefined, { quiet: true });

      const card = res.data.card;
      const updated: ReviewQueueItem = { ...current, cardState: card, state: card.state };
      const rest = queue.slice(1);
      const dueSoon = new Date(card.due).getTime() - Date.now() <= LEARN_AHEAD_MS;
      if (dueSoon && card.state !== State.Review) {
        advance(requeue(rest, updated));
      } else {
        advance(rest);
        setUniqueDone((d) => new Set(d).add(current.id));
      }
    },
    [current, busy, queue, stats, combo, xp, advance],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    const res = await undoReview({ flashcardId: last.cardId }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      toast.error(res && !res.ok ? res.error : "Rückgängig fehlgeschlagen.");
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setStats(last.stats);
    setCombo(last.combo);
    setXp(last.xp);
    setUniqueDone((d) => {
      const n = new Set(d);
      n.delete(last.cardId);
      return n;
    });
    advance(last.queue.map((c) => (c.id === last.cardId ? { ...c, cardState: res.data, state: res.data.state } : c)));
    toast.success("Letzte Bewertung rückgängig gemacht");
  }, [history, busy, advance]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === answerRef.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undo();
        return;
      }
      if (typing) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          reveal();
          answerRef.current?.blur();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as Grade);
      } else if (revealed && e.key === " ") {
        e.preventDefault();
        void rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, rate, undo]);

  if (!current) {
    const correct = stats[2] + stats[3] + stats[4];
    const accuracy = reviewed ? Math.round((correct / reviewed) * 100) : 0;
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border bg-background shadow-xs">
          {reviewed > 0 ? <PartyPopper className="size-6" /> : <CheckCircle2 className="size-6 text-success" />}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{reviewed > 0 ? "Runde geschafft" : "Alles erledigt"}</h1>
        {reviewed === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "due"
              ? "Gerade ist nichts fällig. FSRS meldet sich genau dann, wenn du sonst anfangen würdest zu vergessen."
              : "Keine Karten in dieser Auswahl."}
          </p>
        )}
        {reviewed > 0 && (
          <>
            <p className="mt-6 text-5xl font-semibold tracking-tight tabular-nums">+{xp} <span className="text-2xl text-muted-foreground">XP</span></p>
            <div className="mt-6 grid grid-cols-3 divide-x rounded-xl border bg-card py-3 shadow-xs">
              <div><div className="text-lg font-semibold tabular-nums">{reviewed}</div><div className="text-xs text-muted-foreground">Antworten</div></div>
              <div><div className="text-lg font-semibold tabular-nums">{accuracy} %</div><div className="text-xs text-muted-foreground">gewusst</div></div>
              <div><div className="text-lg font-semibold tabular-nums">{bestCombo}</div><div className="text-xs text-muted-foreground">beste Combo</div></div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {GRADES.map((g) => `${stats[g]}× ${RATING_LABELS[g]}`).join(" · ")}
            </p>
            {stats[1] > 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Fehler sind hier Gewinn: Was du eben nicht wusstest, merkst du dir nach dem Nachschlagen besser als vorher.
              </p>
            )}
            {unlocked.length > 0 && (
              <ul className="mt-6 space-y-2 text-left">
                {unlocked.map((a) => (
                  <li key={a.key} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-xs">
                    <span className="text-xl" aria-hidden>{a.emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {history.length > 0 && <Button variant="ghost" onClick={undo} loading={busy}><Undo2 className="size-4" /> Rückgängig</Button>}
          <Link href={backHref} className={buttonClass("secondary")}><ArrowLeft className="size-4" /> Zurück</Link>
          <Button onClick={() => router.refresh()}>Weiterlernen</Button>
        </div>
      </div>
    );
  }


  const isNew = current.state === State.New;
  const learning = current.state === State.Learning || current.state === State.Relearning;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href={backHref} className={buttonClass("ghost", "icon-sm")} aria-label="Sitzung beenden"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{title}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{uniqueDone.size} / {total}</span>
          </div>
          <Progress value={total ? uniqueDone.size / total : 0} className="mt-1.5" />
        </div>
        <div className="relative flex items-center gap-2 text-[13px] font-medium tabular-nums">
          {combo >= 3 && (
            <span key={combo} className="pop inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-orange-600 dark:text-orange-400" title="Richtige Antworten in Folge">
              <Flame className="size-3.5" />{combo}
            </span>
          )}
          <span className="text-muted-foreground" title="In dieser Runde gesammelt">{xp} XP</span>
          {floatXp && (
            <span key={floatXp.id} className="xp-float absolute -top-1 right-0 text-xs font-semibold text-success">+{floatXp.amount}</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length === 0 || busy} title="Letzte Bewertung rückgängig (⌘Z)">
          <Undo2 className="size-4" /> <span className="hidden sm:inline">Rückgängig</span>
        </Button>
      </div>

      <div key={`${current.id}-${queue.length}`} className="flip-in overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
          <ModuleTag name={current.module.name} color={current.module.color} />
          {current.topic && <Badge>{current.topic}</Badge>}
          {isNew && <Badge tone="primary">Neu</Badge>}
          {learning && <Badge tone="warning">Lernphase</Badge>}
          {current.lapses > 0 && <span className="text-xs text-muted-foreground">{current.lapses}× vergessen</span>}
          <div className="ml-auto flex items-center gap-2">
            {current.note && (
              <Link href={`/notes/${current.note.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Sitzung in neuem Tab öffnen">
                <NotebookPen className="size-3.5" /> Sitzung <ExternalLink className="size-3" />
              </Link>
            )}
            {current.documents.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} target="_blank" className="inline-flex max-w-40 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title={`${d.title} in neuem Tab öffnen`}>
                <FileText className="size-3.5 shrink-0" /> <span className="truncate">{d.title}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="px-5 py-8 sm:px-8">
          <Markdown className="text-base sm:text-lg">{current.front}</Markdown>
        </div>

        {!revealed ? (
          <div className="border-t bg-muted/30 px-5 py-4 sm:px-8">
            <Textarea
              ref={answerRef}
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Antwort aus dem Gedächtnis formulieren (optional) …"
              aria-label="Eigene Antwort"
              className="bg-card"
            />
            <Button size="lg" className="mt-3 w-full" onClick={reveal}>
              Lösung zeigen <Kbd>Leertaste</Kbd>
            </Button>
          </div>
        ) : (
          <div className="flip-in border-t">
            {answer.trim() && (
              <div className="border-b bg-muted/30 px-5 py-3 sm:px-8">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Deine Antwort</p>
                <p className="text-sm whitespace-pre-wrap">{answer}</p>
              </div>
            )}
            <div className="px-5 py-6 sm:px-8">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Lösung</p>
              <Markdown className="text-base">{current.back}</Markdown>
            </div>
            <div className="border-t bg-muted/30 px-4 py-4 sm:px-6">
              <p className="mb-2 text-center text-xs text-muted-foreground">Wie gut wusstest du es?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={busy}
                    onClick={() => rate(g)}
                    title={RATING_HINTS[g]}
                    className={cn("flex flex-col items-center rounded-xl border-2 bg-card px-2 py-2.5 font-medium transition disabled:opacity-50", GRADE_STYLES[g])}
                  >
                    <span className="flex items-center gap-1.5 text-sm">{RATING_LABELS[g]} <Kbd>{g}</Kbd></span>
                    <span className="mt-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                      {previewLabels?.[g] ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {queue.length} verbleibend · Tastatur: <Kbd>Leertaste</Kbd> aufdecken, <Kbd>1</Kbd>–<Kbd>4</Kbd> bewerten, <Kbd>⌘Z</Kbd> rückgängig
      </p>
    </div>
  );
}
