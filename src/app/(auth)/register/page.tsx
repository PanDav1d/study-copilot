import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, registrationOpen } from "@/server/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Registrieren" };

export default async function RegisterPage() {
  await connection();
  if (await getCurrentUser()) redirect("/");
  if (!(await registrationOpen())) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm shadow-sm">
        <p className="font-medium">Die Registrierung ist deaktiviert.</p>
        <p className="mt-1 text-muted-foreground">
          Setze <code>ALLOW_REGISTRATION=true</code>, um weitere Konten zu erlauben.
        </p>
        <Link href="/login" className="mt-4 inline-block font-medium text-primary hover:underline">Zur Anmeldung</Link>
      </div>
    );
  }
  return <AuthForm mode="register" canRegister />;
}
