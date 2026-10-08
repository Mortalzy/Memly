import type {
  StartStudyInput,
  StudyEventInput,
  StudyMode,
  StudyOverview,
  StudySessionDto,
} from '@memly/contracts';
import { api } from '../shared/api';
export const studyClient = {
  active: (deckId: string, mode: StudyMode, signal?: AbortSignal) =>
    api<StudySessionDto | null>(`/v1/study/sessions/active?deckId=${deckId}&mode=${mode}`, {
      signal,
    }),
  get: (id: string, signal?: AbortSignal) =>
    api<StudySessionDto>(`/v1/study/sessions/${id}`, { signal }),
  start: (input: StartStudyInput) =>
    api<StudySessionDto>('/v1/study/sessions', { method: 'POST', body: JSON.stringify(input) }),
  event: (id: string, input: StudyEventInput) =>
    api<StudySessionDto>(`/v1/study/sessions/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  overview: (days: number, signal?: AbortSignal) =>
    api<StudyOverview>(`/v1/study/overview?days=${days}`, { signal }),
};
