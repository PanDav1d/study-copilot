import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contentDisposition } from "@/lib/pdf";
import { getCurrentUser } from "@/server/auth";
import { readStoredFile } from "@/server/storage";

export const runtime = "nodejs";

// Errors must not be cached: a 410 is cacheable by default, and a file that is
// only temporarily missing (iCloud offload) would otherwise stay "gone" in the viewer.
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, ...NO_STORE });

  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, userId: user.id } });
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404, ...NO_STORE });

  let data: Buffer;
  try {
    data = await readStoredFile(doc.storageKey);
  } catch {
    return NextResponse.json({ error: "Datei fehlt im Speicher" }, { status: 410, ...NO_STORE });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", doc.originalName),
      "Cache-Control": "private, max-age=3600",
      ETag: `"${doc.sha256}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
