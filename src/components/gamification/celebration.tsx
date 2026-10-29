"use client";

import { useEffect, useState } from "react";
import { onCelebrate } from "./reward";

const COLORS = ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

/** Short, light confetti burst for milestones. Respects reduced motion. */
export function Celebration() {
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(
    () =>
      onCelebrate(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setBurst(Date.now());
      }),
    [],
  );

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1800);
    return () => clearTimeout(t);
  }, [burst]);

  if (!burst) return null;
  return (
    <div key={burst} className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {Array.from({ length: 70 }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 0.03;
        const drift = ((i * 53) % 60) - 30;
        const size = 6 + (i % 4) * 2;
        return (
          <span
            key={i}
            className="confetti absolute top-[-12px] block rounded-[2px]"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 0.45,
              background: COLORS[i % COLORS.length],
              animationDelay: `${delay}s`,
              ["--drift" as string]: `${drift}vw`,
              ["--spin" as string]: `${(i % 2 ? 1 : -1) * (360 + i * 20)}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
