import type { CardDto } from './index.ts';
import type { StudyOptions } from './study.ts';

export const SCANWORD_MAX_LENGTH = 18;
export function scanwordAnswer(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase();
}
export function scanwordCandidates(
  cards: Pick<CardDto, 'id' | 'term' | 'definition'>[],
  direction: StudyOptions['direction'],
) {
  const seen = new Set<string>();
  const eligible: { cardId: string; clue: string; answer: string }[] = [];
  const excluded: { cardId: string; answer: string; reason: 'format' | 'duplicate' }[] = [];
  for (const card of cards) {
    const answer = scanwordAnswer(direction === 'reverse' ? card.term : card.definition);
    const clue = direction === 'reverse' ? card.definition : card.term;
    if (!/^[A-ZА-ЯЁ]{2,18}$/u.test(answer))
      excluded.push({ cardId: card.id, answer, reason: 'format' });
    else if (seen.has(answer)) excluded.push({ cardId: card.id, answer, reason: 'duplicate' });
    else {
      seen.add(answer);
      eligible.push({ cardId: card.id, clue, answer });
    }
  }
  return { eligible, excluded };
}
export interface ScanwordWordDto {
  id: string;
  cardId: string;
  clue: string;
  row: number;
  column: number;
  direction: 'across' | 'down';
  length: number;
  solved: boolean;
  hints: number;
}
export interface ScanwordCellDto {
  key: string;
  row: number;
  column: number;
  kind: 'block' | 'clue' | 'letter';
  wordIds: string[];
  value: string;
  locked: boolean;
}
export interface ScanwordBoardDto {
  rows: number;
  columns: number;
  round: number;
  rounds: number;
  words: ScanwordWordDto[];
  cells: ScanwordCellDto[];
  wrongWords: string[];
  hints: number;
}
