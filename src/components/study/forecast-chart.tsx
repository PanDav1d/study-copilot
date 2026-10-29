import { fmtDate } from "@/lib/dates";

/** Simple bar chart of upcoming due reviews per day. */
export function ForecastChart({ data }: { data: { date: Date; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-1" role="list" aria-label="Fällige Wiederholungen der nächsten Tage">
        {data.map((d, i) => (
          <div key={i} role="listitem" className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${fmtDate(d.date, "EEE, dd.MM.")}: ${d.count} Karten`}>
            <span className="text-[0.65rem] text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100">{d.count}</span>
            <div
              className={i === 0 ? "w-full rounded-sm bg-chart" : "w-full rounded-sm bg-chart/35 transition-colors group-hover:bg-chart/60"}
              style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[0.65rem] text-muted-foreground">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">{i === 0 ? "Heute" : i % 2 === 0 ? fmtDate(d.date, "EEEEEE") : ""}</span>
        ))}
      </div>
    </div>
  );
}

/** Heatmap of review activity (weeks × weekdays). */
export function ActivityHeatmap({ data, unit = "Wiederholungen" }: { data: { date: Date; count: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  // Pad the start so columns line up with Monday-based weeks.
  const offset = (data[0]!.date.getDay() + 6) % 7;
  const cells = [...Array.from({ length: offset }, () => null), ...data];
  const level = (c: number) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4)));
  const shades = ["bg-muted", "bg-chart/25", "bg-chart/45", "bg-chart/70", "bg-chart"];
  return (
    <div className="grid w-fit max-w-full grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto" style={{ gridAutoColumns: "12px", gridTemplateRows: "repeat(7, 12px)" }} role="img" aria-label="Lernaktivität der letzten Wochen">
      {cells.map((d, i) =>
        d ? (
          <div key={i} className={`size-3 rounded-[3px] ${shades[level(d.count)]}`} title={`${fmtDate(d.date, "EEE, dd.MM.")}: ${d.count} ${unit}`} />
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}
