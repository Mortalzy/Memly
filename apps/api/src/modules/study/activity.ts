import type { ActivityDay, ActivityQuery, StudyActivity, StudyMode } from '@memly/contracts';

export interface ActivityCount {
  date: string;
  mode: StudyMode;
  completed: number;
}
export function calendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function activityTotals(
  counts: ActivityCount[],
  query: ActivityQuery,
  today: string,
): Omit<StudyActivity, 'history'> {
  const daily = new Map<string, number>();
  const todayByMode = { cards: 0, learn: 0, test: 0, match: 0 };
  for (const row of counts) {
    if (row.date > today || (query.mode && row.mode !== query.mode)) continue;
    daily.set(row.date, (daily.get(row.date) ?? 0) + row.completed);
    if (row.date === today) todayByMode[row.mode] += row.completed;
  }
  const days: ActivityDay[] = Array.from({ length: query.days }, (_, index) => {
    const date = shiftDate(today, index - query.days + 1);
    return { date, completed: daily.get(date) ?? 0 };
  });
  // Yesterday's streak stays available while today's study has not yet been completed.
  let cursor = daily.get(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (daily.get(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return {
    timeZone: query.timeZone,
    today,
    days,
    completed: days.reduce((sum, day) => sum + day.completed, 0),
    activeDays: days.filter((day) => day.completed > 0).length,
    streak,
    todayByMode,
  };
}
