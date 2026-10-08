CREATE TABLE "study_sessions" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "deck_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request" JSONB NOT NULL,
  "mode" TEXT NOT NULL,
  "deck_title" TEXT NOT NULL,
  "deck_revision" INTEGER NOT NULL,
  "card_count" INTEGER NOT NULL,
  "direction" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "state" JSONB NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "elapsed_ms" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "study_sessions_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "study_sessions_user_id_request_id_key" ON "study_sessions"("user_id", "request_id");
CREATE INDEX "study_sessions_user_id_deck_id_mode_status_idx" ON "study_sessions"("user_id", "deck_id", "mode", "status");
CREATE INDEX "study_sessions_user_id_started_at_idx" ON "study_sessions"("user_id", "started_at");
CREATE TABLE "study_events" (
  "session_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "input" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_events_pkey" PRIMARY KEY ("session_id", "event_id"),
  CONSTRAINT "study_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
