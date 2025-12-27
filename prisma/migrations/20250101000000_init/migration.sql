-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BINANCE',
    "assetType" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "confidence" INTEGER NOT NULL,
    "tags" TEXT[],
    "reason" TEXT NOT NULL,
    "levels" JSONB,
    "externalId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_assetType_instrument_interval_time_idx" ON "Signal"("assetType", "instrument", "interval", "time");
