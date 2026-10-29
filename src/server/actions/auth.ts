"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { changePasswordSchema, loginSchema, registerSchema, settingsSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { clientIp, createSession, destroySession, registrationOpen } from "../auth";
import { authedAction, UserError } from "../action";

export type AuthFormState = { error?: string; fieldErrors?: FieldErrors } | undefined;

const loginLimiter = createRateLimiter(10, 15 * 60 * 1000);
// Constant hash used to keep timing similar for unknown e-mail addresses.
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  // Only allow relative in-app paths (no protocol-relative "//evil.com").
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Bitte E-Mail und Passwort angeben.", fieldErrors: fieldErrors(parsed.error) };

  const ip = await clientIp();
  if (!loginLimiter.check(`${ip}:${parsed.data.email}`)) {
    return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "E-Mail oder Passwort ist falsch." };

  loginLimiter.reset(`${ip}:${parsed.data.email}`);
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function register(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!(await registrationOpen())) return { error: "Die Registrierung ist deaktiviert." };

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Bitte die Eingaben prüfen.", fieldErrors: fieldErrors(parsed.error) };

  const exists = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (exists) return { error: "Für diese E-Mail-Adresse existiert bereits ein Konto." };

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export const changePassword = authedAction(changePasswordSchema, async (input, user) => {
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(input.currentPassword, record.passwordHash))) {
    throw new UserError("Das aktuelle Passwort ist falsch.");
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
});

export const updateSettings = authedAction(settingsSchema, async (input, user) => {
  await db.user.update({ where: { id: user.id }, data: input });
  revalidatePath("/", "layout");
});
