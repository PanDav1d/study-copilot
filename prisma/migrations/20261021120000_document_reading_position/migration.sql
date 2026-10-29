-- Reading position of the PDF viewer: last page, page count, last opened.
ALTER TABLE "Document" ADD COLUMN "lastPage" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Document" ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN "lastOpenedAt" DATETIME;
