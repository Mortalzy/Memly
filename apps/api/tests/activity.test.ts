import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityQuerySchema } from '@memly/contracts';
import { activityTotals, calendarDate, shiftDate } from '../src/modules/study/activity.ts';

test('calendar days use the requested timezone across midnight and DST', () => {
  assert.equal(calendarDate(new Date('2026-10-09T20:30:00Z'), 'Europe/Samara'), '2026-10-10');
  assert.equal(calendarDate(new Date('2026-10-09T20:30:00Z'), 'America/New_York'), '2026-10-09');
  assert.equal(calendarDate(new Date('2026-03-29T22:30:00Z'), 'Europe/Berlin'), '2026-03-30');
  assert.equal(shiftDate('2026-03-30', -1), '2026-03-29');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
});
test('empty days remain zero and repeats in different modes count independently', () => {
  const result = activityTotals(
    [
      { date: '2026-10-08', mode: 'cards', completed: 2 },
      { date: '2026-10-09', mode: 'test', completed: 1 },
      { date: '2026-10-09', mode: 'match', completed: 3 },
      { date: '2026-10-10', mode: 'learn', completed: 1 },
    ],
    { days: 7, timeZone: 'Europe/Samara' },
    '2026-10-09',
  );
  assert.equal(result.days.length, 7);
  assert.deepEqual(
    result.days.map((day) => day.completed),
    [0, 0, 0, 0, 0, 2, 4],
  );
  assert.equal(result.completed, 6);
  assert.equal(result.activeDays, 2);
  assert.equal(result.streak, 2);
  assert.deepEqual(result.todayByMode, { cards: 0, learn: 0, test: 1, match: 3 });
  const filtered = activityTotals(
    [
      { date: '2026-10-09', mode: 'cards', completed: 2 },
      { date: '2026-10-09', mode: 'test', completed: 1 },
    ],
    { days: 7, timeZone: 'UTC', mode: 'test' },
    '2026-10-09',
  );
  assert.equal(filtered.completed, 1);
  assert.equal(filtered.todayByMode.cards, 0);
});
test('streak extends beyond the displayed week and survives until end of today', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    date: shiftDate('2026-10-09', -index),
    mode: 'cards' as const,
    completed: 1,
  }));
  assert.equal(activityTotals(rows, { days: 7, timeZone: 'UTC' }, '2026-10-09').streak, 40);
  assert.equal(activityTotals(rows, { days: 30, timeZone: 'UTC' }, '2026-10-10').streak, 40);
  assert.equal(activityTotals(rows, { days: 7, timeZone: 'UTC' }, '2026-10-11').streak, 0);
  assert.equal(activityTotals([], { days: 7, timeZone: 'UTC' }, '2026-10-09').completed, 0);
});
test('activity query rejects unsupported periods, modes and timezone strings', () => {
  assert.equal(activityQuerySchema.parse({ days: '30', timeZone: 'Europe/Samara' }).days, 30);
  for (const input of [
    { days: 366 },
    { mode: 'unknown' },
    { timeZone: "UTC'; SELECT 1" },
    { timeZone: '+04:00' },
    { timeZone: 'Imaginary/City' },
  ])
    assert.equal(activityQuerySchema.safeParse(input).success, false);
});
