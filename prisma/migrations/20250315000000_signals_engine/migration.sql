-- Add dedup key to signals
ALTER TABLE "Signal" ADD COLUMN "dedupKey" TEXT;

-- CreateTable
CREATE TABLE "SignalProcessingState" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "lastProcessedCandleTime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalProcessingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalDelivery" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,

    CONSTRAINT "SignalDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signal_dedupKey_key" ON "Signal"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "SignalProcessingState_source_instrument_timeframe_strategy_key" ON "SignalProcessingState"("source", "instrument", "timeframe", "strategy");

-- CreateIndex
CREATE INDEX "SignalProcessingState_source_instrument_timeframe_strategy_idx" ON "SignalProcessingState"("source", "instrument", "timeframe", "strategy");

-- CreateIndex
CREATE UNIQUE INDEX "SignalDelivery_signalId_chatId_key" ON "SignalDelivery"("signalId", "chatId");

-- CreateIndex
CREATE INDEX "SignalDelivery_chatId_deliveredAt_idx" ON "SignalDelivery"("chatId", "deliveredAt");
