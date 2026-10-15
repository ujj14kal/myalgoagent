-- Datasets a user uploads (a time and a number per row) for custom indicators to read with data(name).
CREATE TABLE "UserDataset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "times" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "rows" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDataset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDataset_userId_slug_key" ON "UserDataset"("userId", "slug");

ALTER TABLE "UserDataset" ADD CONSTRAINT "UserDataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
