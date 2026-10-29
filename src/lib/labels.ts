import { fmtDate } from "./dates";

type SessionLike = { title: string; date: Date | string };

/** A session is identified by its date; the topic (title) is optional. */
export function sessionTitle(session: SessionLike) {
  return session.title.trim() || `Sitzung vom ${fmtDate(new Date(session.date), "EE dd.MM.yyyy")}`;
}

/** Compact label with date, e.g. for links: "Normalisierung (20.10.)". */
export function sessionLabel(session: SessionLike) {
  const title = session.title.trim();
  return title ? `${title} (${fmtDate(new Date(session.date), "dd.MM.")})` : `Sitzung vom ${fmtDate(new Date(session.date), "EE dd.MM.yyyy")}`;
}
