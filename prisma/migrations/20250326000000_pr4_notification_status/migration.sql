-- Add NotificationDeliveryStatus enum and lifecycle defaults
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED', 'BUFFERED');

ALTER TABLE "NotificationDelivery"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "NotificationDeliveryStatus" USING ("status"::text)::"NotificationDeliveryStatus",
  ALTER COLUMN "status" SET DEFAULT 'QUEUED';
