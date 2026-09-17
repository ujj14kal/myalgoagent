-- Add a normalized (lowercase, trimmed) copy of Strategy.name, backfill it
-- from existing rows, then enforce case-insensitive uniqueness per user via
-- a unique index on the normalized column (Postgres unique indexes are
-- always case-sensitive, so the constraint has to target this column
-- rather than `name` itself). Nullable-then-backfill-then-NOT-NULL is the
-- safe pattern for adding a required column to a table with existing rows
-- — a plain `ADD COLUMN ... NOT NULL` with no default fails outright
-- against non-empty data.

-- AlterTable: add nullable first
ALTER TABLE "Strategy" ADD COLUMN "nameNormalized" TEXT;

-- Backfill from existing data
UPDATE "Strategy" SET "nameNormalized" = LOWER(TRIM("name"));

-- Now safe to enforce NOT NULL
ALTER TABLE "Strategy" ALTER COLUMN "nameNormalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_userId_nameNormalized_key" ON "Strategy"("userId", "nameNormalized");
