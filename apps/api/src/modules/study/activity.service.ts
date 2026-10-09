import { Prisma, type PrismaClient } from '@memly/database';
import type { ActivityQuery, StudyActivity, StudyMode, StudySummary } from '@memly/contracts';
import { activityTotals, calendarDate, shiftDate, type ActivityCount } from './activity.ts';

export function createActivityService(db: PrismaClient) {
  return {
    async get(userId: string, query: ActivityQuery): Promise<StudyActivity> {
      const now = new Date();
      const today = calendarDate(now, query.timeZone);
      const start = shiftDate(today, 1 - query.days);
      // Aggregate only dates and modes, never load the large session snapshots for a chart.
      const [counts, history] = await db.$transaction(
        [
          db.$queryRaw<ActivityCount[]>(Prisma.sql`
          SELECT (s.completed_at AT TIME ZONE ${query.timeZone})::date::text AS date,
            s.mode, COUNT(*)::integer AS completed
          FROM study_sessions s JOIN decks d ON d.id = s.deck_id
          WHERE s.user_id = ${userId} AND s.status = 'completed'
            AND s.completed_at <= ${now}
            AND (d.owner_id = ${userId} OR d.visibility = 'public')
            ${query.mode ? Prisma.sql`AND s.mode = ${query.mode}` : Prisma.empty}
          GROUP BY 1, 2
        `),
          db.studySession.findMany({
            where: {
              userId,
              status: 'completed',
              completedAt: { lte: now },
              deck: { OR: [{ ownerId: userId }, { visibility: 'public' }] },
              ...(query.mode ? { mode: query.mode } : {}),
            },
            select: {
              id: true,
              deckId: true,
              deckTitle: true,
              mode: true,
              startedAt: true,
              completedAt: true,
              elapsedMs: true,
              summary: true,
            },
            orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
            take: 30,
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return {
        ...activityTotals(counts, query, today),
        history: history
          .filter((row) => calendarDate(row.completedAt!, query.timeZone) >= start)
          .map((row) => ({
            id: row.id,
            deckId: row.deckId,
            deckTitle: row.deckTitle,
            mode: row.mode as StudyMode,
            status: 'completed',
            startedAt: row.startedAt.toISOString(),
            completedAt: row.completedAt!.toISOString(),
            elapsedMs: row.elapsedMs,
            summary: row.summary as unknown as StudySummary,
          })),
      };
    },
  };
}
