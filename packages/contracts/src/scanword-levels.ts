import { z } from 'zod';

export const scanwordLevelIdSchema = z.enum(['warmup', 'around-us', 'nature', 'science', 'final']);
export const startScanwordLevelSchema = z.strictObject({ requestId: z.uuid() });
export type ScanwordLevelId = z.infer<typeof scanwordLevelIdSchema>;
export type StartScanwordLevelInput = z.infer<typeof startScanwordLevelSchema>;
export const SCANWORD_LEVELS = [
  { id: 'warmup', number: 1, title: 'Разминка', wordCount: 6, difficulty: 'easy', revision: 1 },
  {
    id: 'around-us',
    number: 2,
    title: 'Мир вокруг',
    wordCount: 8,
    difficulty: 'easy',
    revision: 1,
  },
  { id: 'nature', number: 3, title: 'Природа', wordCount: 10, difficulty: 'medium', revision: 1 },
  {
    id: 'science',
    number: 4,
    title: 'Наука и техника',
    wordCount: 12,
    difficulty: 'medium',
    revision: 1,
  },
  {
    id: 'final',
    number: 5,
    title: 'Финальный вызов',
    wordCount: 15,
    difficulty: 'hard',
    revision: 1,
  },
] as const;
export type ScanwordLevelInfo = (typeof SCANWORD_LEVELS)[number];
export interface ScanwordLevelDto {
  id: ScanwordLevelId;
  number: number;
  title: string;
  wordCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  revision: number;
  unlocked: boolean;
  completed: boolean;
  completedAt: string | null;
  activeSessionId: string | null;
}
export interface ScanwordLevelsDto {
  levels: ScanwordLevelDto[];
  completed: number;
  total: number;
}
