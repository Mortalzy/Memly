import { Prisma, type PrismaClient } from '@memly/database';
import type { DeckDto, StarterDeckDto, StarterDeckDetailDto } from '@memly/contracts';
import { missing } from '../../http/errors.ts';
import { deckDto, deckInclude } from '../decks/decks.service.ts';
import { starterDecks } from './catalog.ts';

const template = (key: string) => {
  const starter = starterDecks.find((item) => item.key === key);
  if (!starter) throw missing();
  return starter;
};
export function createStarterService(db: PrismaClient) {
  return {
    async list(userId: string): Promise<StarterDeckDto[]> {
      const copies = await db.deck.findMany({
        where: { ownerId: userId, starterKey: { in: starterDecks.map((item) => item.key) } },
        select: { id: true, starterKey: true },
      });
      return starterDecks.map(({ cards, ...starter }) => ({
        ...starter,
        count: cards.length,
        addedDeckId: copies.find((copy) => copy.starterKey === starter.key)?.id ?? null,
      }));
    },
    async get(userId: string, key: string): Promise<StarterDeckDetailDto> {
      const starter = template(key);
      const copy = await db.deck.findUnique({
        where: { ownerId_starterKey: { ownerId: userId, starterKey: key } },
        select: { id: true },
      });
      return { ...starter, count: starter.cards.length, addedDeckId: copy?.id ?? null };
    },
    async add(userId: string, key: string): Promise<DeckDto> {
      const { title, description, icon, cards } = template(key);
      const where = { ownerId_starterKey: { ownerId: userId, starterKey: key } };
      try {
        const copy = await db.deck.upsert({
          where,
          update: {},
          create: {
            ownerId: userId,
            starterKey: key,
            title,
            description,
            icon,
            visibility: 'private',
            termLanguage: 'en',
            definitionLanguage: 'ru',
            cards: {
              create: cards.map(({ term, definition }, position) => ({
                term,
                definition,
                position,
                versions: { create: { revision: 1, term, definition } },
              })),
            },
          },
          include: deckInclude(userId),
        });
        return deckDto(copy, userId);
      } catch (error) {
        // Nested upserts can race. The unique owner/template key chooses one complete copy.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const copy = await db.deck.findUnique({ where, include: deckInclude(userId) });
          if (copy) return deckDto(copy, userId);
        }
        throw error;
      }
    },
  };
}
