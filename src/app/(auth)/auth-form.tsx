"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { login, register, type AuthFormState } from "@/server/actions/auth";

export function AuthForm({ mode, next, canRegister }: { mode: "login" | "register"; next?: string; canRegister: boolean }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(mode === "login" ? login : register, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{mode === "login" ? "Anmelden" : "Konto erstellen"}</h2>
      {state?.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {mode === "register" && (
        <Field label="Name" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </Field>
      )}
      <Field label="E-Mail" htmlFor="email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field
        label="Passwort"
        htmlFor="password"
        error={fe.password}
        hint={mode === "register" ? "Mindestens 10 Zeichen." : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "register" ? 10 : undefined}
        />
      </Field>
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" className="w-full" loading={pending}>
        {mode === "login" ? "Anmelden" : "Registrieren"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          canRegister ? (
            <>
              Noch kein Konto? <Link href="/register" className="font-medium text-primary hover:underline">Registrieren</Link>
            </>
          ) : null
        ) : (
          <>
            Bereits registriert? <Link href="/login" className="font-medium text-primary hover:underline">Anmelden</Link>
          </>
        )}
      </p>
    </form>
  );
}
