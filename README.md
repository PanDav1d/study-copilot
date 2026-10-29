# DHBW Study Copilot

Persönlicher Lernbegleiter für das DHBW-Studium: Semester- und Modulverwaltung, Cornell-Notizen pro Sitzung, Kalender mit Lernplanung, Karteikarten mit **FSRS**-Spaced-Repetition und PDF-Unterlagen. Alles ist miteinander verknüpft.

## Funktionen

| Bereich | Was es kann |
| --- | --- |
| **Semester & Module** | Hierarchie Semester → Modul → Sitzung. Pro Modul: Beschreibung, Dozent, ECTS, Farbe, **Raum** (wird neuen Terminen automatisch als Ort eingetragen), Prüfungsform/-termin/-dauer/-ort. **Gemeinsame Prüfung:** mehrere Module können in einer Prüfung enden – die Prüfungsdaten gelten für alle, Kalender und Übersicht zeigen sie einmal. |
| **Tab „Prüfung“ im Modul** | Prüfungsinhalte als **Checkliste zum Abhaken** direkt im gerenderten Text (Fortschritt im Tab, auf der Modul-Übersicht und im Dashboard), „Thema hinzufügen“ per ↵, Vorlage für den Anfang, ⇧⌘L macht markierte Zeilen zu Aufgaben. Hinweise (Hilfsmittel, Zulassung …), Eckdaten mit Countdown, Lernplan/Prüfungsmodus/Probeklausur mit einem Klick. Autosave; bei gemeinsamer Prüfung ein Text für alle Module. Die Übersicht zeigt lange Texte nur als Ausschnitt. |
| **Sitzungen (Cornell)** | Eine Sitzung *ist* die Mitschrift eines Vorlesungstags – identifiziert über Datum, Thema optional. Zweispaltiges Blatt: links Stichwort/Frage, rechts Notizen, unten Zusammenfassung. Autosave, Markdown, PDF-Links mit Seitenzahl (`doc:<id>#page=5`). **Daneben öffnen:** PDF oder andere Sitzung rechts neben der Mitschrift. |
| **Tabs & Split-View** | Alles öffnet als Tab: Seiten, Fächer, Sitzungen, Unterlagen. Sitzungen, Unterlagen und Fächer bekommen eigene Tabs, normale Seiten wechseln im aktuellen Seiten-Tab. **Geteilte Ansicht:** beide Seiten scrollen unabhängig, jede mit schlanker Kopfzeile (Zurück/Vor, Tauschen, Nur diese Ansicht, Schließen); die aktive Seite ist markiert und bekommt „Öffnen …“. Trenner mit Griff, rastet bei ⅓ · ½ · ⅔ ein, Doppelklick = 50/50, per Tastatur verschiebbar, an den Rand ziehen schließt eine Seite. Tabs per Drag & Drop umsortieren oder auf eine Inhaltsseite ziehen; Rechtsklick auf einen Tab: links/rechts öffnen, tauschen, andere/rechte Tabs schließen. PDF-Links in Notizen öffnen daneben (⌘-Klick: als Tab) und springen im offenen PDF direkt zur Seite. **Tasten:** ⌘O Öffnen, ⌘⇧\\ geteilte Ansicht an/aus, ⌘⌥←/→ Seite wechseln, Ctrl+Tab / ⌘⇧[ ] Tabs – funktionieren auch, wenn die rechte Seite den Fokus hat. Nur sichtbare Tabs werden gerendert, kein Prefetch. |
| **Geführt nach der 5R-Methode** | Mitschreiben → Fragen formulieren → Abfragen → Zusammenfassen → Karteikarten. Die Sitzung zeigt immer genau *einen* nächsten Schritt mit einem Button. Beim Fragen-Schritt Warum/Wie-Fragestämme (elaboratives Fragen). **Aufwärmen:** Eine neue, leere Sitzung zeigt Fragen der letzten Sitzung des Moduls zum Selbsttest (Forward-Testing-Effekt). |
| **Lernplan** | Jederzeit: *Übersicht → Prüfungen*, Kalender, Tab „Prüfung“ oder ⌥⌘L. **Bis zur Prüfung:** für alle Prüfungen des nächsten halben Jahres, **Lernbeginn frei wählbar** (2–8 Wochen vorher oder „ab heute“) – verteilt (Abstände werden zur Prüfung hin kürzer, früher Start = zusätzliche kurze Auffrisch-Runden), gemischt (nie zweimal dasselbe Modul am Tag), jede Vorbereitung beginnt mit einem Überblick, Generalprobe 3 Tage und kurze letzte Runde 1 Tag vorher. **Jede Woche:** auch ohne Prüfungstermin ein kurzer Wochenrückblick pro Modul, am Tag nach dessen Vorlesung. Vorschau mit **Zeitstrahl** pro Prüfung/Modul vor dem Eintragen; um Vorlesungen und Termine herum, eigene Lerneinheiten zählen mit. Der ganze Plan ist eine Serie und lässt sich auf einmal löschen. Hausarbeiten/Projekte werden ausgelassen. |
| **Menüleiste & Tastenkürzel** | Native macOS-Menüleiste (Ablage, Bearbeiten, Darstellung, **Sitzung**, Gehe zu, Lernen, Fenster, Hilfe) mit Häkchen für den aktuellen Zustand; Punkte, die gerade nicht passen, sind ausgegraut. In der Sitzung: **Schreiben ⌘1 · Lesen ⌘2 · Abfragen ⌘3**, nächster 5R-Schritt ⇧⌘↩, Karteikarten aus Zeilen ⇧⌘K, Als Markdown kopieren. Markdown-Formatierung in allen Textfeldern (⌘B, ⌘I, ⌥⌘C, ⇧⌘L), ⌘N/⇧⌘N/⌥⌘N neu, ⌘W/⇧⌘T Tabs, ⌘[ ⌘] zurück/vor, ⌥⌘1–9 Bereiche, ⌘L fällige Karten, ⌥⌘P Fokus-Timer, ⇧⌘D Design, ⌘P Drucken (sauberes Cornell-Blatt), ⌘± Zoom. **Befehlspalette ⇧⌘P**, **Übersicht aller Kürzel ⌘/** (oder „?“). Befehle gehen immer an die fokussierte Seite der geteilten Ansicht. Im Browser gilt dasselbe (soweit der Browser die Taste nicht selbst belegt). |
| **Abfragen (Recite)** | Notizen pro Zeile verdeckt, erst antworten, dann aufdecken und ehrlich einschätzen (gewusst / nicht gewusst). Die Lücken werden mit einem Klick zu Karteikarten. |
| **Erinnerungen** | „Zu erledigen“ auf der Übersicht: fehlende Zusammenfassungen (Ziel: innerhalb von 24 h), Vorlesungen ohne Mitschrift, verpasste Lerneinheiten. Badge in der Navigation, Filter in „Sitzungen“. |
| **Karteikarten** | Markdown, Themen, Verknüpfung mit Notiz und PDFs, Suche/Filter nach Modul, Thema und Lernstatus, Pausieren, Zurücksetzen, Lernhistorie mit FSRS-Kennzahlen. Schnelleingabe („Speichern & nächste“). |
| **Lernbereich (FSRS)** | Fällige Karten, Antwort zuerst selbst formulieren, dann aufdecken und mit *Nochmal / Schwer / Gut / Einfach* bewerten (Intervallvorschau auf den Buttons). Lernschritte werden in der Sitzung wiederholt, Rückgängig (⌘Z), Tastaturbedienung. **Prüfungsmodus**: alle Karten eines Moduls/Themas, schwächste zuerst. |
| **Probeklausuren** | Prompt mit Modulinfos und den eigenen Cornell-Notizen kopieren → in ChatGPT, Claude & Co. einfügen → JSON-Antwort zurück einfügen (tolerant: Code-Fences, Fließtext drumherum, typografische Anführungszeichen; Fehler pro Aufgabe). Prüfungsmodus mit Timer und Zwischenstand, Lösungen erst nach Abgabe, Freitext ehrlich selbst bewerten, Notenschätzung (50 % = 4,0), Auswertung nach Thema, Verlauf, Fehler mit einem Klick → Karteikarten. |
| **Kalender** | Monats- und Wochenansicht (mobil als Agenda), Vorlesungen, Lerneinheiten, Fristen. Wöchentliche Serien, die auf Wunsch automatisch Sitzungen erzeugen. **Massenimport** aus .ics-Dateien oder Kalender-Links (z. B. Rapla-Export): Vorschau nach Veranstaltung, automatische Modulzuordnung, erneuter Import aktualisiert statt zu verdoppeln. Sitzungen und Vorlesungen desselben Moduls am selben Tag werden automatisch verknüpft. Prüfungen erscheinen automatisch aus den Moduldaten, fällige Karten pro Tag werden angezeigt. Lerneinheiten mit Thema/Notiz/PDF verknüpfbar, abhakbar, starten direkt die passende Lernsitzung. |
| **Unterlagen** | Upload per Drag-and-drop (mehrere PDFs), Zuordnung zu Semester/Modul/Sitzung. **Eigener PDF-Viewer (pdf.js):** merkt sich die Leseposition (lokal exakt, Seite zusätzlich auf dem Server – „Weiter bei Seite 12“), Seitenbreite/Ganze Seite/Zoom per ⌘± und Pinch, Volltextsuche mit Trefferliste (⌘F), Miniaturen, Inhaltsverzeichnis, klickbare Links, Drehen, dunkle Seiten, Vollbild. Text markieren → **Zitieren** (Markdown-Zitat mit Seitenlink) oder **Karteikarte** daraus. „Link zu Seite n kopieren“ für die Mitschrift. Die Seite steht in der URL, Tabs merken sie. |
| **Bilder & Folien-Ausschnitte** | Screenshots per ⌘V oder Drag & Drop direkt in Mitschrift, Zusammenfassung und Karteikarten. Im PDF-Viewer **Ausschnitt** (<kbd>A</kbd>): Bereich aufziehen, wird gestochen scharf neu gerendert und landet mit einem Klick als Bild + Seitenlink in der gerade offenen Sitzung (auch aus der anderen Hälfte des Split-Views), als Karteikarte, in der Zwischenablage oder als PNG. Bilder öffnen per Klick groß. |
| **Fokus-Timer (Pomodoro)** | Timer oben in der Leiste: Fach wählen (vorbelegt mit dem Fach der offenen Seite), 25/5, 50/10 oder 90/15, lange Pause nach jeder Runde. Pausieren, +5 min, überspringen; läuft über Neuladen hinweg weiter. **Fokusmodus** blendet Navigation und XP aus. Am Ende Ton, Systembenachrichtigung und Pause. Jeder Block ab 5 min wird gespeichert (Lernzeit heute/Woche pro Fach) und bringt XP. |
| **Gamification** | XP für lernwirksames Verhalten (auch falsche Antworten zählen), Level, Tagesziel-Ring, Serie, Combos in der Lernsitzung, 20 Erfolge, Konfetti nur für echte Meilensteine. Seite „Fortschritt“ erklärt transparent, wofür es XP gibt. |
| **Übersicht** | Fällige/überfällige Karten, Termine heute & 7 Tage, offene Lerneinheiten, Prüfungs-Countdown mit Lernstand, Prognose, Aktivitäts-Heatmap, Lernserie. |
| **Suche** | Global über Module, Sitzungen, Notizen, Karten, PDFs, Termine (⌘K). |
| **Einstellungen** | Gewünschte Behaltensquote, max. Intervall, neue Karten/Tag, Fuzz; Passwort; JSON-Export aller Daten. |

## Spaced Repetition

Die Lernlogik nutzt **FSRS** (Free Spaced Repetition Scheduler) über die Referenzimplementierung [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs). FSRS modelliert pro Karte *Schwierigkeit*, *Stabilität* und *Abrufwahrscheinlichkeit* und plant die nächste Wiederholung, wenn die Abrufwahrscheinlichkeit auf die gewünschte Behaltensquote (Standard 90 %) fällt.

Domänenlogik in [`src/lib/srs/scheduler.ts`](src/lib/srs/scheduler.ts) (ohne DB-Zugriff, vollständig getestet):

- **Warteschlange:** zuerst fällige Lernschritte, dann fällige Wiederholungen nach *niedrigster Abrufwahrscheinlichkeit* (Module mit Prüfung in ≤ 3 Wochen werden vorgezogen), dann neue Karten bis zum Tageslimit.
- **Lernstatus:** Neu · In Lernphase · Unsicher (Stabilität < 7 T oder Abruf < 80 %) · Gefestigt · Beherrscht (Stabilität ≥ 30 T).
- **Undo:** Jede Bewertung speichert den vorherigen Kartenzustand im `ReviewLog` → exaktes Rollback.

## Architektur

```
src/
  app/                 Next.js App Router (Server Components)
    (auth)/            Login & Registrierung
    (app)/             Authentifizierte App (Layout mit Navigation)
    api/               Upload, PDF-Auslieferung, Export (Route Handler)
  components/          UI (ui/ = Basiskomponenten, Rest nach Domäne)
  lib/                 Reine, testbare Logik: FSRS, Cornell, Validierung (zod), PDF-Prüfung, Auth-Helfer
  server/
    actions/           Server Actions (Mutationen) – alle über `authedAction` (Auth + zod + Fehlerbehandlung)
    services/          Schreiblogik ohne Next-Bezug (Sitzungen, Karteikarten, Termine) – genutzt von Actions und MCP
    queries/           Lesezugriffe für Seiten
    ownership.ts       Besitzprüfung aller vom Client übergebenen IDs
    storage.ts         Dateiablage
  mcp/                 MCP-Server: Tools für Claude & Co. (siehe „Claude & MCP“)
  proxy.ts             Weiterleitung nicht angemeldeter Anfragen
prisma/                Schema, Migrationen, Demo-Seed
tests/                 Vitest (Unit + DB-Integration)
```

- **Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript (strict), Tailwind CSS 4, Prisma 7 + SQLite (better-sqlite3), zod 4, ts-fsrs, Vitest.
- **Datenmodell:** `User → Semester → Module → Note` (Note = Sitzung, das Cornell-Blatt als JSON-Zeilen); `Flashcard` (+ `ReviewLog`), `Document` (n:m zu Sitzungen/Karten), `CalendarEvent` (Vorlesung → Sitzung), `Exam` (Fragen als normalisiertes JSON) + `ExamAttempt`, `XpEvent` (XP-Ledger, idempotent über `reason + refId`), `UserAchievement`. Jede Zeile trägt `userId`, damit jede Abfrage einfach auf den Nutzer eingeschränkt ist. Prüfungstermine liegen nur am Modul (keine doppelte Datenhaltung).
- **Warum SQLite?** Single-User-/Kleingruppen-App, null Betriebsaufwand, Backup = eine Datei. Für PostgreSQL genügt der Wechsel von `provider` und Adapter in `prisma/schema.prisma` bzw. `src/lib/db.ts`.

## Sicherheit

- Passwörter mit **scrypt** (Salt, timing-sichere Prüfung), signierte HttpOnly-Session-Cookies (HS256, SameSite=Lax, Secure in Produktion), Login-Rate-Limit.
- Doppelte Absicherung: `proxy.ts` leitet um, **jede** Seite/Action/Route prüft den Nutzer erneut; alle IDs aus dem Client werden auf Besitz geprüft (`server/ownership.ts`). Fremde Daten verhalten sich wie „nicht gefunden“.
- Alle Eingaben werden serverseitig mit zod validiert. Markdown wird ohne Roh-HTML gerendert; Links nur `http(s)`, `mailto`, relative und `doc:`.
- Uploads: Same-Origin-Prüfung (CSRF), Größenlimit, **Magic-Byte-Prüfung** (`%PDF-`), zufällige Dateinamen außerhalb von `public/`, Auslieferung nur über authentifizierten Endpunkt mit `nosniff` und sicherem `Content-Disposition`.
- Sicherheits-Header (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, …) in `next.config.ts`.
- Registrierung ist nur möglich, solange kein Konto existiert (oder `ALLOW_REGISTRATION=true`).

## Entwicklung

Voraussetzungen: Node.js ≥ 22, pnpm.

```bash
pnpm install
cp .env.example .env          # AUTH_SECRET setzen: openssl rand -base64 48
pnpm db:migrate               # legt data/study.db an
pnpm db:seed                  # optional: Demo-Daten (Zugang siehe prisma/seed.ts)
pnpm dev                      # http://localhost:3000
```

Beim ersten Aufruf ohne Seed führt die App direkt zur Registrierung.

| Skript | Zweck |
| --- | --- |
| `pnpm test` | Vitest: FSRS-Logik, Probeklausuren (Import, Bewertung, Prompt), Gamification (Level, Serie, 5R, Erfolge), Cornell-Zeilen, Upload-Validierung, Auth, Schemas, Besitzprüfungen & XP-Ledger (eigene Test-DB) |
| `pnpm lint` / `pnpm typecheck` | ESLint (inkl. React Compiler Regeln) / TypeScript |
| `pnpm build` / `pnpm start` | Produktionsbuild / -server |
| `pnpm db:deploy` | Migrationen in Produktion anwenden |
| `pnpm desktop:build` | macOS-App bauen (siehe Desktop-App) |

### Konfiguration (`.env`)

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | SQLite-Datei, z. B. `file:./data/study.db` |
| `UPLOAD_DIR` | Ablage der PDFs (nicht öffentlich) |
| `MAX_UPLOAD_MB` | Max. Größe pro Datei (Standard 50) |
| `AUTH_SECRET` | ≥ 32 Zeichen, signiert Sessions |
| `ALLOW_REGISTRATION` | weitere Konten erlauben (`true`/`false`) |
| `TZ` | Zeitzone für „heute“, Fälligkeiten, Kalender (Standard `Europe/Berlin`) |
| `MCP_USER_EMAIL` | nur MCP-Server: Konto, für das er arbeitet (nötig, wenn es mehrere gibt) |

## Desktop-App (macOS, Tauri)

Die App läuft auch als native Mac-App – ohne Login, mit einem **frei wählbaren Datenordner**, z. B. in iCloud Drive:

```
Study Copilot/            ← dein Ordner (z. B. iCloud Drive/Study Copilot)
  study.db                ← Datenbank (Journal-Modus DELETE: eine Datei, iCloud-freundlich)
  Unterlagen/             ← PDFs
  Backups/                ← tägliches Backup der Datenbank, die letzten 14 bleiben
  study.lock              ← welcher Mac die Daten gerade geöffnet hat
```

```bash
pnpm desktop:build        # → desktop/target/release/bundle/macos/Study Copilot.app (+ .dmg)
```

- **Aufbau:** Die Tauri-Hülle (`desktop/`) startet den Next.js-Server (Standalone-Build) mit einer mitgelieferten Node-Runtime auf einem zufälligen Port an `127.0.0.1`. Die Anmeldung läuft über ein Einmal-Token pro Start; das Webview hat keinen Zugriff auf Tauri-APIs. Migrationen und Backups erledigt `desktop/server-entry.mjs` beim Start.
- **Erster Start:** Ordner wählen („In iCloud Drive speichern“ mit einem Klick). Auf einem zweiten Mac einfach denselben Ordner wählen. Ändern über *Ablage → Datenordner*.
- **Menüleiste:** `desktop/src/main.rs` baut sie mit denselben IDs, Texten und Kürzeln wie `src/lib/commands.ts` (ein Test hält beide synchron). Ein Klick wird als `study:command`-Event in die Seite gegeben; die Seite meldet über `studycopilot://localhost/menu` zurück, welche Punkte gerade verfügbar bzw. abgehakt sind – Tauri-APIs bekommt das Webview weiterhin nicht. Drucken und Zoom erledigt die Hülle selbst.
- **Zwei Macs:** Eine SQLite-Datei verträgt keine gleichzeitigen Änderungen von zwei Geräten. Die App schreibt daher alle 30 s ein Lebenszeichen in `study.lock` und warnt, wenn der Ordner auf einem anderen Mac offen ist. Vor dem Wechsel die App auf dem einen Mac beenden und iCloud kurz synchronisieren lassen.
- **iCloud „Mac-Speicher optimieren“:** Ausgelagerte Datenbanken und PDFs werden beim Öffnen automatisch wieder geladen (`brctl download`).
- **Ausprobieren ohne echte Daten:** `STUDY_COPILOT_DATA_DIR=/pfad/zu/testordner pnpm desktop:dev` (nur in Debug-Builds) nimmt diesen Ordner, ohne ihn zu speichern.
- **Build-Voraussetzungen:** Rust, `cargo install tauri-cli`, Node 22 über nvm (offizieller, eigenständiger Build; alternativ `DESKTOP_NODE=/pfad/zu/node`). `better-sqlite3` wird für genau diese Node-Version geladen. Der Server-Log liegt unter `~/Library/Logs/app.studycopilot.desktop/server.log`.
- **Energie:** Das Lebenszeichen schläft 30 s am Stück (keine sekündlichen Wake-ups), keine Blur-Effekte auf mitscrollenden Leisten, Timer zeichnen im Hintergrund nicht neu, Tabs ohne Prefetch.
- Die App ist nicht signiert: beim ersten Öffnen per Rechtsklick → *Öffnen* bestätigen.

## Claude & MCP

Ein lokaler [MCP](https://modelcontextprotocol.io)-Server verbindet die Lerndaten mit Claude Desktop, Claude Code oder anderen MCP-Clients. Claude kann dann z. B. „Fass meine letzte Datenbanken-Sitzung zusammen und mach Karteikarten draus“ direkt erledigen.

| Lesen | Schreiben |
| --- | --- |
| `list_modules`, `get_module` (Prüfungsinfos, Lernstand, Sitzungen) | `create_session` (optional mit Zeilen und Zusammenfassung) |
| `list_sessions` (Modul, Suchbegriff, „ohne Zusammenfassung“) | `append_cornell_rows` (hängt an, ändert nichts Bestehendes) |
| `get_session` (komplettes Cornell-Blatt, PDFs, Karten) | `update_session` (Zusammenfassung, Thema, Datum) |
| `search`, `get_open_tasks`, `get_due_cards` | `create_flashcards`, `create_study_block` |

Dazu zwei Prompts (in Claude Desktop als Slash-Befehle): `sitzung_nachbereiten` und `pruefung_vorbereiten`. Es gibt bewusst **keine Lösch-Tools**. Alle Schreibzugriffe laufen über dieselbe Validierung, Besitzprüfung und XP-Logik wie die App (`src/server/services/`).

**In der Desktop-App: ein Klick.** *Einstellungen → Claude verbinden → Verbinden* trägt den mitgelieferten Server (`Resources/server/mcp-server.mjs`, läuft mit der Node-Runtime der App) in Claude Desktop (`claude_desktop_config.json`, andere Einträge bleiben unverändert) und/oder Claude Code (`claude mcp add-json --scope user`) ein. Danach Claude Desktop neu starten. Die App muss dafür nicht geöffnet sein. Der Server liest den Datenordner aus der App-Konfiguration und folgt damit auch einem Ordnerwechsel. Ist der Ordner gerade auf einem anderen Mac geöffnet (`study.lock`), lehnt er Änderungen ab; Lesen geht weiter. Wurde die App verschoben, zeigt die Karte „Veraltet“ mit *Aktualisieren*.

**Aus dem Projekt (Entwicklung):** `pnpm mcp` startet den Server per stdio (`scripts/mcp-server.ts`). Er liest die `.env` im Projekt; vom Client gesetzte Variablen haben Vorrang. Gibt es nur ein Konto, wird es automatisch gewählt, sonst `MCP_USER_EMAIL` setzen.

```bash
claude mcp add study-copilot --scope user -- pnpm --silent -C /pfad/zu/study mcp
```

Für Claude Desktop von Hand (`claude_desktop_config.json`). Apps aus dem Dock kennen den Shell-`PATH` nicht, deshalb wird er mitgegeben:

```json
{
  "mcpServers": {
    "study-copilot": {
      "command": "/opt/homebrew/bin/pnpm",
      "args": ["--silent", "-C", "/pfad/zu/study", "mcp"],
      "env": { "PATH": "/opt/homebrew/bin:/usr/bin:/bin" }
    }
  }
}
```

## Deployment

**Docker (empfohlen):**

```bash
AUTH_SECRET=$(openssl rand -base64 48) docker compose up -d --build
```

Datenbank und PDFs liegen im Volume `study-data` (`/data`). Migrationen laufen beim Start automatisch. Für den Betrieb im Internet einen Reverse Proxy mit HTTPS (z. B. Caddy, Traefik) davorschalten.

**Ohne Docker:** `pnpm install && pnpm build && pnpm db:deploy && pnpm start` (Umgebungsvariablen wie oben).

**Backup:** Das Verzeichnis `data/` sichern (SQLite-Datei + `uploads/`), z. B. per `sqlite3 data/study.db ".backup backup.db"`. Zusätzlich bietet *Einstellungen → Daten exportieren* einen JSON-Export.
