-- Collections for a user's own indicators, and a community library of published ones with ratings and reports.
ALTER TABLE "CustomIndicator" ADD COLUMN "collection" TEXT;

CREATE TABLE "CommunityIndicator" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "limitations" TEXT,
    "def" JSONB NOT NULL,
    "repaints" BOOLEAN NOT NULL,
    "integrityNote" TEXT NOT NULL,
    "timing" JSONB NOT NULL,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityIndicator_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityIndicator_status_createdAt_idx" ON "CommunityIndicator"("status", "createdAt");
CREATE UNIQUE INDEX "CommunityIndicator_authorId_name_key" ON "CommunityIndicator"("authorId", "name");

CREATE TABLE "CommunityRating" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityRating_indicatorId_userId_key" ON "CommunityRating"("indicatorId", "userId");

CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityReport_indicatorId_userId_key" ON "CommunityReport"("indicatorId", "userId");

ALTER TABLE "CommunityIndicator" ADD CONSTRAINT "CommunityIndicator_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityRating" ADD CONSTRAINT "CommunityRating_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "CommunityIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityRating" ADD CONSTRAINT "CommunityRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "CommunityIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
