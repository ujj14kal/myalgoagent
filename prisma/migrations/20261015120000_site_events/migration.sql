-- What happened on the site (errors, sign-ins), searchable by the team in the admin portal.
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "digest" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "detail" JSONB,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteEvent_at_idx" ON "SiteEvent"("at");
CREATE INDEX "SiteEvent_kind_at_idx" ON "SiteEvent"("kind", "at");
CREATE INDEX "SiteEvent_userId_at_idx" ON "SiteEvent"("userId", "at");
CREATE INDEX "SiteEvent_context_at_idx" ON "SiteEvent"("context", "at");
