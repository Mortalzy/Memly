ALTER TABLE "decks" ADD COLUMN "starter_key" VARCHAR(64);
CREATE UNIQUE INDEX "decks_owner_id_starter_key_key" ON "decks"("owner_id", "starter_key");
