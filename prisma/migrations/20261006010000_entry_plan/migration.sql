-- Multi-level entry plans and swing / positional strategy style. Additive only: every column is nullable, so nothing existing changes.
ALTER TABLE "Strategy" ADD COLUMN IF NOT EXISTS "style" TEXT;
ALTER TABLE "Strategy" ADD COLUMN IF NOT EXISTS "entryPlan" JSONB;
ALTER TABLE "BacktestRun" ADD COLUMN IF NOT EXISTS "entryPlan" JSONB;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "entryPlan" JSONB;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionPlannedQuantity" DOUBLE PRECISION;
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionAnchorPrice" DOUBLE PRECISION;
