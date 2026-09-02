-- YoungPortal sprint 1.6.0 schema (PostgreSQL)
-- Run inside db container or via: docker compose exec -T db psql -U sochi -d sochi_portal < scripts/apply-sprint-16-schema.sql

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "ecoBall" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mBall" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ecoBallPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "presenceQrToken" TEXT,
  ADD COLUMN IF NOT EXISTS "presenceQrExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moderationApprovedAt" TIMESTAMP(3);

-- Existing active users are treated as already approved for login gates
UPDATE "User"
SET "moderationApprovedAt" = COALESCE("moderationApprovedAt", "createdAt", NOW())
WHERE "blockedAt" IS NULL AND "deletedAt" IS NULL AND "moderationApprovedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_presenceQrToken_key" ON "User"("presenceQrToken");

ALTER TABLE "Space"
  ADD COLUMN IF NOT EXISTS "bookingMode" TEXT NOT NULL DEFAULT 'HALL',
  ADD COLUMN IF NOT EXISTS "openTime" TEXT,
  ADD COLUMN IF NOT EXISTS "closeTime" TEXT,
  ADD COLUMN IF NOT EXISTS "slotStepMin" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "ReputationEvent"
  ADD COLUMN IF NOT EXISTS "actorId" TEXT;

CREATE TABLE IF NOT EXISTS "SpaceClosure" (
  "id" TEXT PRIMARY KEY,
  "spaceId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SERVICE',
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SpaceClosure_spaceId_startTime_endTime_idx" ON "SpaceClosure"("spaceId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "SpaceClosure_startTime_idx" ON "SpaceClosure"("startTime");

CREATE TABLE IF NOT EXISTS "CoworkingSignup" (
  "id" TEXT PRIMARY KEY,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "period" TEXT NOT NULL DEFAULT 'DAY',
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 1,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CoworkingSignup_spaceId_dayKey_period_status_idx" ON "CoworkingSignup"("spaceId", "dayKey", "period", "status");
CREATE INDEX IF NOT EXISTS "CoworkingSignup_userId_startTime_idx" ON "CoworkingSignup"("userId", "startTime");
CREATE INDEX IF NOT EXISTS "CoworkingSignup_status_startTime_idx" ON "CoworkingSignup"("status", "startTime");

CREATE TABLE IF NOT EXISTS "PresenceCheckIn" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "scannedById" TEXT,
  "spaceId" TEXT,
  "coworkingSignupId" TEXT,
  "bookingId" TEXT,
  "dayKey" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL DEFAULT 'default',
  "mBallDelta" INTEGER NOT NULL DEFAULT 0,
  "ecoBallDelta" INTEGER NOT NULL DEFAULT 0,
  "metaJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PresenceCheckIn_userId_dayKey_slotKey_key" ON "PresenceCheckIn"("userId", "dayKey", "slotKey");
CREATE INDEX IF NOT EXISTS "PresenceCheckIn_spaceId_createdAt_idx" ON "PresenceCheckIn"("spaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PresenceCheckIn_scannedById_createdAt_idx" ON "PresenceCheckIn"("scannedById", "createdAt");
CREATE INDEX IF NOT EXISTS "PresenceCheckIn_createdAt_idx" ON "PresenceCheckIn"("createdAt");

-- Mark coworking spaces
UPDATE "Space"
SET "bookingMode" = 'COWORKING'
WHERE lower("category") LIKE '%коворк%' OR lower("title") LIKE '%коворк%';
