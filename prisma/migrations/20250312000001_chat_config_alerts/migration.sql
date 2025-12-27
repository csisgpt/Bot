-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('BINANCE', 'TRADINGVIEW');

-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('UP_PCT', 'DOWN_PCT', 'TP1');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('private', 'group', 'channel');

-- ------------------------------------------------------------
-- Fix: Convert Signal.source TEXT -> SignalSource ENUM safely
-- Problem: default on "source" (text) can't be cast automatically.
-- Solution: drop default, normalize values, cast with USING, restore default.
-- ------------------------------------------------------------

-- 1) Drop default first (avoid "default cannot be cast" error)
ALTER TABLE "Signal" ALTER COLUMN "source" DROP DEFAULT;

-- 2) Normalize existing values before casting (safe even on empty DB)
UPDATE "Signal"
SET "source" = 'BINANCE'
WHERE "source" IS NULL;

UPDATE "Signal"
SET "source" = 'BINANCE'
WHERE "source" NOT IN ('BINANCE', 'TRADINGVIEW');

-- 3) Convert column type using explicit cast
ALTER TABLE "Signal"
  ALTER COLUMN "source" TYPE "SignalSource"
  USING ("source"::text::"SignalSource");

-- 4) Restore default using enum literal
ALTER TABLE "Signal"
  ALTER COLUMN "source" SET DEFAULT 'BINANCE'::"SignalSource";

-- 5) Add the new columns (keep them nullable by default)
ALTER TABLE "Signal"
  ADD COLUMN "why" TEXT,
  ADD COLUMN "indicators" JSONB,
  ADD COLUMN "sl" DOUBLE PRECISION,
  ADD COLUMN "tp1" DOUBLE PRECISION,
  ADD COLUMN "tp2" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ChatConfig" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL,
    "title" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assetsEnabled" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeframes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "watchlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minConfidence" INTEGER NOT NULL DEFAULT 70,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "sendToGroup" BOOLEAN NOT NULL DEFAULT true,
    "sendToChannel" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "mutedInstruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "type" "AlertRuleType" NOT NULL,
    "threshold" DOUBLE PRECISION,
    "basePrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalDeliveryLog" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalFeedback" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConfig_chatId_key" ON "ChatConfig"("chatId");

-- CreateIndex
CREATE INDEX "ChatConfig_chatType_idx" ON "ChatConfig"("chatType");

-- CreateIndex
CREATE INDEX "AlertRule_userId_idx" ON "AlertRule"("userId");

-- CreateIndex
CREATE INDEX "AlertRule_chatId_idx" ON "AlertRule"("chatId");

-- CreateIndex
CREATE INDEX "AlertRule_instrument_idx" ON "AlertRule"("instrument");

-- CreateIndex
CREATE INDEX "AlertRule_expiresAt_idx" ON "AlertRule"("expiresAt");

-- CreateIndex
CREATE INDEX "SignalDeliveryLog_signalId_idx" ON "SignalDeliveryLog"("signalId");

-- CreateIndex
CREATE INDEX "SignalDeliveryLog_chatId_idx" ON "SignalDeliveryLog"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalFeedback_signalId_userId_key" ON "SignalFeedback"("signalId", "userId");

-- CreateIndex
CREATE INDEX "SignalFeedback_signalId_idx" ON "SignalFeedback"("signalId");

-- CreateIndex
CREATE INDEX "Signal_externalId_idx" ON "Signal"("externalId");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");
