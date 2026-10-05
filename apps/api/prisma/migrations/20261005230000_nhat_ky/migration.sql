-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "bookingId" INTEGER,
    "detail" TEXT,
    "changes" JSONB,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_bookingId_idx" ON "AuditLog"("bookingId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

