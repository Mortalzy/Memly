import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabase } from '@memly/database';

test(
  'database sessions use UTC and preserve instants despite timezone options',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.equal(url.pathname, '/memly_test');
    url.searchParams.set('options', '-c timezone=Europe/Samara');
    const db = createDatabase(url.toString());
    t.after(() => db.$disconnect());
    const rows = await db.$queryRaw<{ zone: string; instant: Date; day: string }[]>`
    SELECT current_setting('TimeZone') AS zone,
      ${new Date('2026-10-13T20:00:00.001Z')}::timestamptz AS instant,
      (${new Date('2026-10-13T20:00:00.001Z')}::timestamptz AT TIME ZONE 'Europe/Samara')::date::text AS day
  `;
    assert.equal(rows[0].zone, 'UTC');
    assert.equal(rows[0].instant.toISOString(), '2026-10-13T20:00:00.001Z');
    assert.equal(rows[0].day, '2026-10-14');
  },
);
