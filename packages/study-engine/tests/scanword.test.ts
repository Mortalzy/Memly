import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  scanwordCandidates,
  studyEventSchema,
  type CardDto,
  type StudyOptions,
} from '@memly/contracts';
import { applyStudyAction, createStudyState, studyView, type StudyState } from '../src/index.ts';

const options: StudyOptions = {
  direction: 'reverse',
  answerType: 'written',
  count: 500,
  shuffle: false,
  filter: 'all',
};
const terms = [
  'APPLE',
  'PEAR',
  'MILK',
  'BREAD',
  'LEMON',
  'TEA',
  'SALT',
  'COFFEE',
  'BUTTER',
  'WATER',
  'ORANGE',
  'CHERRY',
  'МОЛОКО',
  'ЁЖ',
  'АБВ',
  'ГДЕ',
  'ABCDEFGHIJKLMNOPQR',
];
const cards: CardDto[] = terms.map((term, index) => ({
  id: String(index),
  term,
  definition: `Подсказка ${index}`,
  revision: 1,
}));
const start = (selected = cards) => createStudyState(selected, 'scanword', options, () => 0.37);
function fill(state: StudyState) {
  const board = state.scanword!.boards[state.scanword!.round];
  const cells = new Map<string, string>();
  for (const word of board.words)
    [...word.answer].forEach((value, index) => {
      const row = word.row + (word.direction === 'down' ? index : 0);
      const column = word.column + (word.direction === 'across' ? index : 0);
      const key = `${state.scanword!.round + 1}:${row}:${column}`;
      assert.ok(!cells.has(key) || cells.get(key) === value, 'intersections must agree');
      cells.set(key, value);
    });
  return [...cells].map(([key, value]) => ({ key, value }));
}
test('eligibility previews phrases, punctuation, excessive length and duplicate normalized answers', () => {
  const input = [
    { id: '1', term: ' apple ', definition: 'Яблоко' },
    { id: '2', term: 'APPLE', definition: 'Фрукт' },
    { id: '3', term: 'take your time', definition: 'Не торопись' },
    { id: '4', term: 'C++', definition: 'Язык' },
    { id: '5', term: 'x'.repeat(19), definition: 'Длинное слово' },
    { id: '6', term: 'ёж', definition: 'Зверь' },
  ];
  const preview = scanwordCandidates(input, 'reverse');
  assert.deepEqual(
    preview.eligible.map((item) => item.answer),
    ['APPLE', 'ЁЖ'],
  );
  assert.equal(preview.excluded[0].reason, 'duplicate');
  assert.equal(scanwordCandidates(input.slice(0, 1), 'forward').eligible[0].answer, 'ЯБЛОКО');
  assert.throws(() => start(input.map((card) => ({ ...card, revision: 1 }))));
});
test('boards retain every word, have valid clue cells, bounded coordinates and consistent intersections', () => {
  const state = start();
  assert.ok(state.scanword!.boards.length >= 3);
  const ids = state.scanword!.boards.flatMap((board) => board.words.map((word) => word.cardIndex));
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    cards.map((_, index) => index),
  );
  for (let round = 0; round < state.scanword!.boards.length; round++) {
    state.scanword!.round = round;
    const board = studyView(state).scanword!;
    assert.ok(board.rows <= 22 && board.columns <= 22);
    assert.ok(board.words.length <= 8);
    assert.ok(board.cells.every((cell) => !cell.value));
    assert.ok(board.words.every((word) => !('answer' in word)));
    const expected = fill(state);
    assert.equal(board.cells.filter((cell) => cell.kind === 'letter').length, expected.length);
    assert.equal(board.cells.filter((cell) => cell.kind === 'clue').length, board.words.length);
    for (const word of board.words) {
      const clueRow = word.row - (word.direction === 'down' ? 1 : 0);
      const clueColumn = word.column - (word.direction === 'across' ? 1 : 0);
      const clue = board.cells.find((cell) => cell.row === clueRow && cell.column === clueColumn)!;
      assert.equal(clue.kind, 'clue');
      assert.deepEqual(clue.wordIds, [word.id]);
      assert.equal(
        board.cells.filter((cell) => cell.kind === 'letter' && cell.wordIds.includes(word.id))
          .length,
        word.length,
      );
    }
  }
  assert.deepEqual(start().scanword!.boards, start().scanword!.boards);
});
test('all rounds must finish; drafts restore but do not grade; only server checks can complete a game', () => {
  let state = start();
  const initial = studyView(state).scanword!;
  const cells = fill(state).map((cell) => ({ ...cell, value: cell.value.toLowerCase() }));
  const draft = applyStudyAction(state, { type: 'scanword-draft', round: 1, cells });
  assert.deepEqual(draft.assessments, []);
  state = structuredClone(draft.state);
  assert.equal(studyView(state).summary.answered, 0);
  assert.ok(studyView(state).scanword!.cells.some((cell) => cell.value));
  assert.deepEqual(studyView(state).results, []);
  assert.throws(() => applyStudyAction(state, { type: 'scanword-next', round: 1 }));
  for (let round = 1; state.status === 'active'; round++) {
    state = applyStudyAction(state, { type: 'scanword-check', round, cells: fill(state) }).state;
    if (state.status === 'active') {
      assert.equal(
        studyView(state).scanword!.words.every((word) => word.solved),
        true,
      );
      assert.throws(() =>
        applyStudyAction(state, { type: 'scanword-draft', round: round + 1, cells: [] }),
      );
      state = applyStudyAction(state, { type: 'scanword-next', round }).state;
    }
  }
  const result = studyView(state);
  assert.equal(result.summary.total, cards.length);
  assert.equal(result.summary.answered, cards.length);
  assert.equal(result.summary.score, 100);
  assert.equal(result.results.length, cards.length);
  assert.equal(result.summary.hints, 0);
  assert.throws(() =>
    applyStudyAction(state, { type: 'scanword-check', round: initial.round, cells: [] }),
  );
});
test('empty cells are not mistakes, drafts can be cleared, hints disclose one letter and cannot inflate mastery', () => {
  let state = start([cards[0]]);
  state = applyStudyAction(state, { type: 'scanword-check', round: 1, cells: [] }).state;
  assert.equal(studyView(state).summary.attempts, 0);
  const cell = fill(state)[0];
  state = applyStudyAction(state, {
    type: 'scanword-draft',
    round: 1,
    cells: [{ ...cell, value: 'Z' }],
  }).state;
  state = applyStudyAction(state, { type: 'scanword-draft', round: 1, cells: [] }).state;
  assert.ok(studyView(state).scanword!.cells.every((cell) => !cell.value));
  state = applyStudyAction(state, { type: 'scanword-hint', round: 1, wordId: 'w-0' }).state;
  const view = studyView(state);
  assert.equal(view.scanword!.cells.filter((cell) => cell.value).length, 1);
  assert.equal(view.summary.hints, 1);
  assert.equal(view.summary.answered, 0);
  assert.throws(() =>
    applyStudyAction(state, { type: 'scanword-draft', round: 1, cells: [{ ...cell, value: 'Z' }] }),
  );
  const done = applyStudyAction(state, { type: 'scanword-check', round: 1, cells: fill(state) });
  assert.equal(done.state.status, 'completed');
  assert.equal(done.assessments[0].known, false);
  assert.equal(studyView(done.state).summary.mastered, 0);
  assert.equal(studyView(done.state).summary.score, 0);
  assert.equal(studyView(done.state).results[0].hints, 1);
});
test('incorrect words can be corrected; foreign cells, stale rounds and actions from other modes are rejected', () => {
  let state = start([cards[0]]);
  state = applyStudyAction(state, {
    type: 'scanword-check',
    round: 1,
    cells: fill(state).map((cell) => ({ ...cell, value: 'Z' })),
  }).state;
  assert.equal(studyView(state).summary.mistakes, 1);
  assert.deepEqual(studyView(state).scanword!.wrongWords, ['w-0']);
  assert.throws(() => applyStudyAction(state, { type: 'scanword-draft', round: 2, cells: [] }));
  assert.throws(() =>
    applyStudyAction(state, {
      type: 'scanword-draft',
      round: 1,
      cells: [{ key: '1:999:999', value: 'A' }],
    }),
  );
  assert.throws(() =>
    applyStudyAction(state, {
      type: 'scanword-draft',
      round: 1,
      cells: [fill(state)[0], fill(state)[0]],
    }),
  );
  assert.throws(() => applyStudyAction(state, { type: 'rate', questionId: 'w-0', known: true }));
  const regular = createStudyState([cards[0]], 'cards', options, () => 0.1);
  assert.throws(() => applyStudyAction(regular, { type: 'scanword-draft', round: 1, cells: [] }));
  state = applyStudyAction(state, { type: 'scanword-check', round: 1, cells: fill(state) }).state;
  assert.equal(state.status, 'completed');
  assert.equal(studyView(state).summary.score, 0);
  assert.equal(studyView(state).results[0].mistakes, 1);
  assert.equal(
    studyEventSchema.safeParse({
      eventId: crypto.randomUUID(),
      revision: 1,
      action: { type: 'scanword-draft', round: 1, cells: [{ key: '1:0:1', value: 'AA' }] },
    }).success,
    false,
  );
});
test('a maximum-size selection generates in bounded fields without dropping cards', () => {
  const maximum = Array.from({ length: 500 }, (_, index) => ({
    id: String(index),
    term: `WORD${String.fromCharCode(65 + Math.floor(index / 26), 65 + (index % 26))}`,
    definition: String(index),
    revision: 1,
  }));
  const state = start(maximum);
  assert.equal(state.scanword!.boards.flatMap((board) => board.words).length, 500);
  assert.ok(state.scanword!.boards.every((board) => board.rows * board.columns <= 484));
});
