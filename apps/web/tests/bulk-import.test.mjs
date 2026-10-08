import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { parseCardList, retainedDraftCards } from '../src/features/bulk-import.ts';
import { deckInputSchema } from '@memly/contracts';

test('pasted lists preserve pairs, line numbers, translations and Windows line endings', () => {
  const rows = parseCardList(
    '\uFEFFApple   Яблоко\r\n\r\nQiwi Киви\r\nCherry Красная вишня\r',
    'space',
  );
  assert.deepEqual(rows, [
    { line: 1, term: 'Apple', definition: 'Яблоко', issue: undefined },
    { line: 3, term: 'Qiwi', definition: 'Киви', issue: undefined },
    { line: 4, term: 'Cherry', definition: 'Красная вишня', issue: undefined },
  ]);
  assert.equal(parseCardList('Apple\tЯблоко', 'space')[0].definition, 'Яблоко');
});

test('explicit separators preserve phrases and additional separators in definitions', () => {
  assert.equal(parseCardList('Take your time\tНе торопись', 'tab')[0].term, 'Take your time');
  assert.equal(
    parseCardList('Event loop;Цикл событий; очередь', 'semicolon')[0].definition,
    'Цикл событий; очередь',
  );
  assert.equal(parseCardList('\tБез слова', 'tab')[0].issue, 'missingPair');
  assert.equal(parseCardList(';Без слова', 'semicolon')[0].issue, 'missingPair');
  assert.equal(parseCardList('Apple;', 'semicolon')[0].issue, 'missingPair');
  assert.equal(parseCardList('Apple Яблоко', 'tab')[0].issue, 'missingPair');
});

test('field limits agree with the server contract and malformed rows are not silently dropped', () => {
  const rows = parseCardList(`БезПеревода\n${'a'.repeat(2001)} б\nA ${'б'.repeat(5001)}`, 'space');
  assert.deepEqual(
    rows.map((row) => row.issue),
    ['missingPair', 'termTooLong', 'definitionTooLong'],
  );
  const valid = parseCardList(`${'a'.repeat(2000)} ${'б'.repeat(5000)}\nB Б`, 'space');
  assert.ok(valid.every((row) => !row.issue));
  assert.ok(
    deckInputSchema.safeParse({
      title: 'Тест',
      cards: valid.map(({ term, definition }) => ({ term, definition })),
    }).success,
  );
});

test('only fully blank draft cards are removed; existing IDs, revisions and partial edits remain', () => {
  const filled = { id: 'old', revision: 3, term: 'Apple', definition: 'Яблоко' };
  const partial = { id: 'partial', term: 'Не закончил', definition: '' };
  const retained = retainedDraftCards([
    filled,
    partial,
    { id: 'blank', term: ' ', definition: '' },
  ]);
  assert.deepEqual(retained, [filled, partial]);
  assert.equal(retained[0], filled);
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://memly.test/',
});
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, within, waitFor } = await import(
  '@testing-library/react'
);
const { createElement } = await import('react');
const { Editor } = await import('../src/pages/Editor.tsx');
afterEach(() => {
  cleanup();
  document.body.innerHTML = '<div id="root"></div>';
});

function editor(cards, save = () => {}) {
  render(
    createElement(Editor, {
      live: true,
      back: () => {},
      save,
      ...(cards ? { deck: { title: 'Фрукты', cards } } : {}),
    }),
    { container: document.getElementById('root') },
  );
}

test('50 pasted lines become 50 new cards, preserve existing cards and save through the editor', async () => {
  let saved;
  const original = { id: 'old', revision: 2, term: 'Apple', definition: 'Яблоко' };
  editor([original, { id: 'blank', term: '', definition: '' }], (deck) => {
    saved = deck;
  });
  const opener = screen.getByRole('button', { name: 'Добавить списком' });
  opener.focus();
  fireEvent.click(opener);
  const input = screen.getByRole('textbox', { name: 'Вставьте список' });
  assert.equal(document.activeElement, input);
  assert.equal(document.getElementById('root').inert, true);
  fireEvent.change(input, {
    target: { value: Array.from({ length: 50 }, (_, i) => `Word${i} Перевод ${i}`).join('\r\n') },
  });
  assert.equal(within(screen.getByRole('dialog')).getAllByRole('row').length, 51);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить 50 карточек' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(document.getElementById('root').inert, false);
  assert.equal(screen.getAllByRole('textbox', { name: 'Термин' }).length, 51);
  assert.equal(saved, undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить набор' }));
  assert.equal(saved.cards.length, 51);
  assert.deepEqual(saved.cards[0], original);
  assert.equal(new Set(saved.cards.map((card) => card.id)).size, 51);
  assert.equal(saved.cards[50].definition, 'Перевод 49');
  assert.equal(saved.cards[1].revision, undefined);
  await waitFor(() =>
    assert.equal(screen.getByRole('button', { name: 'Сохранить набор' }).disabled, false),
  );
});

test('invalid rows block import, separator switches reparse, Escape and cancel keep the draft', () => {
  editor();
  const opener = screen.getByRole('button', { name: 'Добавить списком' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.change(screen.getByRole('textbox', { name: 'Вставьте список' }), {
    target: { value: 'Apple Яблоко\nCherry' },
  });
  assert.ok(screen.getByRole('alert'));
  assert.equal(screen.getByRole('button', { name: 'Добавить 1 карточку' }).disabled, true);
  fireEvent.change(screen.getByRole('textbox', { name: 'Вставьте список' }), {
    target: { value: 'Take your time;Не торопись\nEvent loop;Цикл событий' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Точка с запятой' }));
  assert.ok(within(screen.getByRole('dialog')).getByText('Take your time'));
  const close = screen.getByRole('button', { name: 'Закрыть' });
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Добавить 2 карточки' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(document.activeElement, opener);
  assert.ok(
    screen.getAllByRole('textbox', { name: 'Термин' }).every((input) => input.value === ''),
  );
  fireEvent.click(opener);
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена', exact: true }),
  );
  assert.equal(screen.queryByRole('dialog'), null);
});

test('import includes partial cards in capacity and permits exactly 500 total cards', () => {
  editor([{ id: 'partial', term: 'Черновик', definition: '' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить списком' }));
  const input = screen.getByRole('textbox', { name: 'Вставьте список' });
  const lines = Array.from({ length: 500 }, (_, i) => `Word${i} Перевод`).join('\n');
  fireEvent.change(input, { target: { value: lines } });
  assert.match(screen.getByRole('alert').textContent, /499 карточек/);
  assert.equal(screen.getByRole('button', { name: 'Добавить 500 карточек' }).disabled, true);
  fireEvent.change(input, { target: { value: lines.slice(0, lines.lastIndexOf('\n')) } });
  assert.equal(screen.queryByRole('alert'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить 499 карточек' }));
  assert.equal(screen.getAllByRole('textbox', { name: 'Термин' }).length, 500);
  assert.equal(screen.getAllByRole('textbox', { name: 'Термин' })[0].value, 'Черновик');
});
