-- Staged targets (Target 1–3). Additive only: every column is nullable or has a default, so nothing existing changes.
ALTER TABLE "Strategy" ADD COLUMN IF NOT EXISTS "targetsConfig" JSONB;
ALTER TABLE "BacktestRun" ADD COLUMN IF NOT EXISTS "targetsConfig" JSONB;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "targetsConfig" JSONB;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionInitialQuantity" DOUBLE PRECISION;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionTargetsHit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionLockedStop" DOUBLE PRECISION;
