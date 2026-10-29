"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      className="mt-10"
      icon={AlertTriangle}
      title="Etwas ist schiefgelaufen"
      description={<>Die Seite konnte nicht geladen werden.{error.digest && <> Fehler-ID: <code>{error.digest}</code></>}</>}
      action={<Button onClick={reset}>Erneut versuchen</Button>}
    />
  );
}
