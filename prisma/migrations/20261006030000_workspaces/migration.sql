
-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "workspaceVersionId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'DRAFT',
    "draft" JSONB NOT NULL,
    "latestVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_userId_updatedAt_idx" ON "Workspace"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_userId_nameNormalized_key" ON "Workspace"("userId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceVersion_workspaceId_version_key" ON "WorkspaceVersion"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_workspaceVersionId_key" ON "Strategy"("workspaceVersionId");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_workspaceVersionId_fkey" FOREIGN KEY ("workspaceVersionId") REFERENCES "WorkspaceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceVersion" ADD CONSTRAINT "WorkspaceVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

