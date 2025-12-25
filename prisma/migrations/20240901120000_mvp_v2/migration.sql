-- Create enums
CREATE TYPE "AssetType" AS ENUM ('GOLD', 'CRYPTO');
CREATE TYPE "SignalSource" AS ENUM ('BINANCE', 'TRADINGVIEW', 'MANUAL');
CREATE TYPE "SignalKind" AS ENUM ('ENTRY', 'EXIT', 'ALERT');
CREATE TYPE "SignalSide" AS ENUM ('BUY', 'SELL', 'NEUTRAL');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "JobRunStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');
CREATE TYPE "TelegramDestinationType" AS ENUM ('GROUP', 'CHANNEL');

-- Update Signal table
ALTER TABLE "Signal"
  ALTER COLUMN "source" TYPE "SignalSource" USING "source"::"SignalSource",
  ALTER COLUMN "source" SET DEFAULT 'BINANCE',
  ALTER COLUMN "assetType" TYPE "AssetType" USING "assetType"::"AssetType",
  ALTER COLUMN "kind" TYPE "SignalKind" USING "kind"::"SignalKind",
  ALTER COLUMN "side" TYPE "SignalSide" USING "side"::"SignalSide",
  ALTER COLUMN "price" TYPE DECIMAL(20,8) USING "price"::DECIMAL(20,8);

ALTER TABLE "Signal"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Signal"
SET "dedupeKey" = 'legacy:' || "id"
WHERE "dedupeKey" IS NULL;

ALTER TABLE "Signal"
  ALTER COLUMN "dedupeKey" SET NOT NULL;

-- Rebuild indexes
DROP INDEX IF EXISTS "Signal_assetType_instrument_interval_time_idx";
CREATE INDEX "Signal_assetType_instrument_interval_time_idx" ON "Signal" ("assetType", "instrument", "interval", "time" DESC);
CREATE INDEX "Signal_strategy_time_idx" ON "Signal" ("strategy", "time" DESC);
CREATE INDEX "Signal_createdAt_idx" ON "Signal" ("createdAt" DESC);

ALTER TABLE "Signal"
  ADD CONSTRAINT "Signal_source_dedupeKey_key" UNIQUE ("source", "dedupeKey");

-- New tables
CREATE TABLE "Instrument" (
  "id" TEXT NOT NULL,
  "assetType" "AssetType" NOT NULL,
  "symbol" TEXT NOT NULL,
  "name" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priceScale" INTEGER,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

CREATE TABLE "Strategy" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" TEXT,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Strategy_key_key" ON "Strategy"("key");

CREATE TABLE "TelegramDestination" (
  "id" TEXT NOT NULL,
  "destinationType" "TelegramDestinationType" NOT NULL,
  "chatId" TEXT NOT NULL,
  "title" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "messageStyle" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramDestination_destinationType_chatId_key" ON "TelegramDestination"("destinationType", "chatId");

CREATE TABLE "RoutingRule" (
  "id" TEXT NOT NULL,
  "assetType" "AssetType",
  "instrumentId" TEXT,
  "strategyId" TEXT,
  "interval" TEXT,
  "minConfidence" INTEGER,
  "destinationId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SignalDelivery" (
  "id" TEXT NOT NULL,
  "signalId" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "telegramMessageId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignalDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignalDelivery_signalId_destinationId_key" ON "SignalDelivery"("signalId", "destinationId");
CREATE INDEX "SignalDelivery_status_createdAt_idx" ON "SignalDelivery"("status", "createdAt");
CREATE INDEX "SignalDelivery_destinationId_createdAt_idx" ON "SignalDelivery"("destinationId", "createdAt");

CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "status" "JobRunStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "meta" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobRun_jobName_startedAt_idx" ON "JobRun"("jobName", "startedAt" DESC);

-- Foreign keys
ALTER TABLE "RoutingRule"
  ADD CONSTRAINT "RoutingRule_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RoutingRule_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RoutingRule_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "TelegramDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignalDelivery"
  ADD CONSTRAINT "SignalDelivery_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SignalDelivery_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "TelegramDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
