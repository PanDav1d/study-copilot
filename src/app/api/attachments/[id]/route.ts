import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { IMAGE_TYPES } from "@/lib/images";
import { getCurrentUser } from "@/server/auth";
import { readStoredFile } from "@/server/storage";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, ...NO_STORE });
  const { id } = await params;
  const a = await db.attachment.findFirst({ where: { id, userId: user.id } });
  if (!a || !(a.mimeType in IMAGE_TYPES)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404, ...NO_STORE });

  let data: Buffer;
  try {
    data = await readStoredFile(a.storageKey);
  } catch {
    return NextResponse.json({ error: "Datei fehlt im Speicher" }, { status: 410, ...NO_STORE });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(data.length),
      // Content never changes for an id.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
