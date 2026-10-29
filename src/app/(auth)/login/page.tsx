import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isDesktop } from "@/lib/env";
import { getCurrentUser, registrationOpen } from "@/server/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection();
  if (await getCurrentUser()) redirect("/");
  if (isDesktop()) {
    return <p className="text-center text-sm text-muted-foreground">Die Sitzung ist abgelaufen. Bitte starte die App neu.</p>;
  }
  // First start: guide straight to account creation.
  if ((await db.user.count()) === 0) redirect("/register");
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next} canRegister={await registrationOpen()} />;
}
