import { Prisma, type PrismaClient } from '@memly/database';
import type { DeckDto, DeckInput, DeckUpdate, PageDto } from '@memly/contracts';
import { AppError, conflict, missing } from '../../http/errors.ts';

type Database = PrismaClient | Prisma.TransactionClient;
export const deckInclude = (userId: string) => ({
  owner: { select: { name: true } },
  cards: { orderBy: { position: 'asc' as const }, include: { progress: { where: { userId } } } },
  favorites: { where: { userId } },
});
type LoadedDeck = Prisma.DeckGetPayload<{ include: ReturnType<typeof deckInclude> }>;
export function deckDto(deck: LoadedDeck, userId: string, detail = true): DeckDto {
  const known = deck.cards.filter((card) =>
    card.progress.some((progress) => progress.known && progress.cardRevision === card.revision),
  ).length;
  return {
    id: deck.id,
    title: deck.title,
    description: deck.description,
    icon: deck.icon,
    visibility: deck.visibility as DeckDto['visibility'],
    termLanguage: deck.termLanguage as DeckDto['termLanguage'],
    definitionLanguage: deck.definitionLanguage as DeckDto['definitionLanguage'],
    ownerId: deck.ownerId,
    ownerName: deck.owner.name,
    revision: deck.revision,
    count: deck.cards.length,
    progress: deck.cards.length ? Math.round((known / deck.cards.length) * 100) : 0,
    folder: deck.ownerId === userId ? (deck.folderId ?? '') : '',
    favorite: deck.favorites.length > 0,
    cards: detail
      ? deck.cards.map(({ id, term, definition, revision }) => ({ id, term, definition, revision }))
      : [],
  };
}
export async function readableDeck(db: Database, userId: string, id: string): Promise<LoadedDeck> {
  const deck = await db.deck.findFirst({
    where: { id, OR: [{ ownerId: userId }, { visibility: 'public' }] },
    include: deckInclude(userId),
  });
  if (!deck) throw missing();
  return deck;
}
async function ownedDeck(db: Database, userId: string, id: string): Promise<LoadedDeck> {
  const deck = await db.deck.findFirst({
    where: { id, ownerId: userId },
    include: deckInclude(userId),
  });
  if (!deck) throw missing();
  return deck;
}
async function checkFolder(db: Database, userId: string, folderId: string | null): Promise<void> {
  if (folderId && !(await db.folder.findFirst({ where: { id: folderId, ownerId: userId } })))
    throw missing();
}

export function createDeckService(db: PrismaClient) {
  return {
    async list(
      userId: string,
      query: { page: number; limit: number; q: string; scope: 'mine' | 'public' },
    ): Promise<PageDto<DeckDto>> {
      const where: Prisma.DeckWhereInput = {
        AND: [
          query.scope === 'mine'
            ? {
                OR: [
                  { ownerId: userId },
                  { visibility: 'public', favorites: { some: { userId } } },
                ],
              }
            : { visibility: 'public' },
          query.q
            ? {
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' } },
                  { description: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      };
      const [total, items] = await db.$transaction([
        db.deck.count({ where }),
        db.deck.findMany({
          where,
          include: deckInclude(userId),
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ]);
      return {
        items: items.map((deck) => deckDto(deck, userId, false)),
        total,
        page: query.page,
        pages: Math.ceil(total / query.limit),
      };
    },
    async get(userId: string, id: string): Promise<DeckDto> {
      return deckDto(await readableDeck(db, userId, id), userId);
    },
    async create(userId: string, input: DeckInput): Promise<DeckDto> {
      return db.$transaction(
        async (tx) => {
          await checkFolder(tx, userId, input.folderId);
          const { cards, ...data } = input;
          const deck = await tx.deck.create({
            data: {
              ...data,
              ownerId: userId,
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
          return deckDto(deck, userId);
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async update(userId: string, id: string, input: DeckUpdate): Promise<DeckDto> {
      return db.$transaction(
        async (tx) => {
          const original = await ownedDeck(tx, userId, id);
          const { cards, revision, ...data } = input;
          await checkFolder(tx, userId, data.folderId);
          const claim = await tx.deck.updateMany({
            where: { id, ownerId: userId, revision },
            data: { ...data, revision: { increment: 1 } },
          });
          if (!claim.count) throw conflict();
          const ids = cards.flatMap((card) => (card.id ? [card.id] : []));
          if (ids.some((cardId) => !original.cards.some((card) => card.id === cardId)))
            throw new AppError(400, 'INVALID_CARD', 'Карточка не принадлежит набору');
          await tx.card.deleteMany({ where: { deckId: id, id: { notIn: ids } } });
          for (const [position, card] of cards.entries()) {
            if (!card.id) {
              await tx.card.create({
                data: {
                  deckId: id,
                  term: card.term,
                  definition: card.definition,
                  position,
                  versions: {
                    create: { revision: 1, term: card.term, definition: card.definition },
                  },
                },
              });
              continue;
            }
            const previous = original.cards.find((item) => item.id === card.id)!;
            const changed = previous.term !== card.term || previous.definition !== card.definition;
            await tx.card.update({
              where: { id: card.id },
              data: {
                term: card.term,
                definition: card.definition,
                position,
                ...(changed
                  ? {
                      revision: { increment: 1 },
                      versions: {
                        create: {
                          revision: previous.revision + 1,
                          term: card.term,
                          definition: card.definition,
                        },
                      },
                    }
                  : {}),
              },
            });
          }
          return deckDto(await ownedDeck(tx, userId, id), userId);
        },
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
    },
    async remove(userId: string, id: string, revision: number): Promise<void> {
      await db.$transaction(async (tx) => {
        await ownedDeck(tx, userId, id);
        const deleted = await tx.deck.deleteMany({ where: { id, ownerId: userId, revision } });
        if (!deleted.count) throw conflict();
      });
    },
    async favorite(userId: string, id: string, favorite: boolean): Promise<void> {
      await db.$transaction(
        async (tx) => {
          await readableDeck(tx, userId, id);
          if (favorite)
            await tx.favorite.upsert({
              where: { userId_deckId: { userId, deckId: id } },
              create: { userId, deckId: id },
              update: {},
            });
          else await tx.favorite.deleteMany({ where: { userId, deckId: id } });
        },
        { isolationLevel: 'Serializable' },
      );
    },
  };
}
