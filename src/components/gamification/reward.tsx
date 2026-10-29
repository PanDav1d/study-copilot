"use client";

import { toast } from "sonner";
import { levelTitle } from "@/lib/gamification";
import type { Reward } from "@/server/gamification";

const CELEBRATE = "study:celebrate";

/** Trigger the confetti overlay (see <Celebration />). */
export function celebrate() {
  window.dispatchEvent(new Event(CELEBRATE));
}

export function onCelebrate(handler: () => void) {
  window.addEventListener(CELEBRATE, handler);
  return () => window.removeEventListener(CELEBRATE, handler);
}

/**
 * Immediate, specific feedback right after the behaviour (operant
 * conditioning works best with short latency) – but quiet: small toasts, the
 * big celebration only for real milestones.
 */
export function showReward(reward: Reward | null | undefined, label?: string, opts: { quiet?: boolean } = {}) {
  if (!reward) return;
  if (reward.xp > 0 && !opts.quiet) {
    toast(`+${reward.xp} XP`, { description: label, duration: 2500 });
  }
  if (reward.goalReached) {
    toast.success("Tagesziel erreicht", { description: "Deine Serie ist für heute gesichert. 🔥" });
    celebrate();
  }
  if (reward.levelUp) {
    toast.success(`Level ${reward.levelUp} – ${levelTitle(reward.levelUp)}`, { description: "Du bist aufgestiegen!" });
    celebrate();
  }
  for (const a of reward.achievements) {
    toast(`${a.emoji} ${a.title}`, { description: `Erfolg freigeschaltet · ${a.description}`, duration: 6000 });
  }
  if (reward.achievements.length && !reward.levelUp && !reward.goalReached) celebrate();
}
