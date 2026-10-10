import { randomInt, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type PrismaClient } from '@memly/database';
import type {
  StartStudyInput,
  StudyEventInput,
  StudyMode,
  StudyOverview,
  StudySessionDto,
  StudySummary,
} from '@memly/contracts';
import {
  applyStudyAction,
  createStudyState,
  StudyRuleError,
  studySummary,
  studyView,
  type StudyState,
} from '@memly/study-engine';
import { AppError, conflict, missing } from '../../http/errors.ts';
import { readableDeck } from '../decks/decks.service.ts';

type Database = PrismaClient | Prisma.TransactionClient;
const access = (userId: string) => ({ OR: [{ ownerId: userId }, { visibility: 'public' }] });
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Stored = Prisma.StudySessionGetPayload<{ include: { deck: { select: { revision: true } } } }>;
const include = { deck: { select: { revision: true } } } as const;
async function owned(db: Database, userId: string, id: string): Promise<Stored> {
  const session = await db.studySession.findFirst({
    where: { id, userId, deck: access(userId) },
    include,
  });
  if (!session) throw missing();
  return session;
}
async function dto(db: Database, session: Stored): Promise<StudySessionDto> {
  const state = session.state as unknown as StudyState;
  let bestMs: number | null = null;
  if (session.mode === 'match') {
    const record = await db.studySession.aggregate({
      where: {
        userId: session.userId,
        deckId: session.deckId,
        deckRevision: session.deckRevision,
        mode: 'match',
        status: 'completed',
        cardCount: state.cards.length,
        direction: state.options.direction,
      },
      _min: { elapsedMs: true },
    });
    bestMs = record._min.elapsedMs;
  }
  return {
    id: session.id,
    deckId: session.deckId,
    deckTitle: session.deckTitle,
    deckRevision: session.deckRevision,
    mode: state.mode,
    options: state.options,
    revision: session.revision,
    status: state.status,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    elapsedMs:
      session.status === 'active'
        ? Math.max(0, Date.now() - session.startedAt.getTime())
        : session.elapsedMs,
    ...studyView(state),
    bestMs,
    outdated: session.deck.revision !== session.deckRevision,
  };
}
export function createStudySessionService(db: PrismaClient) {
  return {
    async start(userId: string, input: StartStudyInput): Promise<StudySessionDto> {
      return db.$transaction(
        async (tx) => {
          const deck = await readableDeck(tx, userId, input.deckId);
          const previous = await tx.studySession.findUnique({
            where: { userId_requestId: { userId, requestId: input.requestId } },
            include,
          });
          if (previous) {
            if (!isDeepStrictEqual(previous.request, input))
              throw new AppError(409, 'EVENT_CONFLICT', 'ID запуска уже использован');
            return dto(tx, previous);
          }
          let cards = deck.cards;
          if (input.cardIds) {
            if (
              new Set(input.cardIds).size !== input.cardIds.length ||
              input.cardIds.some((id) => !cards.some((card) => card.id === id))
            )
              throw new AppError(400, 'INVALID_CARD', 'Карточки не принадлежат набору');
            cards = cards.filter((card) => input.cardIds!.includes(card.id));
          }
          if (input.options.filter === 'learning')
            cards = cards.filter(
              (card) =>
                !card.progress.some((row) => row.known && row.cardRevision === card.revision),
            );
          if (!cards.length)
            throw new AppError(400, 'NO_CARDS', 'Нет карточек для выбранного фильтра');
          let state: StudyState;
          try {
            state = createStudyState(
              cards.map(({ id, term, definition, revision }) => ({
                id,
                term,
                definition,
                revision,
              })),
              input.mode,
              input.options,
              () => randomInt(0, 0x100000000) / 0x100000000,
            );
          } catch (error) {
            if (error instanceof StudyRuleError)
              throw new AppError(400, 'STUDY_RULE', error.message);
            throw error;
          }
          const active = await tx.studySession.findMany({
            where: { userId, deckId: deck.id, mode: input.mode, status: 'active' },
          });
          for (const previous of active) {
            const oldState = previous.state as unknown as StudyState;
            await tx.studySession.update({
              where: { id: previous.id },
              data: {
                status: 'abandoned',
                state: json({ ...oldState, status: 'abandoned' }),
                completedAt: new Date(),
                elapsedMs: Math.min(
                  2147483647,
                  Math.max(0, Date.now() - previous.startedAt.getTime()),
                ),
                revision: { increment: 1 },
              },
            });
          }
          const session = await tx.studySession.create({
            data: {
              userId,
              deckId: deck.id,
              requestId: input.requestId,
              request: json(input),
              mode: input.mode,
              deckTitle: deck.title,
              deckRevision: deck.revision,
              cardCount: state.cards.length,
              direction: state.options.direction,
              summary: json(studySummary(state)),
              state: json(state),
            },
            include,
          });
          return dto(tx, session);
        },
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
    },
    async get(userId: string, id: string): Promise<StudySessionDto> {
      return dto(db, await owned(db, userId, id));
    },
    async active(userId: string, deckId: string, mode: StudyMode): Promise<StudySessionDto | null> {
      await readableDeck(db, userId, deckId);
      const session = await db.studySession.findFirst({
        where: { userId, deckId, mode, status: 'active' },
        include,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      });
      return session ? dto(db, session) : null;
    },
    async event(userId: string, id: string, input: StudyEventInput): Promise<StudySessionDto> {
      return db.$transaction(
        async (tx) => {
          const session = await owned(tx, userId, id);
          const previous = await tx.studyEvent.findUnique({
            where: { sessionId_eventId: { sessionId: id, eventId: input.eventId } },
          });
          if (previous) {
            if (!isDeepStrictEqual(previous.input, input))
              throw new AppError(409, 'EVENT_CONFLICT', 'ID события уже использован');
            return dto(tx, session);
          }
          if (session.revision !== input.revision) throw conflict();
          let next: ReturnType<typeof applyStudyAction>;
          try {
            next = applyStudyAction(session.state as unknown as StudyState, input.action);
          } catch (error) {
            if (error instanceof StudyRuleError)
              throw new AppError(400, 'STUDY_RULE', error.message);
            throw error;
          }
          const elapsedMs = Math.min(
            2147483647,
            Math.max(0, Date.now() - session.startedAt.getTime()),
          );
          const claim = await tx.studySession.updateMany({
            where: { id, revision: input.revision },
            data: {
              revision: { increment: 1 },
              state: json(next.state),
              summary: json(studySummary(next.state)),
              status: next.state.status,
              elapsedMs,
              ...(next.state.status !== 'active' ? { completedAt: new Date() } : {}),
            },
          });
          if (!claim.count) throw conflict();
          await tx.studyEvent.create({
            data: { sessionId: id, eventId: input.eventId, input: json(input) },
          });
          if (next.assessments.length) {
            const current = await tx.card.findMany({
              where: {
                deckId: session.deckId,
                id: { in: next.assessments.map((item) => item.card.id) },
              },
              select: { id: true, revision: true },
            });
            // An old snapshot can finish, but must not overwrite progress for edited/deleted cards.
            const accepted = next.assessments.filter((item) =>
              current.some(
                (card) => card.id === item.card.id && card.revision === item.card.revision,
              ),
            );
            await tx.reviewEvent.createMany({
              data: accepted.map((item) => ({
                userId,
                eventId: randomUUID(),
                cardId: item.card.id,
                cardRevision: item.card.revision,
                known: item.known,
              })),
            });
            for (const item of accepted) {
              const data = { cardRevision: item.card.revision, known: item.known };
              await tx.cardProgress.upsert({
                where: { userId_cardId: { userId, cardId: item.card.id } },
                create: { userId, cardId: item.card.id, ...data },
                update: data,
              });
            }
          }
          return dto(tx, await owned(tx, userId, id));
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      );
    },
    async overview(userId: string, days: number): Promise<StudyOverview> {
      const sessions = await db.studySession.findMany({
        where: {
          userId,
          deck: access(userId),
          startedAt: { gte: new Date(Date.now() - days * 86400000) },
        },
        select: {
          id: true,
          deckId: true,
          deckTitle: true,
          mode: true,
          status: true,
          startedAt: true,
          completedAt: true,
          elapsedMs: true,
          summary: true,
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      });
      const completed = sessions.filter((item) => item.status === 'completed');
      const summaries = completed.map((item) => item.summary as unknown as StudySummary);
      return {
        completed: completed.length,
        attempts: summaries.reduce((sum, item) => sum + item.attempts, 0),
        correct: summaries.reduce((sum, item) => sum + item.correct, 0),
        questions: summaries.reduce((sum, item) => sum + item.total, 0),
        elapsedMs: completed.reduce((sum, item) => sum + item.elapsedMs, 0),
        history: sessions.slice(0, 30).map((item) => ({
          id: item.id,
          deckId: item.deckId,
          deckTitle: item.deckTitle,
          mode: item.mode as StudyMode,
          status: item.status as StudySessionDto['status'],
          startedAt: item.startedAt.toISOString(),
          completedAt: item.completedAt?.toISOString() ?? null,
          elapsedMs: item.elapsedMs,
          summary: item.summary as unknown as StudySummary,
        })),
      };
    },
  };
}
