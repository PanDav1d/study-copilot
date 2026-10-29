"use client";

import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { useAction } from "@/hooks/use-action";
import { changePassword, updateSettings } from "@/server/actions/auth";

export function SettingsForms({
  user,
  dataDir,
  claude,
}: {
  /** Desktop app: the chosen data folder (no passwords there). */
  dataDir?: string | null;
  /** Desktop app: "Claude verbinden" card, rendered below the learning settings. */
  claude?: ReactNode;
  user: { name: string; requestRetention: number; maximumInterval: number; enableFuzz: boolean; dailyNewLimit: number; dailyXpGoal: number };
}) {
  const [form, setForm] = useState({
    name: user.name,
    requestRetention: Math.round(user.requestRetention * 100),
    maximumInterval: user.maximumInterval,
    enableFuzz: user.enableFuzz,
    dailyNewLimit: user.dailyNewLimit,
    dailyXpGoal: user.dailyXpGoal,
  });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const save = useAction(updateSettings, { success: "Einstellungen gespeichert" });
  const pwAction = useAction(changePassword, { success: "Passwort geändert", refresh: false });

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader title="Lernen (FSRS)" description="Steuert, wie der Wiederholungsalgorithmus plant." />
        <CardBody>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.run({ ...form, requestRetention: form.requestRetention / 100 });
            }}
          >
            <Field label="Name" htmlFor="st-name" error={save.fieldErrors.name} className="sm:col-span-2">
              <Input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={`Gewünschte Behaltensquote: ${form.requestRetention} %`} htmlFor="st-ret" error={save.fieldErrors.requestRetention} hint="Höher = häufigere Wiederholungen, sichereres Wissen. 90 % ist ein bewährter Standard; vor Prüfungen sind 92–95 % sinnvoll." className="sm:col-span-2">
              <input id="st-ret" type="range" min={70} max={98} value={form.requestRetention} onChange={(e) => setForm({ ...form, requestRetention: Number(e.target.value) })} className="accent-primary" />
            </Field>
            <Field label="Neue Karten pro Tag" htmlFor="st-new" error={save.fieldErrors.dailyNewLimit} hint="Begrenzt die tägliche Lernlast.">
              <Input id="st-new" type="number" min={0} max={500} value={form.dailyNewLimit} onChange={(e) => setForm({ ...form, dailyNewLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Maximales Intervall (Tage)" htmlFor="st-max" error={save.fieldErrors.maximumInterval} hint="365 hält Wissen über das Studium hinweg präsent.">
              <Input id="st-max" type="number" min={7} max={36500} value={form.maximumInterval} onChange={(e) => setForm({ ...form, maximumInterval: Number(e.target.value) })} />
            </Field>
            <Field label="Tagesziel (XP)" htmlFor="st-goal" error={save.fieldErrors.dailyXpGoal} hint="≈ 10 Karten oder eine komplett bearbeitete Sitzung pro 50 XP. Lieber klein und täglich als groß und selten.">
              <Input id="st-goal" type="number" min={10} max={1000} step={10} value={form.dailyXpGoal} onChange={(e) => setForm({ ...form, dailyXpGoal: Number(e.target.value) })} />
            </Field>
            <Checkbox className="sm:col-span-2" label="Intervalle leicht streuen (verhindert, dass viele Karten am selben Tag fällig werden)" checked={form.enableFuzz} onChange={(e) => setForm({ ...form, enableFuzz: e.target.checked })} />
            <div className="sm:col-span-2"><Button type="submit" loading={save.pending}>Speichern</Button></div>
          </form>
        </CardBody>
      </Card>

      {claude && <div id="claude" className="scroll-mt-24">{claude}</div>}

      {dataDir !== undefined ? (
        <Card>
          <CardHeader title="Datenordner" description="Datenbank, PDFs und tägliche Backups liegen hier – z. B. in iCloud Drive, dann sind sie auf deinen Macs synchron." />
          <CardBody className="space-y-2 text-sm">
            <code className="block rounded-md border bg-muted/40 px-3 py-2 text-xs break-all">{dataDir ?? "–"}</code>
            <p className="text-muted-foreground">Ändern oder im Finder zeigen über das App-Menü <strong className="font-medium text-foreground">Study Copilot → Datenordner</strong>. Öffne die App nicht auf zwei Macs gleichzeitig.</p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Passwort ändern" />
          <CardBody>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if ((await pwAction.run(pw)) !== undefined) setPw({ currentPassword: "", newPassword: "" });
              }}
            >
              <Field label="Aktuelles Passwort" htmlFor="pw-cur" error={pwAction.fieldErrors.currentPassword}>
                <Input id="pw-cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
              </Field>
              <Field label="Neues Passwort" htmlFor="pw-new" error={pwAction.fieldErrors.newPassword} hint="Mindestens 10 Zeichen.">
                <Input id="pw-new" type="password" autoComplete="new-password" minLength={10} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
              </Field>
              <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={pwAction.pending}>Passwort ändern</Button></div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Datensicherung" description="Export aller Semester, Module, Sitzungen, Karteikarten inkl. Lernhistorie und Termine als JSON. PDFs liegen im Upload-Verzeichnis des Servers." />
        <CardBody>
          <a href="/api/export" className={buttonClass("secondary")}><Download className="size-4" /> Daten exportieren</a>
        </CardBody>
      </Card>
    </div>
  );
}
