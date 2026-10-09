import { z } from 'zod';
import { studyModeSchema, type StudyHistoryItem, type StudyMode } from './study.ts';

export const activityQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30)]))
    .default(7),
  mode: studyModeSchema.optional(),
  timeZone: z
    .string()
    .max(100)
    .default('UTC')
    .refine((value) => {
      if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false;
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Укажите часовой пояс IANA'),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export interface ActivityDay {
  date: string;
  completed: number;
}
export interface StudyActivity {
  timeZone: string;
  today: string;
  days: ActivityDay[];
  completed: number;
  activeDays: number;
  streak: number;
  todayByMode: Record<StudyMode, number>;
  history: StudyHistoryItem[];
}
