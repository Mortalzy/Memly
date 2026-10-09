import { countLabel } from './ru';

export const progressText = {
  title: 'Прогресс',
  subtitle: 'Каждое завершённое занятие — шаг вперёд.',
  week: '7 дней',
  month: '30 дней',
  completed: 'Завершённых прохождений',
  activeDays: 'Дней с занятиями',
  streak: 'Текущая серия',
  streakHint: 'Дни подряд с завершёнными занятиями. Серия сохраняется до конца сегодняшнего дня.',
  activity: 'Активность по дням',
  activityHint: 'Количество завершённых прохождений',
  mode: 'Режим обучения',
  allModes: 'Все режимы',
  rule: 'Учитываются только занятия, пройденные до конца.',
  ruleHint: 'Каждое завершённое занятие в любом режиме — одно прохождение. Повторы тоже считаются.',
  today: 'Сегодня',
  todayHint: 'завершённых прохождений',
  keepStreak: 'Серия продолжается',
  startToday: 'Завершите занятие сегодня',
  startStreak: 'Первый шаг к новой серии',
  history: 'Последние завершённые занятия',
  allResults: 'Показать ещё',
  period: 'Период прогресса',
  collapse: 'Свернуть',
  result: 'Результат',
  empty: 'Здесь появится ваш прогресс',
  emptyHint: 'Пройдите занятие до конца в любом режиме — и на графике появится первый столбик.',
  emptyHistory: 'За выбранный период нет завершённых занятий.',
  noModeHistory: 'В этом режиме за выбранный период пока нет завершённых занятий.',
  loading: 'Загружаем прогресс…',
  retry: 'Повторить',
  chartHint: 'Наведите на столбик или выберите день, чтобы увидеть число прохождений.',
  fullHistory: 'Все занятия и незавершённые',
  demo: 'Демонстрационные данные — результаты занятий здесь не сохраняются.',
  dayCount: (value: number) => countLabel(value, ['день', 'дня', 'дней']),
  runCount: (value: number) => countLabel(value, ['прохождение', 'прохождения', 'прохождений']),
} as const;

export function progressDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' });
}
export function browserDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function chartScale(maximum: number): { maximum: number; ticks: number[] } {
  const rough = Math.max(1, maximum / 5);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((value) => value * power).find((value) => value >= rough)!;
  const top = Math.max(5 * step, Math.ceil(maximum / step) * step);
  return { maximum: top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}
