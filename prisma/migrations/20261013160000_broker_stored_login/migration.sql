-- Opt-in stored login (PIN + 2FA secret) for brokers with no API-only automatic login; encrypted with a separate key.
ALTER TABLE "BrokerConnection" ADD COLUMN "storedLoginEnc" TEXT;
