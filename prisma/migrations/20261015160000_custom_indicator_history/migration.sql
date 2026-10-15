-- Earlier versions of a custom indicator (newest first, capped), so an edit can be undone.
ALTER TABLE "CustomIndicator" ADD COLUMN "history" JSONB;
