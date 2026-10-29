"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { ModuleSelect } from "@/components/forms/pickers";

type FilterField = "module" | "q" | "topic" | "level";

/** URL-synchronised filter bar shared by the list pages. */
export function ListFilters({
  fields,
  topics = [],
  levels = [],
}: {
  fields: FilterField[];
  topics?: string[];
  levels?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "module") next.delete("topic");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Debounced search input.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {fields.includes("q") && (
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Durchsuchen …" className="pl-9" aria-label="Durchsuchen" />
        </div>
      )}
      {fields.includes("module") && (
        <div className="sm:w-64">
          <ModuleSelect value={params.get("module") ?? ""} onChange={(v) => set("module", v)} allowEmpty="Alle Module" />
        </div>
      )}
      {fields.includes("topic") && topics.length > 0 && (
        <div className="sm:w-48">
          <Select value={params.get("topic") ?? ""} onChange={(e) => set("topic", e.target.value)} aria-label="Thema">
            <option value="">Alle Themen</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
      )}
      {fields.includes("level") && (
        <div className="sm:w-48">
          <Select value={params.get("level") ?? ""} onChange={(e) => set("level", e.target.value)} aria-label="Lernstatus">
            <option value="">Alle Status</option>
            {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </div>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
    </div>
  );
}
