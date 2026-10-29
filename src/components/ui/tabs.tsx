import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (shareable, back-button friendly, server rendered). */
export function LinkTabs({ tabs, active, className }: { tabs: { key: string; label: string; href: string; count?: number | string }[]; active: string; className?: string }) {
  return (
    <nav className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)} aria-label="Bereiche">
      <div className="flex min-w-max gap-5 border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pt-1 pb-2.5 text-sm font-medium transition-colors",
              t.key === active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
