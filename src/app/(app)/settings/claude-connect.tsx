"use client";

import { Check, Plug, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { connectClaude, disconnectClaude } from "@/server/actions/claude";
import type { ClaudeTarget, TargetStatus } from "@/server/claude-connect";

const TARGETS: { target: ClaudeTarget; name: string; after: string; missing: string }[] = [
  {
    target: "desktop",
    name: "Claude Desktop",
    after: "Claude Desktop einmal beenden und neu öffnen – dann ist Study Copilot unter „Connectors“ aktiv.",
    missing: "Nicht installiert – claude.ai/download",
  },
  {
    target: "code",
    name: "Claude Code",
    after: "Gilt ab der nächsten Claude-Code-Sitzung.",
    missing: "Nicht gefunden",
  },
];

const EXAMPLES = [
  "Fass meine letzte Sitzung in Datenbanken zusammen.",
  "Mach Karteikarten aus der Sitzung von heute.",
  "Welche Sitzungen haben noch keine Zusammenfassung?",
  "Plane bis zur Mathe-Klausur Lerneinheiten ein.",
];

export function ClaudeConnect({ status }: { status: Record<ClaudeTarget, TargetStatus> }) {
  return (
    <Card>
      <CardHeader
        title="Claude verbinden"
        description="Claude kann dann deine Module und Mitschriften lesen, Notizen ergänzen, Zusammenfassungen schreiben, Karteikarten anlegen und Lerneinheiten planen. Löschen kann Claude nichts. Alles bleibt auf deinem Mac, die App muss dafür nicht geöffnet sein."
      />
      <CardBody className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {TARGETS.map((t) => (
            <TargetRow key={t.target} {...t} status={status[t.target]} />
          ))}
        </ul>
        <div className="text-[13px] text-muted-foreground">
          <p className="mb-1.5">Danach einfach fragen, z. B.:</p>
          <ul className="space-y-1">
            {EXAMPLES.map((e) => (
              <li key={e} className="before:mr-1.5 before:content-['›']">„{e}“</li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}

function TargetRow({ target, name, after, missing, status }: (typeof TARGETS)[number] & { status: TargetStatus }) {
  const connect = useAction(connectClaude, { success: `${name} verbunden. ${after}` });
  const disconnect = useAction(disconnectClaude, { success: `${name} getrennt` });
  const outdated = status.connected && !status.current;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        {name}
        {!status.installed ? (
          <Badge>{missing}</Badge>
        ) : outdated ? (
          <Badge tone="warning">Veraltet</Badge>
        ) : status.connected ? (
          <Badge tone="success"><Check /> Verbunden</Badge>
        ) : null}
      </div>
      {status.installed && (
        <div className="flex items-center gap-2">
          {status.connected && (
            <Button variant="ghost" size="sm" loading={disconnect.pending} onClick={() => disconnect.run({ target })}>
              <Unplug className="size-4" /> Trennen
            </Button>
          )}
          {(!status.connected || outdated) && (
            <Button size="sm" loading={connect.pending} onClick={() => connect.run({ target })}>
              {outdated ? <RefreshCw className="size-4" /> : <Plug className="size-4" />}
              {outdated ? "Aktualisieren" : "Verbinden"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
