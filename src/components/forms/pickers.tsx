"use client";

import { Select } from "@/components/ui/form";
import { fmtDate } from "@/lib/dates";
import { useStudyData } from "@/components/shell/study-data";

export function SemesterSelect({ value, onChange, id, allowEmpty }: { value: string; onChange: (v: string) => void; id?: string; allowEmpty?: string }) {
  const { tree } = useStudyData();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {tree.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </Select>
  );
}

export function ModuleSelect({
  value,
  onChange,
  id,
  allowEmpty,
  semesterId,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  allowEmpty?: string;
  semesterId?: string;
}) {
  const { tree } = useStudyData();
  const semesters = semesterId ? tree.filter((s) => s.id === semesterId) : tree;
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : !value && <option value="" disabled>Modul wählen…</option>}
      {semesters.map((s) =>
        s.modules.length ? (
          <optgroup key={s.id} label={s.name}>
            {s.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ""}{m.name}
              </option>
            ))}
          </optgroup>
        ) : null,
      )}
    </Select>
  );
}

/** Sessions (Cornell notes) of a module, newest first. */
export function SessionSelect({
  moduleId,
  value,
  onChange,
  id,
  emptyLabel = "Keine Sitzung",
}: {
  moduleId: string;
  value: string;
  onChange: (v: string) => void;
  id?: string;
  emptyLabel?: string;
}) {
  const { tree } = useStudyData();
  const mod = tree.flatMap((s) => s.modules).find((m) => m.id === moduleId);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!mod}>
      <option value="">{emptyLabel}</option>
      {mod?.notes.map((l) => (
        <option key={l.id} value={l.id}>
          {fmtDate(new Date(l.date), "EE dd.MM.yyyy")}{l.title ? ` – ${l.title}` : ""}
        </option>
      ))}
    </Select>
  );
}

export function DocumentMultiSelect({
  value,
  onChange,
  moduleId,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  moduleId?: string;
}) {
  const { documents } = useStudyData();
  // Documents of the selected module first, then all others.
  const sorted = [...documents].sort((a, b) => Number(b.moduleId === moduleId) - Number(a.moduleId === moduleId));
  if (documents.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Unterlagen hochgeladen.</p>;
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
      {sorted.map((d) => (
        <label key={d.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={value.includes(d.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))}
          />
          <span className="truncate">{d.title}</span>
          {d.module && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{d.module.name}</span>}
        </label>
      ))}
    </div>
  );
}
