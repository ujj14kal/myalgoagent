-- Order type (market / limit) and product type (intraday / delivery). Additive:
-- existing rows become market orders; daily strategies Delivery, intraday ones
-- Intraday — i.e. exactly how they behave today.
ALTER TABLE "Strategy" ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "Strategy" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'MARKET';
ALTER TABLE "Strategy" ADD COLUMN "limitMode" TEXT;
ALTER TABLE "Strategy" ADD COLUMN "limitValue" DOUBLE PRECISION;
UPDATE "Strategy" SET "productType" = 'INTRADAY' WHERE "timeframe" <> '1d';

ALTER TABLE "PaperSession" ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "PaperSession" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'MARKET';
ALTER TABLE "PaperSession" ADD COLUMN "limitMode" TEXT;
ALTER TABLE "PaperSession" ADD COLUMN "limitValue" DOUBLE PRECISION;
ALTER TABLE "PaperSession" ADD COLUMN "pendingLimitPrice" DOUBLE PRECISION;
ALTER TABLE "PaperSession" ADD COLUMN "pendingLimitExpiresDay" INTEGER;
ALTER TABLE "PaperSession" ADD COLUMN "pendingLimitFromTime" INTEGER;
UPDATE "PaperSession" SET "productType" = 'INTRADAY' WHERE "timeframe" <> '1d';

ALTER TABLE "BacktestRun" ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "BacktestRun" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'MARKET';
ALTER TABLE "BacktestRun" ADD COLUMN "limitMode" TEXT;
ALTER TABLE "BacktestRun" ADD COLUMN "limitValue" DOUBLE PRECISION;
UPDATE "BacktestRun" SET "productType" = 'INTRADAY' WHERE "timeframe" <> '1d';
