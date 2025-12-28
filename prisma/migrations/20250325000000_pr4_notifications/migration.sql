-- Add NotificationDelivery and per-chat notification preferences

ALTER TABLE "ChatConfig"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "enabledProviders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "enabledFeatures" JSONB NOT NULL DEFAULT '{"signals":true,"news":true,"arbitrage":true}',
  ADD COLUMN "maxNotifsPerHour" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "cooldownSignalsSec" INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN "cooldownNewsSec" INTEGER NOT NULL DEFAULT 1800,
  ADD COLUMN "cooldownArbSec" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "digestTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ChatConfig"
  ALTER COLUMN "minConfidence" SET DEFAULT 60,
  ALTER COLUMN "quietHoursEnabled" SET DEFAULT true,
  ALTER COLUMN "quietHoursStart" SET DEFAULT '23:00',
  ALTER COLUMN "quietHoursEnd" SET DEFAULT '08:00';

UPDATE "ChatConfig"
SET "quietHoursStart" = '23:00'
WHERE "quietHoursStart" IS NULL;

UPDATE "ChatConfig"
SET "quietHoursEnd" = '08:00'
WHERE "quietHoursEnd" IS NULL;

ALTER TABLE "ChatConfig"
  ALTER COLUMN "quietHoursStart" SET NOT NULL,
  ALTER COLUMN "quietHoursEnd" SET NOT NULL;

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "reason" TEXT,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_entityType_entityId_chatId_key" ON "NotificationDelivery"("entityType", "entityId", "chatId");
CREATE INDEX "NotificationDelivery_chatId_createdAt_idx" ON "NotificationDelivery"("chatId", "createdAt");
