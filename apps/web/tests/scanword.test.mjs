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
const { render, screen, fireEvent, cleanup, waitFor, act } = await import('@testing-library/react');
const { createElement } = await import('react');
const { Scanword } = await import('../src/pages/Scanword.tsx');
const { Games } = await import('../src/pages/Games.tsx');
const { Progress } = await import('../src/pages/Progress.tsx');
const { parseRoute } = await import('../src/app/navigation.ts');
const deck = {
  id: 'deck',
  title: 'Фрукты',
  icon: 'book',
  cards: [
    { id: 'apple', term: 'Apple', definition: 'Яблоко', revision: 1 },
    { id: 'pear', term: 'Pear', definition: 'Груша', revision: 1 },
    { id: 'phrase', term: 'take your time', definition: 'Не торопись', revision: 1 },
  ],
};
let current, originalFetch, starts, events, loseResponse, loseStart, holdDraft, releaseDraft, saved;
function dto() {
  return {
    id: 'lesson',
    deckId: deck.id,
    deckTitle: deck.title,
    deckRevision: 1,
    mode: 'scanword',
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
  starts = [];
  events = [];
  loseResponse = false;
  loseStart = false;
  holdDraft = false;
  releaseDraft = null;
  saved = 0;
  window.location.hash = '#/study/deck/scanword';
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes('/sessions/active?'))
      return Response.json(current?.state.status === 'active' ? dto() : null);
    if (path === '/api/v1/study/sessions') {
      const input = JSON.parse(options.body);
      starts.push(input);
      if (input.requestId !== current?.requestId)
        current = {
          requestId: input.requestId,
          revision: 1,
          state: createStudyState(
            deck.cards.filter((card) => input.cardIds.includes(card.id)),
            'scanword',
            input.options,
            () => 0.37,
          ),
          events: new Map(),
        };
      if (loseStart) {
        loseStart = false;
        throw new Error('Сеть недоступна');
      }
      return Response.json(dto(), { status: 201 });
    }
    if (path.endsWith('/events')) {
      const input = JSON.parse(options.body);
      events.push(input);
      if (!current.events.has(input.eventId)) {
        if (input.revision !== current.revision)
          return Response.json({ error: { message: 'Конфликт ревизий' } }, { status: 409 });
        current.state = applyStudyAction(current.state, input.action).state;
        current.revision++;
        current.events.set(input.eventId, input);
      }
      if (holdDraft && input.action.type === 'scanword-draft') {
        holdDraft = false;
        await new Promise((resolve) => {
          releaseDraft = resolve;
        });
      }
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Сеть недоступна');
      }
      return Response.json(dto());
    }
    if (path === '/api/v1/study/sessions/lesson') return Response.json(dto());
    throw new Error(`Unexpected request ${path}`);
  };
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
function renderGame(extra = {}) {
  return render(
    createElement(Scanword, {
      deck,
      back: () => {},
      saved: async () => {
        saved++;
      },
      ...extra,
    }),
  );
}
async function open() {
  renderGame();
  await screen.findByRole('heading', { name: 'Настройте сканворд' });
}
async function start() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Начать игру' }));
  await screen.findByRole('region', { name: 'Сканворд' });
}
const apple = () => screen.getAllByRole('textbox', { name: /Яблоко: буква/ });
async function clickReady(name) {
  const button = screen.getByRole('button', { name, exact: true });
  await waitFor(() => assert.equal(button.disabled, false));
  fireEvent.click(button);
}
test('games entry selects a deck; setup previews excluded cards and sends only eligible cards', async () => {
  let selected;
  render(
    createElement(Games, {
      decks: [deck],
      play: (id) => {
        selected = id;
      },
      library: () => {},
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать набор' }));
  fireEvent.click(screen.getByRole('button', { name: /Фрукты/ }));
  assert.equal(selected, 'deck');
  cleanup();
  await start();
  assert.deepEqual(starts[0].cardIds, ['apple', 'pear']);
  assert.equal(starts[0].options.direction, 'reverse');
  assert.equal(starts[0].options.count, 2);
  assert.equal(current.state.status, 'active');
  assert.deepEqual(parseRoute('#/games'), { page: 'games' });
  assert.equal(parseRoute('#/study/deck/scanword?session=lesson').mode, 'scanword');
});
test('typing advances focus; paste fills a word; server checks and hints produce an honest saved result', async () => {
  await start();
  let inputs = apple();
  fireEvent.focus(inputs[0]);
  fireEvent.change(inputs[0], { target: { value: 'a' } });
  assert.equal(document.activeElement, apple()[1]);
  fireEvent.keyDown(apple()[1], { key: 'Backspace' });
  assert.equal(document.activeElement, apple()[0]);
  fireEvent.paste(apple()[0], { clipboardData: { getData: () => 'apple' } });
  assert.equal(
    apple()
      .map((input) => input.value)
      .join(''),
    'APPLE',
  );
  await clickReady('Проверить');
  await waitFor(() => assert.equal(studyView(current.state).summary.answered, 1));
  const pearInputs = screen.getAllByRole('textbox', { name: /Груша: буква/ });
  fireEvent.focus(pearInputs[0]);
  await clickReady('Открыть букву');
  await waitFor(() => assert.equal(studyView(current.state).summary.hints, 1));
  const board = current.state.scanword.boards[0];
  const expected = new Map();
  for (const word of board.words)
    [...word.answer].forEach((letter, index) => {
      const row = word.row + (word.direction === 'down' ? index : 0),
        column = word.column + (word.direction === 'across' ? index : 0);
      expected.set(`1:${row}:${column}`, letter);
    });
  for (const cell of dto().scanword.cells.filter(
    (cell) => cell.kind === 'letter' && !cell.locked,
  )) {
    const word = dto().scanword.words.find((word) => cell.wordIds.includes(word.id));
    const cells = dto()
      .scanword.cells.filter((item) => item.kind === 'letter' && item.wordIds.includes(word.id))
      .sort((a, b) => (word.direction === 'across' ? a.column - b.column : a.row - b.row));
    const input = screen.getByRole('textbox', {
      name: `${word.clue}: буква ${cells.findIndex((item) => item.key === cell.key) + 1} из ${word.length}`,
    });
    fireEvent.change(input, { target: { value: expected.get(cell.key) } });
  }
  await clickReady('Проверить');
  await screen.findByRole('heading', { name: 'Занятие завершено' });
  assert.equal(saved, 1);
  assert.equal(studyView(current.state).summary.hints, 1);
  assert.ok(studyView(current.state).summary.score < 100);
  assert.ok(screen.getByText('С первого раза без подсказок'));
});
test('lost draft response retries the same event, and reopening restores the original grid and letters', async () => {
  await start();
  loseResponse = true;
  fireEvent.change(apple()[0], { target: { value: 'a' } });
  await screen.findByRole('alert');
  const first = events.at(-1);
  await clickReady('Повторить действие');
  await waitFor(() => assert.equal(screen.queryByRole('alert'), null));
  assert.equal(events.at(-1).eventId, first.eventId);
  const board = dto().scanword;
  cleanup();
  renderGame();
  await screen.findByRole('heading', { name: 'Есть незаконченный сканворд' });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить игру' }));
  await screen.findByRole('region', { name: 'Сканворд' });
  assert.equal(apple()[0].value, 'A');
  assert.deepEqual(dto().scanword, board);
  assert.equal(saved, 0);
});
test('edits made while autosave is in flight are preserved and saved in a second revision', async () => {
  await start();
  holdDraft = true;
  fireEvent.change(apple()[0], { target: { value: 'A' } });
  await waitFor(() => assert.ok(releaseDraft));
  fireEvent.change(apple()[1], { target: { value: 'P' } });
  await act(async () => releaseDraft());
  await waitFor(
    () =>
      assert.equal(studyView(current.state).scanword.cells.filter((cell) => cell.value).length, 2),
    { timeout: 2500 },
  );
  assert.equal(apple()[0].value, 'A');
  assert.equal(apple()[1].value, 'P');
  await screen.findByText('Сохранено');
});
test('sidebar navigation flushes the latest letters before changing route', async () => {
  await start();
  fireEvent.change(apple()[0], { target: { value: 'A' } });
  let allowed;
  await act(async () => {
    allowed = window.dispatchEvent(
      new window.CustomEvent('memly:before-navigate', { cancelable: true, detail: 'games' }),
    );
  });
  assert.equal(allowed, false);
  await waitFor(() => assert.equal(window.location.hash, '#/games'));
  assert.equal(studyView(current.state).scanword.cells.filter((cell) => cell.value).length, 1);
});
test('a lost start response can be retried without generating a second session', async () => {
  await open();
  loseStart = true;
  fireEvent.click(screen.getByRole('button', { name: 'Начать игру' }));
  await screen.findByRole('alert');
  const first = starts[0].requestId;
  await clickReady('Повторить действие');
  await screen.findByRole('region', { name: 'Сканворд' });
  assert.equal(starts[1].requestId, first);
  assert.equal(current.revision, 1);
});
test('scanword filter and history result are available in the progress page', async () => {
  globalThis.fetch = async (url) => {
    const filtered = String(url).includes('mode=scanword');
    return Response.json({
      timeZone: 'UTC',
      today: '2026-10-10',
      days: [{ date: '2026-10-10', completed: 1 }],
      completed: 1,
      activeDays: 1,
      streak: 1,
      todayByMode: { cards: 0, learn: 0, test: 0, match: 0, scanword: 1 },
      history: [
        {
          id: 'lesson',
          deckId: 'deck',
          deckTitle: 'Фрукты',
          mode: 'scanword',
          status: 'completed',
          completedAt: '2026-10-10T10:00:00Z',
        },
      ],
      filtered,
    });
  };
  let opened;
  render(
    createElement(Progress, {
      live: true,
      openSession: (item) => {
        opened = item;
      },
    }),
  );
  await screen.findByRole('button', { name: 'Результат: Фрукты' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Режим обучения' }), {
    target: { value: 'scanword' },
  });
  await screen.findByRole('button', { name: 'Результат: Фрукты' });
  fireEvent.click(screen.getByRole('button', { name: 'Результат: Фрукты' }));
  assert.equal(opened.mode, 'scanword');
});

test('leaving through browser history saves letters before the debounce', async () => {
  const view = renderGame();
  await screen.findByRole('heading', { name: 'Настройте сканворд' });
  fireEvent.click(screen.getByRole('button', { name: 'Начать игру' }));
  await screen.findByRole('region', { name: 'Сканворд' });
  fireEvent.change(apple()[0], { target: { value: 'A' } });
  view.unmount();
  await waitFor(() => assert.equal(events.length, 1));
  assert.equal(events[0].action.type, 'scanword-draft');
  assert.equal(events[0].action.cells[0].value, 'A');
});
