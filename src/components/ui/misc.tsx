import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { moduleColor } from "@/lib/constants";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "border-border text-muted-foreground",
    primary: "border-transparent bg-primary text-primary-foreground",
    success: "border-success/25 bg-success/8 text-success",
    warning: "border-warning/40 bg-warning/10 text-amber-700 dark:text-warning",
    danger: "border-danger/25 bg-danger/8 text-danger",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-xs font-medium whitespace-nowrap [&_svg]:size-3", tones[tone], className)}>
      {children}
    </span>
  );
}

export function ModuleDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", moduleColor(color).dot, className)} />;
}

export function ModuleTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium", moduleColor(color).soft, className)}>
      <ModuleDot color={color} className="size-1.5" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && <div className="mb-3 text-[13px] text-muted-foreground">{breadcrumbs}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">{title}</h1>
          {description && <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Progress({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "success" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-primary/10", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", tone === "success" ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none">{children}</kbd>;
}
