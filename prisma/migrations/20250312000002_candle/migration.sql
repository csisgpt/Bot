-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candle_source_instrument_timeframe_time_key" ON "Candle"("source", "instrument", "timeframe", "time");

-- CreateIndex
CREATE INDEX "Candle_source_instrument_timeframe_time_idx" ON "Candle"("source", "instrument", "timeframe", "time");

-- CreateIndex
CREATE INDEX "Candle_instrument_timeframe_time_idx" ON "Candle"("instrument", "timeframe", "time");
