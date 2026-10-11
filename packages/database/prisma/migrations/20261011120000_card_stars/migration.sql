CREATE TABLE "card_stars" (
  "user_id" TEXT NOT NULL,
  "card_id" UUID NOT NULL,
  CONSTRAINT "card_stars_pkey" PRIMARY KEY ("user_id", "card_id"),
  CONSTRAINT "card_stars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "card_stars_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "card_stars_card_id_idx" ON "card_stars"("card_id");
