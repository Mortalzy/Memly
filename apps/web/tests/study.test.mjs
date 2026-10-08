import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  applyStudyAction,
  createStudyState,
  studyView,
} from '../../../packages/study-engine/src/index.ts';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { createElement } = await import('react');
const { Study } = await import('../src/pages/Study.tsx');
const { StudyHistory } = await import('../src/features/StudyHistory.tsx');
const deck = {
  id: 'deck',
  title: 'Фрукты',
  cards: [
    { id: 'card1', term: 'Apple', definition: 'Яблоко', revision: 1 },
    { id: 'card2', term: 'Cherry', definition: 'Вишня', revision: 1 },
  ],
};
let current, attempts, inputs, starts, originalFetch, loseResponse, loseStartResponse;
function dto() {
  return {
    id: current.id,
    deckId: deck.id,
    deckTitle: deck.title,
    deckRevision: 1,
    mode: current.state.mode,
    options: current.state.options,
    revision: current.revision,
    status: current.state.status,
    startedAt: new Date().toISOString(),
    completedAt: current.state.status === 'active' ? null : new Date().toISOString(),
    elapsedMs: 1000,
    ...studyView(current.state),
    bestMs: null,
    outdated: false,
  };
}
beforeEach(() => {
  current = null;
  attempts = 0;
  inputs = [];
  starts = [];
  loseResponse = false;
  loseStartResponse = false;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes('/sessions/active?'))
      return Response.json(current?.state.status === 'active' ? dto() : null);
    if (path === '/api/v1/study/sessions') {
      const input = JSON.parse(options.body);
      starts.push(input);
      if (current?.requestId !== input.requestId)
        current = {
          id: 'lesson',
          requestId: input.requestId,
          state: createStudyState(deck.cards, input.mode, input.options, () => 0.3),
          revision: 1,
          events: new Map(),
        };
      if (loseStartResponse) {
        loseStartResponse = false;
        throw new Error('Сеть недоступна');
      }
      return Response.json(dto(), { status: 201 });
    }
    if (path.endsWith('/events')) {
      const input = JSON.parse(options.body);
      inputs.push(input);
      if (!current.events.has(input.eventId)) {
        current.state = applyStudyAction(current.state, input.action).state;
        current.revision++;
        current.events.set(input.eventId, input);
        attempts++;
      }
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Сеть недоступна');
      }
      return Response.json(dto());
    }
    if (path === '/api/v1/study/sessions/lesson') return Response.json(dto());
    if (path.startsWith('/api/v1/study/overview'))
      return Response.json({
        completed: 1,
        attempts: 2,
        correct: 1,
        questions: 2,
        elapsedMs: 2000,
        history: [
          {
            id: 'lesson',
            deckId: deck.id,
            deckTitle: deck.title,
            mode: 'test',
            status: 'completed',
            startedAt: '2026-10-08T12:00:00Z',
            completedAt: '2026-10-08T12:00:02Z',
            elapsedMs: 2000,
            summary: { total: 2, correct: 1, mistakes: 1 },
          },
        ],
      });
    throw new Error(`Unexpected request ${path}`);
  };
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
async function open(mode) {
  render(
    createElement(Study, {
      deck,
      mode,
      back: () => {},
      changeMode: () => {},
      saved: async () => {},
    }),
  );
  await screen.findByRole('heading', { name: 'Настройте занятие' });
}
async function start(mode) {
  await open(mode);
  fireEvent.change(screen.getByRole('combobox', { name: 'Направление' }), {
    target: { value: 'forward' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Перемешать карточки' }));
  if (mode === 'test' || mode === 'learn')
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип вопросов' }), {
      target: { value: 'written' },
    });
  fireEvent.click(screen.getByRole('button', { name: 'Начать занятие' }));
  await waitFor(() =>
    assert.ok(screen.queryByRole('heading', { name: 'Настройте занятие' }) === null),
  );
}
async function clickReady(name) {
  await waitFor(() =>
    assert.equal(screen.getByRole('button', { name, exact: true }).disabled, false),
  );
  fireEvent.click(screen.getByRole('button', { name, exact: true }));
}
test('cards flip, save ratings, retry a lost response with the same event ID, and finish with a real score', async () => {
  await start('cards');
  fireEvent.click(screen.getByRole('button', { name: 'Перевернуть карточку: Apple' }));
  assert.ok(screen.getByRole('button', { name: 'Перевернуть карточку: Яблоко' }));
  loseResponse = true;
  await clickReady('Знаю');
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить действие' }));
  await screen.findByRole('button', { name: 'Перевернуть карточку: Cherry' });
  assert.equal(inputs[0].eventId, inputs[1].eventId);
  assert.equal(attempts, 1);
  await clickReady('Ещё учу');
  await screen.findByRole('heading', { name: 'Занятие завершено' });
  assert.ok(screen.getByText('50', { exact: false }));
  assert.ok(screen.getByRole('button', { name: 'Повторить сложные карточки' }));
  loseStartResponse = true;
  await clickReady('Повторить занятие');
  await screen.findByRole('alert');
  await clickReady('Повторить действие');
  await screen.findByRole('button', { name: 'Перевернуть карточку: Apple' });
  assert.deepEqual(starts[1], starts[2]);
  assert.equal(current.state.status, 'active');
});
test('learning persists feedback, repeats wrong answers and reaches completion', async () => {
  await start('learn');
  fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), {
    target: { value: 'Неверно' },
  });
  await clickReady('Проверить');
  await screen.findByText('Пока неверно');
  cleanup();
  render(
    createElement(Study, {
      deck,
      mode: 'learn',
      back: () => {},
      changeMode: () => {},
      saved: async () => {},
    }),
  );
  await screen.findByRole('heading', { name: 'Есть незавершённое занятие' });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить занятие' }));
  assert.ok(screen.getByText('Пока неверно'));
  await clickReady('Продолжить');
  await screen.findByRole('heading', { name: 'Cherry' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), {
    target: { value: '  ВИШНЯ ' },
  });
  await clickReady('Проверить');
  await screen.findByText('Верно!');
  await clickReady('Продолжить');
  await screen.findByRole('heading', { name: 'Apple' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), {
    target: { value: 'Яблоко' },
  });
  await clickReady('Проверить');
  await screen.findByRole('heading', { name: 'Занятие завершено' });
  assert.equal(current.state.attempts.length, 3);
});
test('test auto-saves and restores drafts, then displays a genuine grade and error review', async () => {
  await start('test');
  const fields = screen.getAllByRole('textbox', { name: 'Ваш ответ' });
  fireEvent.change(fields[0], { target: { value: 'Яблоко' } });
  fireEvent.change(fields[1], { target: { value: 'wrong' } });
  await waitFor(() => assert.equal(attempts, 1), { timeout: 2500 });
  await waitFor(() => assert.ok(screen.getByText('Черновик сохранён')));
  assert.equal(screen.queryByRole('heading', { name: 'Разбор ответов' }), null);
  cleanup();
  render(
    createElement(Study, {
      deck,
      mode: 'test',
      back: () => {},
      changeMode: () => {},
      saved: async () => {},
    }),
  );
  await screen.findByRole('heading', { name: 'Есть незавершённое занятие' });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить занятие' }));
  assert.equal(screen.getAllByRole('textbox', { name: 'Ваш ответ' })[1].value, 'wrong');
  await clickReady('Завершить тест');
  await screen.findByRole('heading', { name: 'Занятие завершено' });
  assert.equal(studyView(current.state).summary.score, 50);
  assert.ok(screen.getByText('Правильный ответ: Вишня'));
});
test('match checks mistakes and finishes all real pairs', async () => {
  await start('match');
  fireEvent.click(await screen.findByRole('button', { name: 'Apple', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Вишня', exact: true }));
  await screen.findByText('Эти карточки не образуют пару. Попробуйте снова.');
  await clickReady('Apple');
  await clickReady('Яблоко');
  await screen.findByText('Пара найдена');
  await clickReady('Cherry');
  await clickReady('Вишня');
  await screen.findByRole('heading', { name: 'Занятие завершено' });
  assert.equal(studyView(current.state).summary.mistakes, 1);
});
test('history shows server results and opens the selected session', async () => {
  let opened;
  render(
    createElement(StudyHistory, {
      open: (item) => {
        opened = item;
      },
    }),
  );
  await screen.findByRole('heading', { name: 'Фрукты · Тест' });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть занятие' }));
  assert.equal(opened.id, 'lesson');
  fireEvent.click(screen.getByRole('button', { name: '7 дней' }));
  await screen.findByRole('heading', { name: 'Фрукты · Тест' });
});
