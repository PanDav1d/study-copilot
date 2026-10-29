import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "@/lib/auth/token";

export async function createSession(userId: string) {
  const token = await signSessionToken(userId, env().AUTH_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // The desktop app talks to its own server over http://127.0.0.1.
    secure: env().NODE_ENV === "production" && !env().DESKTOP_TOKEN,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The authenticated user or null. Memoised per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, env().AUTH_SECRET);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      updatedAt: true,
      requestRetention: true,
      maximumInterval: true,
      enableFuzz: true,
      dailyNewLimit: true,
      dailyXpGoal: true,
    },
  });
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Use in pages/layouts: redirects to /login when not authenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Nicht angemeldet");
  }
}

/** Use in server actions / route handlers: throws instead of redirecting. */
export async function requireUserOrThrow(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function registrationOpen() {
  if (env().ALLOW_REGISTRATION) return true;
  return (await db.user.count()) === 0;
}
