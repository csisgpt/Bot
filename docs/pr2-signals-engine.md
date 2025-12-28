# PR2 Signals Engine

## Overview
Signals Engine reads candles exclusively from Postgres (Prisma `Candle` table), runs a lightweight deterministic strategy, writes `Signal` rows, and (optionally) enqueues Telegram delivery jobs.

**Pipeline**
1. Candle DB (`Candle` rows from 1m + aggregated timeframes)
2. Signals Engine (interval worker)
3. `Signal` insert + `SignalProcessingState` update
4. Optional enqueue: BullMQ `sendTelegramSignal`

## Environment keys
| Key | Default | Description |
| --- | --- | --- |
| `SIGNAL_ENGINE_ENABLED` | `true` | Enable/disable the engine. |
| `SIGNAL_ENGINE_INTERVAL_SECONDS` | `30` | Engine tick interval. |
| `DEFAULT_SIGNAL_TIMEFRAMES` | `5m,15m` | Only timeframes processed by engine (intersection with monitoring plan). |
| `MIN_CANDLES` | `50` | Minimum candles required per pair. |
| `SIGNAL_COOLDOWN_SECONDS` | `600` | Cooldown after producing a signal. |
| `SIGNAL_ENGINE_CONCURRENCY` | `5` | Async concurrency for symbol/timeframe processing. |
| `SIGNAL_STRATEGY_NAME` | `MVP_V1` | Strategy name persisted on signals. |

## Edge cases & skip reasons
| Reason | Trigger |
| --- | --- |
| `INSUFFICIENT_DATA` | Less than `MIN_CANDLES` candles available. |
| `STALE_CANDLES` | Latest candle older than `3x` timeframe duration. |
| `CANDLE_GAP` | Gap between last two candles greater than `2x` timeframe. |
| `NO_NEW_CANDLE` | Latest candle already processed in `SignalProcessingState`. |
| `COOLDOWN` | Redis cooldown key exists. |
| `NO_SIGNAL` | Strategy threshold not met. |
| `DUPLICATE` | A signal with the same dedup key already exists. |
| `INVALID_TIMEFRAME` | Timeframe cannot be parsed (e.g. not `5m`, `1h`). |
| `INVALID_PREVIOUS_CLOSE` | Previous candle close is invalid (`<= 0`). |

## Manual test checklist
- With 2 symbols, verify:
  - Engine skips until enough candles exist.
  - When candles exist, produces signals only on new candle.
  - Restart worker does not duplicate signals.
  - Cooldown prevents back-to-back signals.
  - Gap/stale conditions cause skip.
- Verify DB tables created and indexes applied.

## Manual testing notes
1. Ensure candles exist in `Candle` table for the target symbols/timeframes.
2. Start worker with `RUN_WORKER=true` and `SIGNAL_ENGINE_ENABLED=true`.
3. Watch logs for summary and skip reasons.
4. Inspect `Signal`, `SignalProcessingState`, and `SignalDelivery` tables to confirm inserts and indexes.
