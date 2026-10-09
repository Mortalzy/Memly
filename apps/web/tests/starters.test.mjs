import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { starterDecks } from '../../api/src/modules/starters/catalog.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor, within } = await import(
  '@testing-library/react'
);
const { createElement } = await import('react');
const { StarterCatalog } = await import('../src/features/StarterCatalog.tsx');
const { App } = await import('../src/app/App.tsx');
const list = () =>
  starterDecks.map(({ cards, ...item }) => ({ ...item, count: cards.length, addedDeckId: null }));
let originalFetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.location.hash = '/';
});

test('catalog previews all 40 pairs, filters by level/search and adds only on demand', async () => {
  const writes = [],
    opened = [];
  let loseResponse = true;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path === '/api/v1/starter-decks') return Response.json(list());
    if (path === '/api/v1/starter-decks/essential-verbs')
      return Response.json({ ...list()[0], cards: starterDecks[0].cards });
    throw new Error(`Unexpected request ${path}`);
  };
  const props = {
    query: '',
    setQuery: () => {},
    open: (id) => opened.push(id),
    add: async (key) => {
      writes.push(key);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Сеть недоступна');
      }
      return { id: 'my-copy' };
    },
  };
  const view = render(createElement(StarterCatalog, props));
  const first = await screen.findByRole('article', { name: 'Основные глаголы' });
  assert.equal(screen.getAllByRole('article').length, 10);
  fireEvent.click(within(first).getByRole('button', { name: 'Посмотреть карточки' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('be', { exact: true });
  assert.equal(dialog.querySelectorAll('.starter-preview-row').length, 40);
  assert.ok(within(dialog).getByText('ждать'));
  assert.equal(writes.length, 0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить в библиотеку' }));
  await within(dialog).findByRole('alert');
  await waitFor(() =>
    assert.equal(
      within(dialog).getByRole('button', { name: 'Добавить в библиотеку' }).disabled,
      false,
    ),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить в библиотеку' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Открыть набор' }));
  assert.deepEqual(writes, ['essential-verbs', 'essential-verbs']);
  assert.deepEqual(opened, ['my-copy']);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.ok(screen.queryByRole('dialog') === null);
  assert.ok(within(first).getByText('В вашей библиотеке'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Сложность' }), {
    target: { value: 'Средний' },
  });
  assert.equal(screen.getAllByRole('article').length, 2);
  view.rerender(createElement(StarterCatalog, { ...props, query: 'сочетания' }));
  assert.equal(screen.getAllByRole('article').length, 1);
  assert.ok(screen.getByRole('article', { name: 'Полезные сочетания' }));
  view.rerender(createElement(StarterCatalog, { ...props, query: 'xyz-no-results' }));
  assert.ok(screen.getByRole('heading', { name: 'Подходящие наборы не найдены' }));
});

test('failed catalog and preview requests can be retried without adding a copy', async () => {
  let listCalls = 0,
    previewCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/v1/starter-decks') {
      if (++listCalls === 1) throw new Error('Нет соединения');
      return Response.json(list());
    }
    if (++previewCalls === 1) throw new Error('Не удалось загрузить карточки');
    return Response.json({ ...list()[0], cards: starterDecks[0].cards });
  };
  render(
    createElement(StarterCatalog, {
      query: '',
      setQuery: () => {},
      add: async () => assert.fail('Preview must not add'),
      open: () => {},
    }),
  );
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  const first = await screen.findByRole('article', { name: 'Основные глаголы' });
  fireEvent.click(within(first).getByRole('button', { name: 'Посмотреть карточки' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('alert');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Повторить' }));
  await within(dialog).findByText('be', { exact: true });
  assert.equal(previewCalls, 2);
});

test('connected library imports a starter through the API and opens its editable private deck', async () => {
  const user = { id: 'starter-user', name: 'Максим', email: 'starter@memly.test' };
  const decks = [],
    writes = [];
  const starter = starterDecks[0];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path === '/api/v1/me') return Response.json(user);
    if (path === '/api/v1/folders') return Response.json([]);
    if (path === '/api/v1/study/progress')
      return Response.json({ reviewed: 0, known: 0, decks: decks.length });
    if (path.startsWith('/api/v1/decks?'))
      return Response.json({
        items: decks.map((deck) => ({ ...deck, cards: [] })),
        page: 1,
        pages: 1,
        total: decks.length,
      });
    if (path === '/api/v1/starter-decks')
      return Response.json(
        list().map((item) => ({
          ...item,
          addedDeckId: item.key === starter.key ? (decks[0]?.id ?? null) : null,
        })),
      );
    if (path === `/api/v1/starter-decks/${starter.key}/add`) {
      writes.push({ method: options.method, body: JSON.parse(options.body) });
      const copy = {
        id: 'c7da418f-c24d-487c-b47b-fbe9707e7657',
        title: starter.title,
        description: starter.description,
        icon: starter.icon,
        visibility: 'private',
        termLanguage: 'en',
        definitionLanguage: 'ru',
        revision: 1,
        ownerId: user.id,
        ownerName: user.name,
        folder: '',
        favorite: false,
        count: 40,
        progress: 0,
        cards: starter.cards.map((card, index) => ({ ...card, id: `card-${index}`, revision: 1 })),
      };
      decks.push(copy);
      return Response.json(copy);
    }
    if (path === `/api/v1/decks/${decks[0]?.id}`) return Response.json(decks[0]);
    throw new Error(`Unexpected request ${path}`);
  };
  window.location.hash = '/library';
  render(createElement(App));
  await screen.findByRole('button', { name: 'Выбрать набор по английскому' });
  fireEvent.click(screen.getByRole('button', { name: 'Наборы Memly' }));
  const first = await screen.findByRole('article', { name: starter.title });
  assert.equal(decks.length, 0);
  fireEvent.click(within(first).getByRole('button', { name: 'Добавить в библиотеку' }));
  fireEvent.click(await within(first).findByRole('button', { name: 'Открыть набор' }));
  await screen.findByRole('heading', { name: starter.title, level: 1 });
  assert.deepEqual(writes, [{ method: 'POST', body: {} }]);
  assert.equal(document.querySelectorAll('.term-row').length, 40);
  assert.ok(screen.getByRole('button', { name: 'Редактировать' }));
  for (const label of ['Карточки', 'Заучивание', 'Тест', 'Подбор'])
    assert.ok(screen.getByRole('button', { name: new RegExp(label) }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  await screen.findByRole('heading', { name: 'Редактирование набора' });
  assert.equal(screen.getAllByRole('textbox', { name: 'Термин' }).length, 40);
});
