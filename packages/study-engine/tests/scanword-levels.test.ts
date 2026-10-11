import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCANWORD_LEVELS } from '@memly/contracts';
import { createScanwordLevelState } from '../src/scanword-levels.ts';
import { applyStudyAction, createStudyState, studyView } from '../src/index.ts';

test('five authored levels use stable single-board layouts, hide solutions and can all be solved', () => {
  assert.deepEqual(
    SCANWORD_LEVELS.map((level) => level.wordCount),
    [6, 8, 10, 12, 15],
  );
  for (const level of SCANWORD_LEVELS) {
    const state = createScanwordLevelState(level.id);
    assert.deepEqual(state, createScanwordLevelState(level.id));
    const view = studyView(state).scanword!;
    assert.equal(view.rounds, 1);
    assert.equal(view.words.length, level.wordCount);
    assert.ok(view.words.every((word) => !('answer' in word)));
    assert.ok(view.cells.every((cell) => !cell.value));
    assert.equal(view.cells.filter((cell) => cell.kind === 'clue').length, level.wordCount);
    const cells = new Map<string, string>();
    for (const word of state.scanword!.boards[0].words)
      [...word.answer].forEach((value, index) => {
        const key = `1:${word.row + (word.direction === 'down' ? index : 0)}:${word.column + (word.direction === 'across' ? index : 0)}`;
        assert.ok(!cells.has(key) || cells.get(key) === value);
        cells.set(key, value);
      });
    assert.equal(view.cells.filter((cell) => cell.kind === 'letter').length, cells.size);
    const done = applyStudyAction(state, {
      type: 'scanword-check',
      round: 1,
      cells: [...cells].map(([key, value]) => ({ key, value })),
    }).state;
    assert.equal(done.status, 'completed');
    assert.equal(studyView(done).summary.score, 100);
    assert.equal(studyView(done).summary.answered, level.wordCount);
  }
});

test('authored layouts reject overlapping clues, wrong crossing letters and out-of-bounds words', () => {
  const original = createScanwordLevelState('warmup');
  const board = original.scanword!.boards[0];
  const layout = () => ({
    rows: board.rows,
    columns: board.columns,
    words: board.words.map((word) => ({
      row: word.row,
      column: word.column,
      direction: word.direction,
    })),
  });
  const outside = layout();
  outside.words[0].column = -1;
  assert.throws(() =>
    createStudyState(original.cards, 'scanword', original.options, () => 0, outside),
  );
  const overlap = layout();
  overlap.words[1] = overlap.words[0];
  assert.throws(() =>
    createStudyState(original.cards, 'scanword', original.options, () => 0, overlap),
  );
  const wrong = original.cards.map((card, index) =>
    index === 1 ? { ...card, term: 'ДАА' } : card,
  );
  assert.throws(() => createStudyState(wrong, 'scanword', original.options, () => 0, layout()));
});
