-- Optional entry/exit rules for an options strategy (read on the underlying's chart or the combined premium).
ALTER TABLE "OptionStrategy" ADD COLUMN "rules" JSONB;
