import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { deleteStoredFile } from "./storage";

/** Delete document rows matching `where` and remove their files from disk. */
export async function deleteDocumentsWithFiles(userId: string, where: Prisma.DocumentWhereInput) {
  const docs = await db.document.findMany({ where: { ...where, userId }, select: { id: true, storageKey: true } });
  if (docs.length === 0) return 0;
  await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await Promise.all(docs.map((d) => deleteStoredFile(d.storageKey).catch(() => undefined)));
  return docs.length;
}
