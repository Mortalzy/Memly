import type { ActivityQuery, StudyActivity } from '@memly/contracts';
import { browserDate } from '../shared/progress-text';

export function progressDemo(query: ActivityQuery): StudyActivity {
  const today = browserDate();
  const counts = [2, 3, 0, 4, 1, 3, 5];
  const days = Array.from({ length: query.days }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index - query.days + 1);
    const count = counts[(index + 7 - (query.days % 7)) % 7];
    return {
      date: date.toISOString().slice(0, 10),
      completed: query.mode ? Math.floor(count / 2) : count,
    };
  });
  const todayByMode = { cards: 2, learn: 1, test: 1, match: 1 };
  if (query.mode) {
    for (const mode of ['cards', 'learn', 'test', 'match'] as const)
      if (mode !== query.mode) todayByMode[mode] = 0;
    days[days.length - 1].completed = todayByMode[query.mode];
  }
  let streak = 0;
  for (let index = days.length - 1; index >= 0 && days[index].completed; index--) streak++;
  return {
    timeZone: query.timeZone,
    today,
    days,
    completed: days.reduce((sum, day) => sum + day.completed, 0),
    activeDays: days.filter((day) => day.completed).length,
    streak,
    todayByMode,
    history: [],
  };
}
