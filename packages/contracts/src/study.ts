import { z } from 'zod';

export const studyModeSchema = z.enum(['cards', 'learn', 'test', 'match']);
export const studyOptionsSchema = z.strictObject({
  direction: z.enum(['forward', 'reverse']).default('forward'),
  answerType: z.enum(['choice', 'written', 'mixed']).default('mixed'),
  count: z.number().int().min(1).max(500).default(20),
  shuffle: z.boolean().default(true),
  filter: z.enum(['all', 'learning']).default('all'),
});
export const startStudySchema = z.strictObject({
  requestId: z.uuid(),
  deckId: z.uuid(),
  mode: studyModeSchema,
  options: studyOptionsSchema,
  cardIds: z.array(z.uuid()).min(1).max(500).optional(),
});
const questionId = z.string().min(1).max(80);
export const studyActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rate'), questionId, known: z.boolean() }),
  z.strictObject({ type: z.literal('answer'), questionId, value: z.string().max(5000) }),
  z.strictObject({ type: z.literal('next') }),
  z.strictObject({ type: z.literal('navigate'), index: z.number().int().min(0).max(499) }),
  z.strictObject({ type: z.literal('pair'), left: questionId, right: questionId }),
  z.strictObject({
    type: z.literal('test'),
    finish: z.boolean(),
    answers: z.array(z.strictObject({ questionId, value: z.string().max(5000) })).max(500),
  }),
  z.strictObject({ type: z.literal('abandon') }),
]);
export const studyEventSchema = z.strictObject({
  eventId: z.uuid(),
  revision: z.number().int().positive(),
  action: studyActionSchema,
});
export const activeStudySchema = z.object({ deckId: z.uuid(), mode: studyModeSchema });
export type StudyMode = z.infer<typeof studyModeSchema>;
export type StudyOptions = z.infer<typeof studyOptionsSchema>;
export type StartStudyInput = z.infer<typeof startStudySchema>;
export type StudyAction = z.infer<typeof studyActionSchema>;
export type StudyEventInput = z.infer<typeof studyEventSchema>;
export interface StudyQuestion {
  id: string;
  prompt: string;
  type: 'choice' | 'written' | 'card';
  options: { id: string; text: string }[];
  back?: string;
  known?: boolean;
}
export interface StudyFeedback {
  prompt: string;
  expected: string;
  answer: string;
  correct: boolean;
}
export interface StudyResultRow extends StudyFeedback {
  cardId: string;
  mistakes: number;
}
export interface StudySummary {
  total: number;
  answered: number;
  correct: number;
  mistakes: number;
  attempts: number;
  mastered: number;
  score: number;
}
export interface StudySessionDto {
  id: string;
  deckId: string;
  deckTitle: string;
  deckRevision: number;
  mode: StudyMode;
  options: StudyOptions;
  revision: number;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  summary: StudySummary;
  questions: StudyQuestion[];
  current: StudyQuestion | null;
  cursor: number;
  drafts: Record<string, string>;
  feedback: StudyFeedback | null;
  board: {
    left: { id: string; text: string; matched: boolean }[];
    right: { id: string; text: string; matched: boolean }[];
    round: number;
    rounds: number;
  } | null;
  results: StudyResultRow[];
  bestMs: number | null;
  outdated: boolean;
}
export interface StudyHistoryItem {
  id: string;
  deckId: string;
  deckTitle: string;
  mode: StudyMode;
  status: StudySessionDto['status'];
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  summary: StudySummary;
}
export interface StudyOverview {
  completed: number;
  attempts: number;
  correct: number;
  questions: number;
  elapsedMs: number;
  history: StudyHistoryItem[];
}
