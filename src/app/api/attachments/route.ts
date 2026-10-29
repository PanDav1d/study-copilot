import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkImage, IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/images";
import { id } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { sameOrigin } from "@/server/same-origin";
import { deleteStoredFile, saveFile } from "@/server/storage";

export const runtime = "nodejs";

const optional = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
const fieldsSchema = z.object({
  documentId: optional(id),
  page: optional(z.coerce.number().int().min(1).max(100_000)),
});

/**
 * Image upload (pasted screenshot, PDF snippet). Same protections as the PDF
 * upload: session, same-origin, size limit, magic bytes, random storage key.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Herkunft" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Bild ist zu groß." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const fields = fieldsSchema.safeParse({ documentId: form.get("documentId"), page: form.get("page") });
  if (!fields.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { documentId, page } = fields.data;
  if (documentId && !(await db.document.findFirst({ where: { id: documentId, userId: user.id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Unterlage nicht gefunden" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Kein Bild" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const check = checkImage(buffer);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { storageKey } = await saveFile(buffer, IMAGE_TYPES[check.mime]);
  try {
    const a = await db.attachment.create({
      data: { userId: user.id, documentId: documentId ?? null, page: documentId ? (page ?? null) : null, storageKey, mimeType: check.mime, size: buffer.length },
    });
    return NextResponse.json({ id: a.id, url: `/api/attachments/${a.id}` }, { status: 201 });
  } catch (e) {
    await deleteStoredFile(storageKey);
    console.error("[attachments] failed to persist", e);
    return NextResponse.json({ error: "Bild konnte nicht gespeichert werden." }, { status: 500 });
  }
}
