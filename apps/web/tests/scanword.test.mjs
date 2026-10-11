import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { applyStudyAction, studyView } from '../../../packages/study-engine/src/index.ts';
import { createScanwordLevelState } from '../../../packages/study-engine/src/scanword-levels.ts';
import { SCANWORD_LEVELS } from '@memly/contracts';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor, act } = await import('@testing-library/react');
const { createElement } = await import('react');
const { Scanword } = await import('../src/pages/Scanword.tsx');
const { Games } = await import('../src/pages/Games.tsx');
const { ScanwordLevels } = await import('../src/pages/ScanwordLevels.tsx');
const { Progress } = await import('../src/pages/Progress.tsx');
const { parseRoute } = await import('../src/app/navigation.ts');
let current, originalFetch, starts, events, loseResponse, loseStart, holdDraft, releaseDraft, saved;
function dto() {
  return {
    id: 'lesson',
    deckId: null,
    levelId: 'warmup',
    deckTitle: 'Уровень 1: Разминка',
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
  window.location.hash = '#/games/scanword/warmup';
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/levels/warmup/active'))
      return Response.json(current?.state.status === 'active' ? dto() : null);
    if (path === '/api/v1/games/scanword/levels')
      return Response.json({
        levels: SCANWORD_LEVELS.map((level, index) => ({
          ...level,
          completed: index === 0 && current?.state.status === 'completed',
          unlocked: index === 0 || (index === 1 && current?.state.status === 'completed'),
          completedAt: null,
          activeSessionId: index === 0 && current?.state.status === 'active' ? 'lesson' : null,
        })),
        completed: current?.state.status === 'completed' ? 1 : 0,
        total: 5,
      });
    if (path === '/api/v1/games/scanword/levels/warmup/sessions') {
      const input = JSON.parse(options.body);
      starts.push(input);
      if (input.requestId !== current?.requestId)
        current = {
          requestId: input.requestId,
          revision: 1,
          state: createScanwordLevelState('warmup'),
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
      levelId: 'warmup',
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
  await screen.findByRole('heading', { name: 'Уровень 1: Разминка' });
}
async function start() {
  await open();
  await screen.findByRole('region', { name: 'Сканворд' });
}
const apple = () =>
  screen.getAllByRole('textbox', { name: /Домашний питомец, который мяукает: буква/ });
async function clickReady(name) {
  const button = screen.getByRole('button', { name, exact: true });
  await waitFor(() => assert.equal(button.disabled, false));
  await act(async () => fireEvent.click(button));
}
test('games open curated levels, with four locked cards and no deck selector', async () => {
  let opened = false;
  render(
    createElement(Games, {
      openLevels: () => {
        opened = true;
      },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Открыть уровни' }));
  assert.equal(opened, true);
  assert.equal(screen.queryByRole('button', { name: 'Выбрать набор' }), null);
  cleanup();
  render(createElement(ScanwordLevels, { live: true, back: () => {}, play: () => {} }));
  await screen.findByText('Пройдено 0 из 5 уровней');
  assert.equal(screen.getAllByRole('article').length, 5);
  assert.equal(
    screen.getAllByRole('button', { name: /Пройдите уровень/ }).filter((button) => button.disabled)
      .length,
    4,
  );
  assert.equal(screen.getByRole('button', { name: 'Начать уровень' }).disabled, false);
  cleanup();
  await start();
  assert.deepEqual(Object.keys(starts[0]), ['requestId']);
  assert.equal(current.state.scanword.boards.length, 1);
  assert.deepEqual(parseRoute('#/games/scanword'), { page: 'scanword-levels' });
  assert.deepEqual(parseRoute('#/games/scanword/nature?session=lesson'), {
    page: 'scanword-level',
    id: 'nature',
    session: 'lesson',
  });
  assert.deepEqual(parseRoute('#/games/scanword/missing'), { page: 'scanword-levels' });
});
test('signed-in level deep links open the board without requesting a deck', async () => {
  const gameFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    requests.push(path);
    if (path === '/api/v1/me')
      return Response.json({ id: 'player', name: 'Игрок', email: 'player@memly.test' });
    if (path === '/api/v1/folders') return Response.json([]);
    if (path === '/api/v1/study/progress')
      return Response.json({ reviewed: 0, known: 0, decks: 0 });
    if (path.startsWith('/api/v1/decks?'))
      return Response.json({ items: [], page: 1, pages: 1, total: 0 });
    return gameFetch(url, options);
  };
  const { App } = await import('../src/app/App.tsx');
  render(createElement(App));
  await screen.findByRole('region', { name: 'Сканворд' });
  assert.equal(
    requests.some((path) => path.startsWith('/api/v1/decks/')),
    false,
  );
  assert.equal(starts.length, 1);
});
test('typing advances focus; paste fills a word; server checks and hints produce an honest saved result', async () => {
  await start();
  let inputs = apple();
  fireEvent.focus(inputs[0]);
  fireEvent.change(inputs[0], { target: { value: 'к' } });
  assert.equal(document.activeElement, apple()[1]);
  fireEvent.keyDown(apple()[1], { key: 'Backspace' });
  assert.equal(document.activeElement, apple()[0]);
  fireEvent.paste(apple()[0], { clipboardData: { getData: () => 'кот' } });
  assert.equal(
    apple()
      .map((input) => input.value)
      .join(''),
    'КОТ',
  );
  await clickReady('Проверить');
  await waitFor(() => assert.equal(studyView(current.state).summary.answered, 1));
  const pearInputs = screen.getAllByRole('textbox', { name: /Здание, в котором живут: буква/ });
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
  await screen.findByRole('heading', { name: 'Уровень пройден!' });
  assert.equal(saved, 1);
  assert.equal(studyView(current.state).summary.hints, 1);
  assert.ok(studyView(current.state).summary.score < 100);
  assert.ok(screen.getByText(/^С первого раза без подсказок/));
  assert.ok(screen.getByRole('button', { name: 'Следующий уровень' }));
  cleanup();
  render(createElement(ScanwordLevels, { live: true, back: () => {}, play: () => {} }));
  await screen.findByText('Пройдено 1 из 5 уровней');
  assert.ok(screen.getByText('Пройден'));
  assert.equal(screen.getAllByRole('button', { name: /Пройдите уровень/ }).length, 3);
  assert.ok(screen.getByRole('button', { name: 'Играть ещё раз' }));
});
test('lost draft response retries the same event, and reopening restores the original grid and letters', async () => {
  await start();
  loseResponse = true;
  fireEvent.change(apple()[0], { target: { value: 'к' } });
  await screen.findByRole('alert');
  const first = events.at(-1);
  await clickReady('Повторить действие');
  await waitFor(() => assert.equal(screen.queryByRole('alert'), null));
  assert.equal(events.at(-1).eventId, first.eventId);
  const board = dto().scanword;
  cleanup();
  renderGame();
  await screen.findByRole('region', { name: 'Сканворд' });
  assert.equal(apple()[0].value, 'К');
  assert.deepEqual(dto().scanword, board);
  assert.equal(saved, 0);
});
test('edits made while autosave is in flight are preserved and saved in a second revision', async () => {
  await start();
  holdDraft = true;
  fireEvent.change(apple()[0], { target: { value: 'К' } });
  await waitFor(() => assert.ok(releaseDraft));
  fireEvent.change(apple()[1], { target: { value: 'О' } });
  await act(async () => releaseDraft());
  await waitFor(
    () =>
      assert.equal(studyView(current.state).scanword.cells.filter((cell) => cell.value).length, 2),
    { timeout: 2500 },
  );
  assert.equal(apple()[0].value, 'К');
  assert.equal(apple()[1].value, 'О');
  await screen.findByText('Сохранено');
});
test('sidebar navigation flushes the latest letters before changing route', async () => {
  await start();
  fireEvent.change(apple()[0], { target: { value: 'К' } });
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
  loseStart = true;
  await open();
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
          deckId: null,
          levelId: 'warmup',
          deckTitle: 'Уровень 1: Разминка',
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
  await screen.findByRole('button', { name: 'Результат: Уровень 1: Разминка' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Режим обучения' }), {
    target: { value: 'scanword' },
  });
  await screen.findByRole('button', { name: 'Результат: Уровень 1: Разминка' });
  fireEvent.click(screen.getByRole('button', { name: 'Результат: Уровень 1: Разминка' }));
  assert.equal(opened.mode, 'scanword');
});

test('leaving through browser history saves letters before the debounce', async () => {
  const view = renderGame();
  await screen.findByRole('region', { name: 'Сканворд' });
  fireEvent.change(apple()[0], { target: { value: 'К' } });
  view.unmount();
  await waitFor(() => assert.equal(events.length, 1));
  assert.equal(events[0].action.type, 'scanword-draft');
  assert.equal(events[0].action.cells[0].value, 'К');
});
