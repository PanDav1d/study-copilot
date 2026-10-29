"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fmtDate, parseGermanDate, parseGermanTime, parseLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "./form";

/** "yyyy-MM-dd" → "21.10.2026" */
function showDate(value: string) {
  const d = value ? parseLocalDate(value.slice(0, 10)) : null;
  return d ? fmtDate(d, "dd.MM.yyyy") : "";
}

/** Text field that keeps what is typed until it parses, and re-syncs when the value changes from outside. */
function useDraft(value: string, display: (v: string) => string) {
  const [draft, setDraft] = useState(() => display(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(display(value));
  }
  return [draft, setDraft] as const;
}

/**
 * Date (and optional time) field in German format, independent of the
 * browser/system language: "21.10.2026" and "09:30" instead of the native
 * locale-dependent inputs. Values stay "yyyy-MM-dd" / "yyyy-MM-ddTHH:mm".
 * The calendar button opens the native picker for clicking a day.
 */
export function DateInput({
  value,
  onChange,
  withTime = false,
  id,
  required,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const datePart = value.slice(0, 10);
  const timePart = value.slice(11, 16);
  const [dateDraft, setDateDraft] = useDraft(datePart, showDate);
  const [timeDraft, setTimeDraft] = useDraft(timePart, (v) => v);
  const picker = useRef<HTMLInputElement>(null);

  const emit = (date: string, time: string) => onChange(withTime ? `${date}T${time || "09:00"}` : date);
  const h = size === "sm" ? "h-7 text-[13px]" : "h-9";

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          value={dateDraft}
          inputMode="numeric"
          placeholder="TT.MM.JJJJ"
          required={required}
          aria-label={ariaLabel}
          autoComplete="off"
          className={cn(h, "pr-8 tabular-nums", size === "sm" && "px-2")}
          onChange={(e) => {
            setDateDraft(e.target.value);
            // Only complete dates count while typing – "1.1" must not jump to January already.
            const full = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(e.target.value.trim()) || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value.trim());
            const parsed = full ? parseGermanDate(e.target.value) : null;
            if (parsed) emit(parsed, timePart);
          }}
          onBlur={() => {
            const parsed = parseGermanDate(dateDraft);
            if (parsed) {
              setDateDraft(showDate(parsed));
              if (parsed !== datePart) emit(parsed, timePart);
            } else if (!dateDraft.trim() && !required) onChange("");
            else setDateDraft(showDate(datePart));
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Kalender öffnen"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            try {
              picker.current?.showPicker();
            } catch {
              picker.current?.click();
            }
          }}
        >
          <CalendarDays className="size-3.5" />
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={datePart}
          onChange={(e) => e.target.value && emit(e.target.value, timePart)}
          className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        />
      </div>
      {withTime && (
        <Input
          value={timeDraft}
          inputMode="numeric"
          placeholder="HH:MM"
          aria-label={ariaLabel ? `${ariaLabel} – Uhrzeit` : "Uhrzeit"}
          autoComplete="off"
          className={cn(h, "w-[4.75rem] shrink-0 text-center tabular-nums")}
          onChange={(e) => {
            setTimeDraft(e.target.value);
            if (/^\d{1,2}[:.]\d{2}$/.test(e.target.value.trim())) {
              const t = parseGermanTime(e.target.value);
              if (t && datePart) emit(datePart, t);
            }
          }}
          onBlur={() => {
            const t = parseGermanTime(timeDraft);
            if (t) {
              setTimeDraft(t);
              if (t !== timePart && datePart) emit(datePart, t);
            } else setTimeDraft(timePart);
          }}
        />
      )}
    </div>
  );
}
