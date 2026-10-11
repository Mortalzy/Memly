import {
  SCANWORD_LEVELS,
  type ScanwordLevelId,
  type ScanwordLevelsDto,
  type StudyEventInput,
  type StudySessionDto,
} from '@memly/contracts';
import type { StudyState } from '@memly/study-engine';

const sessions = new Map<
  string,
  { dto: StudySessionDto; state: StudyState; events: Set<string> }
>();
const starts = new Map<string, string>();
export function demoScanwordLevels(): ScanwordLevelsDto {
  const records = [...sessions.values()].map((record) => record.dto);
  const completed = new Set(
    records.filter((row) => row.status === 'completed').map((row) => row.levelId),
  );
  const levels = SCANWORD_LEVELS.map((level, index) => ({
    ...level,
    unlocked: SCANWORD_LEVELS.slice(0, index).every((before) => completed.has(before.id)),
    completed: completed.has(level.id),
    completedAt:
      records.find((row) => row.levelId === level.id && row.status === 'completed')?.completedAt ??
      null,
    activeSessionId:
      records.find((row) => row.levelId === level.id && row.status === 'active')?.id ?? null,
  }));
  return {
    levels,
    total: levels.length,
    completed: levels.filter((level) => level.completed).length,
  };
}
export const scanwordDemo = {
  async active(id: ScanwordLevelId) {
    const level = demoScanwordLevels().levels.find((level) => level.id === id)!;
    if (!level.unlocked) throw new Error('Сначала пройдите предыдущий уровень');
    return level.activeSessionId ? sessions.get(level.activeSessionId)!.dto : null;
  },
  async get(id: string) {
    const record = sessions.get(id);
    if (!record) throw new Error('Демонстрационная игра не найдена');
    return record.dto;
  },
  async start(levelId: ScanwordLevelId, requestId: string): Promise<StudySessionDto> {
    const old = starts.get(requestId);
    if (old) return sessions.get(old)!.dto;
    await this.active(levelId);
    // Vite removes this branch and the answer catalog from the normal production build.
    if (import.meta.env.VITE_DEMO_MODE !== 'true')
      throw new Error('Готовые игры доступны после входа в аккаунт');
    const { createScanwordLevelState } = await import('@memly/study-engine/scanword-levels');
    const { studyView } = await import('@memly/study-engine');
    const state = createScanwordLevelState(levelId);
    const level = SCANWORD_LEVELS.find((level) => level.id === levelId)!;
    for (const record of sessions.values())
      if (record.dto.levelId === levelId && record.dto.status === 'active') {
        record.dto.status = 'abandoned';
        record.state.status = 'abandoned';
      }
    const dto: StudySessionDto = {
      id: crypto.randomUUID(),
      deckId: null,
      levelId,
      deckTitle: `Уровень ${level.number}: ${level.title}`,
      deckRevision: level.revision,
      mode: 'scanword',
      options: state.options,
      revision: 1,
      status: 'active',
      startedAt: new Date().toISOString(),
      completedAt: null,
      elapsedMs: 0,
      ...studyView(state),
      bestMs: null,
      outdated: false,
    };
    sessions.set(dto.id, { dto, state, events: new Set() });
    starts.set(requestId, dto.id);
    return dto;
  },
  async event(id: string, input: StudyEventInput) {
    const record = sessions.get(id);
    if (!record) throw new Error('Демонстрационная игра не найдена');
    if (record.events.has(input.eventId)) return record.dto;
    if (input.revision !== record.dto.revision)
      throw new Error('Игра изменилась. Загрузите сохранённое состояние.');
    const { applyStudyAction, studyView } = await import('@memly/study-engine');
    record.state = applyStudyAction(record.state, input.action).state;
    record.events.add(input.eventId);
    record.dto = {
      ...record.dto,
      ...studyView(record.state),
      revision: record.dto.revision + 1,
      status: record.state.status,
      elapsedMs: Date.now() - new Date(record.dto.startedAt).getTime(),
      completedAt: record.state.status === 'completed' ? new Date().toISOString() : null,
    };
    return record.dto;
  },
};
