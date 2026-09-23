-- Enforces "a strategy becomes Active the moment a paper session exists for
-- it" at the database level, so it can never again depend on every
-- application code path remembering to call activateStrategyIfDraft.
--
-- Root cause this closes: two separate code paths create PaperSession rows
-- (starting one by hand, and a webhook auto-starting its first session on
-- alert) — only one of them called the promotion helper. A trigger makes
-- this a property of the data itself, not of any particular call site.
CREATE OR REPLACE FUNCTION activate_strategy_on_paper_session() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."strategyId" IS NOT NULL THEN
    UPDATE "Strategy" SET status = 'ACTIVE' WHERE id = NEW."strategyId" AND status = 'DRAFT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activate_strategy_on_paper_session
AFTER INSERT ON "PaperSession"
FOR EACH ROW
EXECUTE FUNCTION activate_strategy_on_paper_session();
