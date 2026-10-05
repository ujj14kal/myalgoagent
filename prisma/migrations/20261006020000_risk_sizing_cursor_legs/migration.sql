-- Sizing by risk per position, the entry plan's level cursor, and the parts of a backtest trade. Additive only.
ALTER TYPE "PositionSizingMode" ADD VALUE IF NOT EXISTS 'RISK_PERCENT';
ALTER TABLE "PaperSession" ADD COLUMN IF NOT EXISTS "positionLevelCursor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BacktestTrade" ADD COLUMN IF NOT EXISTS "legs" JSONB;
