import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'Event',
  'MouseEvent',
]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { createElement } = await import('react');
const { App } = await import('../src/app/App.tsx');
afterEach(() => cleanup());

test('connected editor persists via API and preserves a draft on revision conflict', async () => {
  const user = { id: 'user-1', name: 'Алексей', email: 'alex@example.test' };
  const decks = [];
  const writes = [];
  const originalFetch = globalThis.fetch;
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
    if (path === '/api/v1/decks' && options.method === 'POST') {
      const input = JSON.parse(options.body);
      writes.push(input);
      const deck = {
        ...input,
        id: '7de62fdd-bd96-4b43-8d72-7b7a2f2e18c2',
        revision: 1,
        ownerId: user.id,
        ownerName: user.name,
        folder: '',
        favorite: false,
        count: input.cards.length,
        progress: 0,
        cards: input.cards.map((card, i) => ({ ...card, id: `card-${i}`, revision: 1 })),
      };
      decks.push(deck);
      return Response.json(deck, { status: 201 });
    }
    if (path === `/api/v1/decks/${decks[0]?.id}`) {
      if (options.method === 'PUT')
        return Response.json(
          {
            error: {
              code: 'REVISION_CONFLICT',
              message: 'Материал изменился. Обновите страницу перед сохранением.',
            },
          },
          { status: 409 },
        );
      return Response.json(decks[0]);
    }
    throw new Error(`Unexpected API request: ${options.method ?? 'GET'} ${path}`);
  };
  try {
    render(createElement(App));
    await screen.findByRole('heading', { name: 'Привет, Алексей!' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Создать набор', exact: true })[0]);
    await screen.findByRole('heading', { name: 'Создать набор' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Название набора' }), {
      target: { value: 'Настоящий набор' },
    });
    for (let i = 0; i < 2; i++) {
      fireEvent.change(screen.getAllByRole('textbox', { name: 'Термин' })[i], {
        target: { value: `Term ${i}` },
      });
      fireEvent.change(screen.getAllByRole('textbox', { name: 'Определение' })[i], {
        target: { value: `Answer ${i}` },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Добавить списком' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Вставьте список' }), {
      target: { value: Array.from({ length: 50 }, (_, i) => `Word${i} Перевод ${i}`).join('\n') },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить 50 карточек' }));
    assert.equal(writes.length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить набор' }));
    await screen.findByRole('heading', { name: 'Настоящий набор' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].visibility, 'private');
    assert.equal(writes[0].folderId, null);
    assert.equal(writes[0].cards[0].id, undefined);
    assert.equal(decks[0].cards.length, 52);
    assert.equal(writes[0].cards[51].term, 'Word49');
    assert.ok(writes[0].cards.every((card) => card.id === undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await screen.findByRole('heading', { name: 'Редактирование набора' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Название набора' }), {
      target: { value: 'Моя несохранённая правка' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить набор' }));
    await screen.findByRole('alert');
    assert.match(screen.getByRole('alert').textContent, /Материал изменился/);
    assert.equal(
      screen.getByRole('textbox', { name: 'Название набора' }).value,
      'Моя несохранённая правка',
    );
    await waitFor(() =>
      assert.equal(screen.getByRole('button', { name: 'Сохранить набор' }).disabled, false),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
