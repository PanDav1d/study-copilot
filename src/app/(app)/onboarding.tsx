"use client";

import { useState } from "react";
import { Brain, CalendarDays, GraduationCap, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SemesterDialog } from "@/components/forms/semester-dialog";

const STEPS = [
  { icon: GraduationCap, title: "Semester & Module anlegen", text: "Strukturiere dein Studium mit Prüfungsterminen und -inhalten." },
  { icon: CalendarDays, title: "Vorlesungen eintragen", text: "Wiederkehrende Termine erzeugen automatisch Sitzungen." },
  { icon: NotebookPen, title: "Sitzungen mitschreiben", text: "Cornell-Methode: Notizen rechts, Fragen links, Zusammenfassung unten – geführt in 5 Schritten." },
  { icon: Brain, title: "Mit FSRS wiederholen", text: "Fragen werden zu Karteikarten, die genau dann wiederkommen, wenn du sie zu vergessen drohst." },
];

export function Onboarding({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Willkommen, {name.split(" ")[0]}!</h1>
      <p className="mt-1 text-muted-foreground">In vier Schritten zu deinem persönlichen Study Copilot.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <Card key={title} className="flex gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium">{i + 1}. {title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
            </div>
          </Card>
        ))}
      </div>
      <Button size="lg" className="mt-6" onClick={() => setOpen(true)}>Erstes Semester anlegen</Button>
      {open && <SemesterDialog open onOpenChange={setOpen} />}
    </div>
  );
}
