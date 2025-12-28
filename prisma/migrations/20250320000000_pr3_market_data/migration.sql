-- CreateTable
CREATE TABLE "MarketCandle" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "hash" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArbOpportunity" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "buyExchange" TEXT NOT NULL,
    "sellExchange" TEXT NOT NULL,
    "buyPrice" DOUBLE PRECISION NOT NULL,
    "sellPrice" DOUBLE PRECISION NOT NULL,
    "spreadAbs" DOUBLE PRECISION NOT NULL,
    "spreadPct" DOUBLE PRECISION NOT NULL,
    "netPct" DOUBLE PRECISION,
    "confidence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArbOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketCandle_provider_canonicalSymbol_timeframe_openTime_key" ON "MarketCandle"("provider", "canonicalSymbol", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "MarketCandle_canonicalSymbol_timeframe_openTime_idx" ON "MarketCandle"("canonicalSymbol", "timeframe", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX "News_hash_key" ON "News"("hash");

-- CreateIndex
CREATE INDEX "News_provider_ts_idx" ON "News"("provider", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "ArbOpportunity_dedupKey_key" ON "ArbOpportunity"("dedupKey");

-- CreateIndex
CREATE INDEX "ArbOpportunity_canonicalSymbol_ts_idx" ON "ArbOpportunity"("canonicalSymbol", "ts");
