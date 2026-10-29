"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Coffee, EyeOff, Pause, Play, Plus, SkipForward, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModuleDot } from "@/components/ui/misc";
import { useStudyData } from "@/components/shell/study-data";
import { showReward } from "@/components/gamification/reward";
import {
  FOCUS_PRESETS,
  IDLE,
  extend,
  finishBreak,
  finishFocus,
  formatClock,
  focusedMinutes,
  isLongBreak,
  isPaused,
  isRunning,
  parseFocus,
  pause,
  progress,
  remaining,
  resume,
  start,
  stop,
  type FocusState,
} from "@/lib/focus";
import { cn } from "@/lib/utils";
import { focusStats, logFocus } from "@/server/actions/focus";
import { useCommand } from "@/components/shell/commands";

// ---------------------------------------------------------------------------
// Store: persisted in localStorage, so a reload (or the desktop app restarting)
// keeps the timer running; other windows follow via the storage event.
// ---------------------------------------------------------------------------

const KEY = "study.focus.v1";
let state: FocusState | null = null;
const listeners = new Set<() => void>();

function current(): FocusState {
  if (state === null) {
    try {
      state = parseFocus(localStorage.getItem(KEY));
    } catch {
      state = IDLE;
    }
  }
  return state;
}

function set(next: FocusState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  state = parseFocus(e.newValue);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export const useFocusState = () => useSyncExternalStore(subscribe, current, () => IDLE);

/** Focus mode: navigation hidden while a focus block is on. */
export function useZen() {
  const s = useFocusState();
  return s.zen && s.phase === "focus";
}

/**
 * Clock for the running block. Ticks once per second, aligned to the second, while the window is
 * visible; while hidden nothing ticks except a single wake-up at `endsAt` so the phase still ends on time.
 */
function useNow(active: boolean, endsAt?: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => setNow(Date.now());
    const schedule = () => {
      clearTimeout(timer);
      const t = Date.now();
      if (document.hidden) {
        if (endsAt != null) timer = setTimeout(() => (tick(), schedule()), Math.max(0, endsAt - t) + 50);
        return;
      }
      timer = setTimeout(() => (tick(), schedule()), 1000 - (t % 1000) + 5);
    };
    const onVisibility = () => {
      if (!document.hidden) tick();
      schedule();
    };
    tick();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, endsAt]);
  return now;
}

/**
 * Desktop shell: the menu bar item with the countdown. Only changes of the state are sent
 * (phase, end, pause) – the shell does the counting itself, so nothing ticks here.
 */
export function FocusTraySync() {
  const s = useFocusState();
  const phase = s.phase;
  const endsAt = s.endsAt;
  const left = s.left;
  useEffect(() => {
    const json = JSON.stringify({ p: phase, e: endsAt, l: left });
    void fetch(`studycopilot://localhost/focus?s=${encodeURIComponent(json)}`).catch(() => {});
  }, [phase, endsAt, left]);
  return null;
}

// ---------------------------------------------------------------------------
// Signals: toast always, system notification + soft chime when possible.
// ---------------------------------------------------------------------------

function chime(up: boolean) {
  try {
    const ctx = new AudioContext();
    const notes = up ? [660, 880] : [880, 660];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {}
}

function signal(title: string, body: string, up: boolean) {
  chime(up);
  toast(title, { description: body, duration: 8000 });
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(title, { body, icon: "/icon.svg" });
  } catch {}
}

function askNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {}
}

/** Ends the focus block: logs it, rewards it, starts the break. */
function completeFocus(now: number, early: boolean) {
  const { state: next, log } = finishFocus(current(), now);
  set(early ? stop(next) : next);
  if (!early) {
    const min = (isLongBreak(next) ? next.config.long : next.config.brk);
    signal("Fokus-Block geschafft 🍅", `${isLongBreak(next) ? "Lange Pause" : "Pause"}: ${min} Minuten. Steh kurz auf, schau in die Ferne.`, false);
  }
  if (log) {
    void logFocus({ moduleId: log.moduleId, startedAt: new Date(log.startedAt), minutes: log.minutes }).then((res) => {
      if (res.ok) showReward(res.data, `${log.minutes} min Fokus`);
    });
  }
}

// ---------------------------------------------------------------------------
// Header button + popover
// ---------------------------------------------------------------------------

function TimerRing({ value, size, stroke, className, children }: { value: number; size: number; stroke: number; className?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center">{children}</span>}
    </span>
  );
}

type Stats = { todayMin: number; todayBlocks: number; weekMin: number; byModule: { name: string; color: string | null; minutes: number }[] };

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`);

export function FocusTimer() {
  const s = useFocusState();
  const active = isRunning(s);
  const now = useNow(active, s.endsAt);
  const pathname = usePathname();
  const { tree } = useStudyData();
  const modules = useMemo(() => tree.flatMap((sem) => sem.modules), [tree]);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null | false>(null);
  const [pick, setPick] = useState<{ moduleId: string | null; preset: number } | null>(null);

  // Time up → next phase. Another window may have done it already (same endsAt check).
  useEffect(() => {
    if (!isRunning(s) || remaining(s, now) > 0 || current().endsAt !== s.endsAt) return;
    if (s.phase === "focus") completeFocus(now, false);
    else {
      set(finishBreak(current()));
      signal("Pause vorbei", "Bereit für die nächste Runde? Starte sie über den Timer oben.", true);
    }
  }, [s, now]);

  // The module of the page you are on is the default for a new block.
  const pageModule = useMemo(() => {
    const m = pathname.match(/^\/(modules|notes)\/([a-z0-9]+)/i);
    if (!m) return null;
    if (m[1] === "modules") return modules.some((x) => x.id === m[2]) ? m[2]! : null;
    return modules.find((x) => x.notes.some((n) => n.id === m[2]))?.id ?? null;
  }, [pathname, modules]);

  const loadStats = useCallback(() => {
    void focusStats({}).then((res) => setStats(res.ok ? res.data : false), () => setStats(false));
  }, []);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      loadStats();
      setPick(null);
    }
  };

  const moduleId = pick ? pick.moduleId : s.phase === "idle" ? (pageModule ?? s.moduleId) : s.moduleId;
  const presetIndex = pick?.preset ?? Math.max(0, FOCUS_PRESETS.findIndex((p) => p.config.focus === s.config.focus));
  const mod = modules.find((m) => m.id === (s.phase === "idle" ? moduleId : s.moduleId));
  const left = remaining(s, now);
  const pct = progress(s, now);
  const isBreak = s.phase === "break";
  const tone = isBreak ? "text-success" : "text-[oklch(0.64_0.2_32)]";

  // ⌥⌘P: idle → choose module and length, running → pause, paused → go on.
  useCommand(
    "focus.toggle",
    () => {
      const cur = current();
      if (cur.phase === "idle") onOpenChange(true);
      else if (isPaused(cur)) set(resume(cur, Date.now()));
      else set(pause(cur, Date.now()));
    },
    { layer: "shell", checked: active && s.phase === "focus" },
  );

  const begin = () => {
    askNotificationPermission();
    set(start(current(), Date.now(), { config: FOCUS_PRESETS[presetIndex]!.config, moduleId: moduleId ?? null }));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {s.phase === "idle" ? (
          <button type="button" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Fokus-Timer (Pomodoro)" aria-label="Fokus-Timer">
            <Timer className="size-4" />
            <span className="hidden md:inline">Fokus</span>
          </button>
        ) : (
          <button
            type="button"
            className={cn("flex h-8 items-center gap-1.5 rounded-full border px-2 text-[13px] font-semibold tabular-nums transition-colors hover:bg-accent", isPaused(s) ? "text-muted-foreground" : tone)}
            title={`${isBreak ? "Pause" : "Fokus"}${mod ? ` · ${mod.name}` : ""}`}
            aria-label={`${isBreak ? "Pause" : "Fokus"}, noch ${formatClock(left)}`}
          >
            {isPaused(s) ? <Pause className="size-3.5" /> : isBreak ? <Coffee className="size-3.5" /> : <TimerRing value={pct} size={16} stroke={2.5} />}
            {formatClock(left)}
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-xl border bg-background p-4 shadow-xl outline-none">
          {s.phase === "idle" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Fokus-Session</p>
                <p className="text-xs text-muted-foreground">Ein Fach, ein Block, keine Ablenkung. Danach kurz Pause.</p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Fach</span>
                <select
                  value={moduleId ?? ""}
                  onChange={(e) => setPick({ moduleId: e.target.value || null, preset: presetIndex })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <option value="">Ohne Fach</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Dauer">
                {FOCUS_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    type="button"
                    role="radio"
                    aria-checked={i === presetIndex}
                    onClick={() => setPick({ moduleId: moduleId ?? null, preset: i })}
                    className={cn("rounded-lg border py-2 text-center transition-colors", i === presetIndex ? "border-foreground bg-accent" : "hover:bg-accent")}
                  >
                    <span className="block text-sm font-semibold tabular-nums">{p.config.focus} min</span>
                    <span className="block text-[11px] text-muted-foreground">{p.config.brk} min Pause</span>
                  </button>
                ))}
              </div>
              <ZenToggle s={s} />
              <Button className="w-full" onClick={begin}>
                <Play className="size-4" /> Fokus starten
              </Button>
              <FocusStats stats={stats} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 pt-1">
                <TimerRing value={pct} size={132} stroke={7} className={isPaused(s) ? "text-muted-foreground" : tone}>
                  <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{formatClock(left)}</span>
                  <span className="text-xs font-medium text-muted-foreground">{isPaused(s) ? "Pausiert" : isBreak ? (isLongBreak(s) ? "Lange Pause" : "Pause") : "Fokus"}</span>
                </TimerRing>
                {mod && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <ModuleDot color={mod.color} className="size-2" /> {mod.name}
                  </span>
                )}
                <div className="flex gap-1" aria-label={`Block ${(s.round % s.config.every) + (isBreak ? 0 : 1)} von ${s.config.every}`}>
                  {Array.from({ length: s.config.every }, (_, i) => {
                    const done = i < s.round % s.config.every || (isBreak && s.round % s.config.every === 0 && s.round > 0);
                    const currentBlock = !isBreak && i === s.round % s.config.every;
                    return <span key={i} className={cn("size-2 rounded-full", done ? "bg-[oklch(0.64_0.2_32)]" : currentBlock ? "bg-[oklch(0.64_0.2_32)]/40" : "bg-border")} />;
                  })}
                </div>
                {s.phase === "focus" && <p className="text-xs text-muted-foreground tabular-nums">{focusedMinutes(s, now)} min fokussiert</p>}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <TimerButton label={isPaused(s) ? "Weiter" : "Pause"} onClick={() => set(isPaused(s) ? resume(current(), Date.now()) : pause(current(), Date.now()))} primary>
                  {isPaused(s) ? <Play /> : <Pause />}
                </TimerButton>
                <TimerButton label="+5 min" onClick={() => set(extend(current(), 5))}>
                  <Plus />
                </TimerButton>
                <TimerButton
                  label={isBreak ? "Pause beenden" : "Zur Pause"}
                  onClick={() => (isBreak ? set(finishBreak(current())) : completeFocus(Date.now(), false))}
                >
                  <SkipForward />
                </TimerButton>
                <TimerButton
                  label="Beenden"
                  onClick={() => {
                    if (s.phase === "focus") completeFocus(Date.now(), true);
                    else set(stop(current()));
                    setOpen(false);
                  }}
                >
                  <Square />
                </TimerButton>
              </div>
              <ZenToggle s={s} />
              <FocusStats stats={stats} />
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TimerButton({ label, onClick, primary, children }: { label: string; onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition-colors [&_svg]:size-4",
        primary ? "border-foreground bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function ZenToggle({ s }: { s: FocusState }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
      <EyeOff className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Fokusmodus</span>
        <span className="block text-xs text-muted-foreground">Navigation & XP ausblenden, solange du fokussierst</span>
      </span>
      <input type="checkbox" checked={s.zen} onChange={(e) => set({ ...current(), zen: e.target.checked })} className="size-4 accent-foreground" />
    </label>
  );
}

function FocusStats({ stats }: { stats: Stats | null | false }) {
  if (stats === false) return null;
  if (!stats) return <div className="h-14 animate-pulse rounded-lg bg-muted" />;
  const max = Math.max(1, ...stats.byModule.map((m) => m.minutes));
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex justify-between text-xs">
        <span>
          <span className="font-semibold tabular-nums">Heute {fmtMinutes(stats.todayMin)}</span>
          <span className="text-muted-foreground"> · {stats.todayBlocks} {stats.todayBlocks === 1 ? "Block" : "Blöcke"}</span>
        </span>
        <span className="text-muted-foreground tabular-nums">Woche {fmtMinutes(stats.weekMin)}</span>
      </div>
      {stats.byModule.slice(0, 4).map((m) => (
        <div key={m.name} className="flex items-center gap-2 text-xs">
          {m.color ? <ModuleDot color={m.color} className="size-1.5" /> : <span className="size-1.5 rounded-full bg-border" />}
          <span className="w-24 truncate">{m.name}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${(m.minutes / max) * 100}%` }} />
          </span>
          <span className="w-14 text-right text-muted-foreground tabular-nums">{fmtMinutes(m.minutes)}</span>
        </div>
      ))}
      {stats.weekMin === 0 && <p className="text-xs text-muted-foreground">Diese Woche noch keine Fokus-Blöcke.</p>}
    </div>
  );
}

/** Thin progress line under the header while a block runs. */
export function FocusProgressLine() {
  const s = useFocusState();
  const now = useNow(isRunning(s), s.endsAt);
  if (s.phase === "idle") return null;
  return (
    <span className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5" aria-hidden>
      <span className={cn("block h-full transition-[width] duration-500", s.phase === "break" ? "bg-success" : "bg-[oklch(0.64_0.2_32)]", isPaused(s) && "opacity-40")} style={{ width: `${progress(s, now) * 100}%` }} />
    </span>
  );
}
