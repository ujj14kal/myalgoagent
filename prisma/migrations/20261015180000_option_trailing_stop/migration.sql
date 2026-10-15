-- A trailing stop for an options strategy: leave when the open profit falls this far from its best so far.
ALTER TABLE "OptionStrategy" ADD COLUMN "trailUnit" TEXT;
ALTER TABLE "OptionStrategy" ADD COLUMN "trailValue" DOUBLE PRECISION;
