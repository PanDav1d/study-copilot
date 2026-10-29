import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createSession } from "@/server/auth";

export const runtime = "nodejs";

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Desktop sign-in: the Tauri shell opens this URL with the per-launch token it
 * passed to the server. There is exactly one local user, created on first start.
 * Not available outside the desktop app.
 */
export async function GET(request: NextRequest) {
  const expected = env().DESKTOP_TOKEN;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!expected) return new NextResponse(null, { status: 404 });
  if (!sameSecret(token, expected)) return new NextResponse(null, { status: 403 });

  let user = await db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user) {
    const name = (process.env.DESKTOP_USER_NAME ?? "").trim().slice(0, 80) || "Ich";
    // No password: the desktop app is the only way in ("desktop" is not a valid hash).
    user = await db.user.create({ data: { email: "local@study.desktop", name, passwordHash: "desktop" }, select: { id: true } });
  }
  await createSession(user.id);
  // Relative redirect: stay on 127.0.0.1 (request.url may report "localhost", which has no cookie).
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
