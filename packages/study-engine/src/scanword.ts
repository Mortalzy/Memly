import {
  scanwordCandidates,
  type CardDto,
  type ScanwordBoardDto,
  type StudyAction,
  type StudyOptions,
  type StudyResultRow,
  type StudySummary,
} from '@memly/contracts';
import { requireRule } from './rules.ts';

interface Word {
  id: string;
  cardIndex: number;
  clue: string;
  answer: string;
  row: number;
  column: number;
  direction: 'across' | 'down';
}
interface Board {
  rows: number;
  columns: number;
  words: Word[];
}
export interface ScanwordState {
  boards: Board[];
  round: number;
  drafts: Record<string, string>;
  locked: Record<string, string>;
  solved: string[];
  mistakes: Record<string, number>;
  checks: Record<string, number>;
  hints: Record<string, number>;
  hintCount: number;
  answers: Record<string, string>;
  wrongWords: string[];
}
interface Tile {
  letter?: string;
  directions: Word['direction'][];
}
const coordinate = (row: number, column: number) => `${row}:${column}`;
function positions(word: Word): { row: number; column: number; letter: string }[] {
  return [...word.answer].map((letter, index) => ({
    row: word.row + (word.direction === 'down' ? index : 0),
    column: word.column + (word.direction === 'across' ? index : 0),
    letter,
  }));
}
function cluePosition(word: Word) {
  return {
    row: word.row - (word.direction === 'down' ? 1 : 0),
    column: word.column - (word.direction === 'across' ? 1 : 0),
  };
}
function bounds(words: Word[]) {
  const points = words.flatMap((word) => [cluePosition(word), ...positions(word)]);
  const minRow = Math.min(...points.map((point) => point.row));
  const minColumn = Math.min(...points.map((point) => point.column));
  const maxRow = Math.max(...points.map((point) => point.row));
  const maxColumn = Math.max(...points.map((point) => point.column));
  return {
    minRow,
    minColumn,
    maxRow,
    maxColumn,
    rows: maxRow - minRow + 1,
    columns: maxColumn - minColumn + 1,
  };
}
function occupied(words: Word[]): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  for (const word of words) {
    const clue = cluePosition(word);
    cells.set(coordinate(clue.row, clue.column), { directions: [] });
    for (const point of positions(word)) {
      const key = coordinate(point.row, point.column);
      const tile = cells.get(key) ?? { letter: point.letter, directions: [] };
      tile.directions.push(word.direction);
      cells.set(key, tile);
    }
  }
  return cells;
}
function placementScore(words: Word[], tiles: Map<string, Tile>, word: Word): number | null {
  const clue = cluePosition(word);
  if (tiles.has(coordinate(clue.row, clue.column))) return null;
  const end = {
    row: word.row + (word.direction === 'down' ? word.answer.length : 0),
    column: word.column + (word.direction === 'across' ? word.answer.length : 0),
  };
  if (tiles.get(coordinate(end.row, end.column))?.letter) return null;
  let crosses = 0;
  for (const point of positions(word)) {
    const tile = tiles.get(coordinate(point.row, point.column));
    if (tile) {
      if (tile.letter !== point.letter || tile.directions.includes(word.direction)) return null;
      crosses++;
    } else {
      const dr = word.direction === 'across' ? 1 : 0;
      const dc = word.direction === 'down' ? 1 : 0;
      if (
        tiles.get(coordinate(point.row - dr, point.column - dc))?.letter ||
        tiles.get(coordinate(point.row + dr, point.column + dc))?.letter
      )
        return null;
    }
  }
  const box = bounds([...words, word]);
  if (box.rows > 22 || box.columns > 22) return null;
  return crosses * 1000 - box.rows * box.columns;
}
function intersect(words: Word[], next: Word, random: () => number): Word | null {
  const tiles = occupied(words);
  let best: Word | null = null;
  let score = -Infinity;
  for (const [key, tile] of tiles) {
    if (!tile.letter) continue;
    const [row, column] = key.split(':').map(Number);
    for (let index = 0; index < next.answer.length; index++) {
      if (next.answer[index] !== tile.letter) continue;
      for (const direction of ['across', 'down'] as const) {
        if (tile.directions.includes(direction)) continue;
        const word = {
          ...next,
          direction,
          row: row - (direction === 'down' ? index : 0),
          column: column - (direction === 'across' ? index : 0),
        };
        const value = placementScore(words, tiles, word);
        const candidateScore = value === null ? null : value + random();
        if (candidateScore !== null && candidateScore > score) {
          score = candidateScore;
          best = word;
        }
      }
    }
  }
  return best;
}
export function createScanword(
  cards: CardDto[],
  options: StudyOptions,
  random: () => number,
): ScanwordState {
  const candidates = scanwordCandidates(cards, options.direction);
  requireRule(
    !candidates.excluded.length,
    'Выберите только подходящие карточки: одно слово из 2–18 букв без повторов',
  );
  const remaining: Word[] = candidates.eligible.map((item, cardIndex) => ({
    id: `w-${cardIndex}`,
    cardIndex,
    clue: item.clue,
    answer: item.answer,
    row: 0,
    column: 1,
    direction: 'across',
  }));
  const boards: Board[] = [];
  while (remaining.length) {
    const batch = remaining.slice(0, 8).sort((a, b) => b.answer.length - a.answer.length);
    const words = [batch.shift()!];
    // Prefer intersections, then use separate rows for words with no common letters.
    // Every selected word is retained; an oversized cluster moves to the next board.
    for (let pass = 0; pass < 2; pass++) {
      for (const next of batch) {
        if (words.some((word) => word.id === next.id)) continue;
        const crossing = intersect(words, next, random);
        if (crossing) words.push(crossing);
        else if (pass === 1) {
          const box = bounds(words);
          const separate = { ...next, row: box.maxRow + 2, column: box.minColumn + 1 };
          if (placementScore(words, occupied(words), separate) !== null) words.push(separate);
        }
      }
    }
    const box = bounds(words);
    boards.push({
      rows: box.rows,
      columns: box.columns,
      words: words.map((word) => ({
        ...word,
        row: word.row - box.minRow,
        column: word.column - box.minColumn,
      })),
    });
    for (const word of words)
      remaining.splice(
        remaining.findIndex((item) => item.id === word.id),
        1,
      );
  }
  return {
    boards,
    round: 0,
    drafts: {},
    locked: {},
    solved: [],
    mistakes: {},
    checks: {},
    hints: {},
    hintCount: 0,
    answers: {},
    wrongWords: [],
  };
}
function cellKey(state: ScanwordState, row: number, column: number): string {
  return `${state.round + 1}:${row}:${column}`;
}
function wordKeys(state: ScanwordState, word: Word): string[] {
  return positions(word).map((point) => cellKey(state, point.row, point.column));
}
function saveDraft(state: ScanwordState, cells: { key: string; value: string }[]): void {
  const board = state.boards[state.round];
  const allowed = new Set(board.words.flatMap((word) => wordKeys(state, word)));
  requireRule(new Set(cells.map((cell) => cell.key)).size === cells.length, 'Клетка повторяется');
  for (const cell of cells) {
    requireRule(allowed.has(cell.key), 'Клетка не принадлежит текущему раунду');
    requireRule(cell.value === '' || /^[A-Za-zА-Яа-яЁё]$/u.test(cell.value), 'Введите одну букву');
    requireRule(
      !state.locked[cell.key] || state.locked[cell.key] === cell.value.toUpperCase(),
      'Открытую букву нельзя изменить',
    );
  }
  for (const key of allowed) if (!state.locked[key]) delete state.drafts[key];
  for (const cell of cells) if (cell.value) state.drafts[cell.key] = cell.value.toUpperCase();
  state.wrongWords = [];
}
export function applyScanword(
  state: ScanwordState,
  action: StudyAction,
  cards: CardDto[],
): { completed: boolean; assessments: { card: CardDto; known: boolean }[] } {
  requireRule(
    'round' in action && action.round === state.round + 1,
    'Действие относится к другому раунду',
  );
  const board = state.boards[state.round];
  const assessments: { card: CardDto; known: boolean }[] = [];
  if (action.type === 'scanword-check')
    requireRule(
      Object.values(state.checks).reduce((sum, value) => sum + value, 0) < 5000,
      'Слишком много попыток. Начните новую игру.',
    );
  if (action.type === 'scanword-draft') saveDraft(state, action.cells);
  else if (action.type === 'scanword-check') {
    saveDraft(state, action.cells);
    for (const word of board.words) {
      if (state.solved.includes(word.id)) continue;
      const keys = wordKeys(state, word);
      if (keys.some((key) => !state.locked[key] && !state.drafts[key])) continue;
      const answer = keys.map((key) => state.locked[key] ?? state.drafts[key]).join('');
      state.answers[word.id] = answer;
      state.checks[word.id] = (state.checks[word.id] ?? 0) + 1;
      if (answer !== word.answer) {
        state.mistakes[word.id] = (state.mistakes[word.id] ?? 0) + 1;
        state.wrongWords.push(word.id);
      } else {
        state.solved.push(word.id);
        keys.forEach((key, index) => {
          state.locked[key] = word.answer[index];
        });
        assessments.push({ card: cards[word.cardIndex], known: !state.hints[word.id] });
      }
    }
  } else if (action.type === 'scanword-hint') {
    const word = board.words.find((word) => word.id === action.wordId);
    requireRule(word && !state.solved.includes(word.id), 'Слово уже разгадано или недоступно');
    const keys = wordKeys(state, word);
    const index = keys.findIndex((key) => !state.locked[key] && !state.drafts[key]);
    const target = index === -1 ? keys.findIndex((key) => !state.locked[key]) : index;
    requireRule(target !== -1, 'Все буквы этого слова уже открыты');
    state.locked[keys[target]] = word.answer[target];
    state.drafts[keys[target]] = word.answer[target];
    state.hintCount++;
    for (const affected of board.words)
      if (!state.solved.includes(affected.id) && wordKeys(state, affected).includes(keys[target]))
        state.hints[affected.id] = (state.hints[affected.id] ?? 0) + 1;
    state.wrongWords = [];
  } else if (action.type === 'scanword-next') {
    requireRule(
      board.words.every((word) => state.solved.includes(word.id)),
      'Сначала разгадайте все слова раунда',
    );
    requireRule(state.round + 1 < state.boards.length, 'Это последний раунд');
    state.round++;
    state.wrongWords = [];
  } else requireRule(false, 'Это действие недоступно в сканворде');
  return { completed: state.solved.length === cards.length, assessments };
}
export function scanwordSummary(state: ScanwordState, cards: CardDto[]): StudySummary {
  const independent = state.solved.filter((id) => !state.hints[id]);
  const correct = independent.filter((id) => !state.mistakes[id]).length;
  return {
    total: cards.length,
    answered: state.solved.length,
    correct,
    mistakes: Object.values(state.mistakes).reduce((sum, value) => sum + value, 0),
    attempts: Object.values(state.checks).reduce((sum, value) => sum + value, 0),
    mastered: independent.length,
    score: Math.round((correct / cards.length) * 100),
    hints: state.hintCount,
  };
}
export function scanwordResults(state: ScanwordState, cards: CardDto[]): StudyResultRow[] {
  return state.boards.flatMap((board) =>
    board.words.map((word) => ({
      cardId: cards[word.cardIndex].id,
      prompt: word.clue,
      expected: word.answer,
      answer: state.answers[word.id] ?? '',
      correct: state.solved.includes(word.id),
      mistakes: state.mistakes[word.id] ?? 0,
      hints: state.hints[word.id] ?? 0,
    })),
  );
}
export function scanwordView(state: ScanwordState, cards: CardDto[]): ScanwordBoardDto {
  const board = state.boards[state.round];
  const words = board.words.map((word) => ({
    id: word.id,
    cardId: cards[word.cardIndex].id,
    clue: word.clue,
    row: word.row,
    column: word.column,
    direction: word.direction,
    length: word.answer.length,
    solved: state.solved.includes(word.id),
    hints: state.hints[word.id] ?? 0,
  }));
  const letters = new Map<string, string[]>();
  const clues = new Map<string, string[]>();
  for (const word of board.words) {
    const clue = cluePosition(word);
    clues.set(cellKey(state, clue.row, clue.column), [word.id]);
    for (const key of wordKeys(state, word))
      letters.set(key, [...(letters.get(key) ?? []), word.id]);
  }
  return {
    rows: board.rows,
    columns: board.columns,
    round: state.round + 1,
    rounds: state.boards.length,
    words,
    wrongWords: state.wrongWords,
    hints: state.hintCount,
    cells: Array.from({ length: board.rows * board.columns }, (_, index) => {
      const row = Math.floor(index / board.columns),
        column = index % board.columns;
      const key = cellKey(state, row, column);
      return {
        key,
        row,
        column,
        kind: letters.has(key)
          ? ('letter' as const)
          : clues.has(key)
            ? ('clue' as const)
            : ('block' as const),
        wordIds: letters.get(key) ?? clues.get(key) ?? [],
        value: state.locked[key] ?? state.drafts[key] ?? '',
        locked: Boolean(state.locked[key]),
      };
    }),
  };
}
