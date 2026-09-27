-- Strategy timeframe + intraday session rules. Additive only: existing rows get
-- timeframe '1d' and no session rules, i.e. exactly today's behaviour.
ALTER TABLE "Strategy" ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1d';
ALTER TABLE "Strategy" ADD COLUMN "noEntryAfterMinute" INTEGER;
ALTER TABLE "Strategy" ADD COLUMN "squareOffMinute" INTEGER;

ALTER TABLE "PaperSession" ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1d';
ALTER TABLE "PaperSession" ADD COLUMN "noEntryAfterMinute" INTEGER;
ALTER TABLE "PaperSession" ADD COLUMN "squareOffMinute" INTEGER;

ALTER TABLE "BacktestRun" ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1d';
ALTER TABLE "BacktestRun" ADD COLUMN "noEntryAfterMinute" INTEGER;
ALTER TABLE "BacktestRun" ADD COLUMN "squareOffMinute" INTEGER;
