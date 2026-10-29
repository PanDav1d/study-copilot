import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { checkUpload, PDF_MIME, sanitizeFilename, titleFromFilename } from "@/lib/pdf";
import { id } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { UserError } from "@/server/action";
import { resolveAssignment } from "@/server/ownership";
import { sameOrigin } from "@/server/same-origin";
import { deleteStoredFile, saveFile } from "@/server/storage";

export const runtime = "nodejs";

const MAX_FILES = 20;
const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), id.optional());
const fieldsSchema = z.object({
  semesterId: optionalId,
  moduleId: optionalId,
  noteId: optionalId,
});

/**
 * Multipart PDF upload. Not a server action because of the payload size.
 * Security: session check, same-origin (CSRF) check, size limit, magic-byte
 * check, random storage key, ownership check of all referenced entities.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Herkunft" }, { status: 403 });

  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes * MAX_FILES) {
    return NextResponse.json({ error: "Upload ist zu groß." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const fields = fieldsSchema.safeParse(Object.fromEntries(["semesterId", "moduleId", "noteId"].map((k) => [k, form.get(k)])));
  if (!fields.success) return NextResponse.json({ error: "Ungültige Zuordnung" }, { status: 400 });

  let assignment;
  try {
    let target = fields.data;
    if (fields.data.noteId) {
      const note = await db.note.findFirst({
        where: { id: fields.data.noteId, userId: user.id },
        select: { moduleId: true },
      });
      if (!note) throw new UserError("Sitzung wurde nicht gefunden.");
      // Files dropped on a session belong to its module and are linked to it.
      target = { ...target, moduleId: target.moduleId ?? note.moduleId };
    }
    assignment = await resolveAssignment(user.id, { semesterId: target.semesterId, moduleId: target.moduleId });
  } catch (e) {
    const message = e instanceof UserError ? e.message : "Ungültige Zuordnung";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Keine Datei ausgewählt." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Maximal ${MAX_FILES} Dateien auf einmal.` }, { status: 400 });

  const created: { id: string; title: string }[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const check = checkUpload({ name: file.name, size: buffer.length, type: file.type }, buffer, maxBytes);
    if (!check.ok) {
      errors.push(check.error);
      continue;
    }
    const { storageKey, sha256 } = await saveFile(buffer);
    try {
      const doc = await db.document.create({
        data: {
          userId: user.id,
          ...assignment,
          title: titleFromFilename(file.name),
          originalName: sanitizeFilename(file.name),
          storageKey,
          sha256,
          mimeType: PDF_MIME,
          size: buffer.length,
          notes: fields.data.noteId ? { create: { noteId: fields.data.noteId } } : undefined,
        },
      });
      created.push({ id: doc.id, title: doc.title });
    } catch (e) {
      await deleteStoredFile(storageKey);
      console.error("[upload] failed to persist document", e);
      errors.push(`„${file.name}“ konnte nicht gespeichert werden.`);
    }
  }

  if (created.length > 0) revalidatePath("/", "layout");
  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 201 : 400 });
}
