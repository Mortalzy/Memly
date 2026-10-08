import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyStudyAction,
  createStudyState,
  normalizeAnswer,
  studySummary,
  studyView,
} from '../src/index.ts';
import type { StudyOptions } from '@memly/contracts';
const options: StudyOptions = {
  direction: 'forward',
  answerType: 'mixed',
  count: 20,
  shuffle: false,
  filter: 'all',
};
const cards = [
  { id: '1', term: 'Apple', definition: 'Яблоко', revision: 1 },
  { id: '2', term: 'Cherry', definition: 'Вишня', revision: 1 },
];
const random = () => 0.37;
test('normalization ignores case, spacing and typographic variants but keeps meaningful punctuation and accents', () => {
  assert.equal(normalizeAnswer('  TAKE   your\nTIME '), 'take your time');
  assert.equal(normalizeAnswer('Don’t'), normalizeAnswer("don't"));
  assert.notEqual(normalizeAnswer('C++'), normalizeAnswer('C'));
  assert.notEqual(normalizeAnswer('résumé'), normalizeAnswer('resume'));
});
test('choice options are distinct, shuffled, and answers are absent from unfinished test DTOs', () => {
  const state = createStudyState(cards, 'test', { ...options, answerType: 'choice' }, random);
  const view = studyView(state);
  for (const q of view.questions) {
    assert.equal(q.options.length, 2);
    assert.equal('expected' in q, false);
    assert.equal('cardIndex' in q, false);
    assert.equal('back' in q, false);
  }
  assert.deepEqual(view.results, []);
  const duplicate = createStudyState(
    [cards[0], { ...cards[1], definition: 'ЯБЛОКО' }],
    'learn',
    { ...options, answerType: 'choice' },
    random,
  );
  assert.equal(duplicate.questions[0].type, 'written');
});
test('learning repeats mistakes, requires written recall after a choice, and completes without endless wraparound', () => {
  let state = createStudyState(cards, 'learn', options, random);
  const q = state.questions.find((q) => q.id === state.queue[0])!;
  const wrong = q.options.find((o) => o.text !== q.expected)!;
  state = applyStudyAction(state, { type: 'answer', questionId: q.id, value: wrong.id }).state;
  assert.equal(state.feedback?.correct, false);
  assert.equal(state.queue.at(-1), q.id);
  assert.throws(() =>
    applyStudyAction(state, { type: 'answer', questionId: state.queue[0], value: 'anything' }),
  );
  let iterations = 0;
  while (state.status === 'active') {
    if (state.feedback) state = applyStudyAction(state, { type: 'next' }).state;
    else {
      const q = state.questions.find((q) => q.id === state.queue[0])!;
      state = applyStudyAction(state, {
        type: 'answer',
        questionId: q.id,
        value:
          q.type === 'choice'
            ? q.options.find((o) => o.text === q.expected)!.id
            : q.expected.toUpperCase(),
      }).state;
    }
    assert.ok(++iterations < 20);
  }
  assert.deepEqual(studySummary(state), {
    total: 4,
    answered: 4,
    correct: 3,
    mistakes: 1,
    attempts: 5,
    mastered: 2,
    score: 75,
  });
});
test('test drafts do not grade or update progress before finish; grade depends on actual answers', () => {
  let state = createStudyState(
    cards,
    'test',
    { ...options, answerType: 'written', direction: 'reverse' },
    random,
  );
  let next = applyStudyAction(state, {
    type: 'test',
    finish: false,
    answers: [{ questionId: 'q-0-0', value: ' apple ' }],
  });
  state = next.state;
  assert.deepEqual(next.assessments, []);
  assert.equal(studyView(state).feedback, null);
  assert.equal(studyView(state).results.length, 0);
  assert.throws(() => applyStudyAction(state, { type: 'test', finish: true, answers: [] }));
  next = applyStudyAction(state, {
    type: 'test',
    finish: true,
    answers: [{ questionId: 'q-1-0', value: 'wrong' }],
  });
  assert.equal(next.state.status, 'completed');
  assert.equal(studySummary(next.state).score, 50);
  assert.deepEqual(
    next.assessments.map((a) => a.known),
    [true, false],
  );
  assert.equal(studyView(next.state).results[1].expected, 'Cherry');
});
test('cards support navigation, ratings, accurate score and completion', () => {
  let state = createStudyState(cards, 'cards', options, random);
  state = applyStudyAction(state, { type: 'navigate', index: 1 }).state;
  assert.equal(studyView(state).current?.back, 'Вишня');
  state = applyStudyAction(state, { type: 'rate', questionId: 'q-1-0', known: false }).state;
  state = applyStudyAction(state, { type: 'rate', questionId: 'q-0-0', known: true }).state;
  assert.equal(state.status, 'completed');
  assert.equal(studySummary(state).score, 50);
  assert.throws(() => applyStudyAction(state, { type: 'navigate', index: 0 }));
});
test('match checks pairs, rejects used tiles, and visits all cards across multiple rounds', () => {
  const many = Array.from({ length: 13 }, (_, i) => ({
    id: String(i),
    term: `Word${i}`,
    definition: `Перевод${i}`,
    revision: 1,
  }));
  let state = createStudyState(many, 'match', options, random);
  state = applyStudyAction(state, { type: 'pair', left: 'l-0-0', right: 'r-0-1' }).state;
  assert.equal(studySummary(state).mistakes, 1);
  for (let i = 0; i < 13; i++) {
    const round = Math.floor(i / 6);
    state = applyStudyAction(state, {
      type: 'pair',
      left: `l-${round}-${i}`,
      right: `r-${round}-${i}`,
    }).state;
    if (i === 0)
      assert.throws(() => applyStudyAction(state, { type: 'pair', left: 'l-0-0', right: 'r-0-0' }));
  }
  assert.equal(state.status, 'completed');
  assert.equal(studySummary(state).answered, 13);
  assert.equal(studySummary(state).attempts, 14);
});
test('duplicate prompts can be matched interchangeably inside a round without stranding remaining tiles', () => {
  let state = createStudyState(
    [
      { ...cards[0], term: 'Same' },
      { ...cards[1], term: 'Same' },
    ],
    'match',
    options,
    random,
  );
  state = applyStudyAction(state, { type: 'pair', left: 'l-0-0', right: 'r-0-1' }).state;
  state = applyStudyAction(state, { type: 'pair', left: 'l-0-1', right: 'r-0-0' }).state;
  assert.equal(state.status, 'completed');
});
