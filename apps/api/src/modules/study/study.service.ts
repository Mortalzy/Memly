import type { PrismaClient } from '@memly/database';
import type { ProgressDto, ReviewInput } from '@memly/contracts';
import { AppError, conflict, missing } from '../../http/errors.ts';

export function createStudyService(db: PrismaClient) {
  return {
    async review(userId: string, input: ReviewInput): Promise<void> {
      await db.$transaction(
        async (tx) => {
          const previous = await tx.reviewEvent.findUnique({
            where: { userId_eventId: { userId, eventId: input.eventId } },
          });
          if (previous) {
            if (
              previous.cardId !== input.cardId ||
              previous.cardRevision !== input.cardRevision ||
              previous.known !== input.known
            ) {
              throw new AppError(409, 'EVENT_CONFLICT', 'Этот ID события уже использован');
            }
            return;
          }
          const card = await tx.card.findFirst({
            where: {
              id: input.cardId,
              deck: { OR: [{ ownerId: userId }, { visibility: 'public' }] },
            },
          });
          if (!card) throw missing();
          if (card.revision !== input.cardRevision) throw conflict();
          await tx.reviewEvent.create({ data: { userId, ...input } });
          const data = { cardRevision: input.cardRevision, known: input.known };
          await tx.cardProgress.upsert({
            where: { userId_cardId: { userId, cardId: card.id } },
            create: { userId, cardId: card.id, ...data },
            update: data,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async progress(userId: string): Promise<ProgressDto> {
      const accessible = { OR: [{ ownerId: userId }, { visibility: 'public' }] };
      const [reviewed, rows, decks] = await db.$transaction([
        db.reviewEvent.count({ where: { userId } }),
        db.cardProgress.findMany({
          where: { userId, known: true, card: { deck: accessible } },
          select: { cardRevision: true, card: { select: { revision: true } } },
        }),
        db.deck.count({ where: { ownerId: userId } }),
      ]);
      return {
        reviewed,
        known: rows.filter((row) => row.cardRevision === row.card.revision).length,
        decks,
      };
    },
  };
}
