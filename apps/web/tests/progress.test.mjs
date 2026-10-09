import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { createElement } = await import('react');
const { Progress } = await import('../src/pages/Progress.tsx');
const { chartScale } = await import('../src/shared/progress-text.ts');
let originalFetch, calls, fail, opened;
const response = (days, mode) => ({
  timeZone: 'Europe/Samara',
  today: '2026-10-09',
  days: Array.from({ length: days }, (_, index) => {
    const date = new Date('2026-10-09T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + index - days + 1);
    return {
      date: date.toISOString().slice(0, 10),
      completed: index === days - 1 ? (mode ? 1 : 4) : 0,
    };
  }),
  completed: mode ? 1 : 4,
  activeDays: 1,
  streak: 1,
  todayByMode: { cards: mode ? 0 : 1, learn: mode ? 0 : 1, test: 1, match: mode ? 0 : 1 },
  history: [
    {
      id: 'result',
      deckId: 'deck',
      deckTitle: 'Основные глаголы',
      mode: 'test',
      status: 'completed',
      startedAt: '2026-10-08T18:00:00Z',
      completedAt: '2026-10-08T21:30:00Z',
      elapsedMs: 1000,
      summary: { total: 1, correct: 1 },
    },
  ],
});
beforeEach(() => {
  calls = [];
  fail = false;
  opened = null;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (fail) throw new Error('Нет соединения');
    const params = new URL(String(url), 'http://memly.test').searchParams;
    return Response.json(response(Number(params.get('days')), params.get('mode')));
  };
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
function open() {
  render(
    createElement(Progress, {
      live: true,
      openSession: (item) => {
        opened = item;
      },
    }),
  );
}
test('progress uses real daily results, supports period and mode filters, opens completion result', async () => {
  open();
  await screen.findByRole('heading', { name: 'Активность по дням' });
  assert.equal(screen.getAllByRole('button', { name: /октября ·/ }).length, 7);
  const today = screen.getByRole('button', { name: '9 октября · 4 прохождения' });
  fireEvent.click(today);
  assert.equal(today.getAttribute('aria-pressed'), 'true');
  assert.equal(screen.getByText('1 из 7').textContent, '1 из 7');
  fireEvent.click(screen.getByRole('button', { name: 'Результат: Основные глаголы' }));
  assert.equal(opened.id, 'result');
  fireEvent.click(screen.getByRole('button', { name: '30 дней' }));
  await screen.findByText('1 из 30');
  assert.equal(screen.getAllByRole('button', { name: /(?:сентября|октября) ·/ }).length, 30);
  fireEvent.change(screen.getByRole('combobox', { name: 'Режим обучения' }), {
    target: { value: 'test' },
  });
  await screen.findByRole('button', { name: '9 октября · 1 прохождение' });
  assert.ok(calls.at(-1).includes('mode=test'));
  assert.ok(calls.every((url) => url.includes('timeZone=')));
});
test('request failure offers a working retry without invented stats', async () => {
  fail = true;
  open();
  await screen.findByRole('alert');
  assert.equal(screen.queryByText('1 из 7'), null);
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText('1 из 7');
});
test('zero activity displays zero bars and useful empty state', async () => {
  globalThis.fetch = async () => {
    const data = response(7);
    data.days.forEach((day) => (day.completed = 0));
    return Response.json({
      ...data,
      completed: 0,
      activeDays: 0,
      streak: 0,
      todayByMode: { cards: 0, learn: 0, test: 0, match: 0 },
      history: [],
    });
  };
  open();
  await screen.findByText('Здесь появится ваш прогресс');
  assert.equal(screen.getAllByRole('button', { name: /0 прохождений/ }).length, 7);
  assert.ok(screen.getByText('Первый шаг к новой серии'));
});
test('late response to a previous period does not replace the selected period', async () => {
  let resolveOld;
  globalThis.fetch = (url) => {
    const days = Number(new URL(String(url), 'http://memly.test').searchParams.get('days'));
    if (days === 7)
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    return Promise.resolve(Response.json(response(30)));
  };
  open();
  fireEvent.click(screen.getByRole('button', { name: '30 дней' }));
  await screen.findByText('1 из 30');
  resolveOld(Response.json(response(7)));
  await waitFor(() => assert.equal(screen.queryByText('1 из 7'), null));
});
test('chart keeps an integer scale above every observed value', () => {
  for (const maximum of [0, 1, 5, 6, 38, 105, 1400]) {
    const scale = chartScale(maximum);
    assert.ok(scale.maximum >= maximum);
    assert.equal(scale.ticks[0], 0);
    assert.ok(scale.ticks.every(Number.isInteger));
    assert.ok(scale.ticks.length <= 7);
  }
});
