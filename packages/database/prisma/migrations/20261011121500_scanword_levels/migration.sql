ALTER TABLE "study_sessions" ALTER COLUMN "deck_id" DROP NOT NULL;
ALTER TABLE "study_sessions" ADD COLUMN "level_key" VARCHAR(64);
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_source_check"
  CHECK (("deck_id" IS NOT NULL AND "level_key" IS NULL)
    OR ("deck_id" IS NULL AND "level_key" IS NOT NULL AND "mode" = 'scanword'));
CREATE INDEX "study_sessions_user_id_level_key_status_idx"
  ON "study_sessions"("user_id", "level_key", "status");
