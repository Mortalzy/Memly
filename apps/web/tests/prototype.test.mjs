import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://memly.test/',
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
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, waitFor, cleanup, within } = await import(
  '@testing-library/react'
);
const { createElement } = await import('react');
const { App } = await import('../src/app/App.tsx');
const { parseRoute } = await import('../src/app/navigation.ts');
const { cardCount, deckCount } = await import('../src/shared/ru.ts');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.dataset.theme = 'light';
});
afterEach(() => cleanup());

async function openPage(path) {
  window.history.replaceState(null, '', `/#/${path}`);
  render(createElement(App, { demo: true }));
}

async function clickButton(name) {
  fireEvent.click(screen.getByRole('button', { name, exact: true }));
  await waitFor(() => assert.ok(document.querySelector('main')));
}

test('route parser preserves valid deep links and handles malformed paths', () => {
  assert.deepEqual(parseRoute('#/study/english/cards'), {
    page: 'study',
    id: 'english',
    mode: 'cards',
  });
  assert.deepEqual(parseRoute('#/study/english/unknown'), { page: 'home' });
  assert.deepEqual(parseRoute('#/deck/'), { page: 'home' });
  assert.deepEqual(parseRoute('#/folder/languages'), { page: 'folder', id: 'languages' });
  assert.equal(cardCount(42), '42 карточки');
  assert.equal(cardCount(11), '11 карточек');
  assert.equal(deckCount(1), '1 набор');
});

test('continue opens flashcards; flipping and next card change accessible content', async () => {
  await openPage('');
  assert.ok(screen.getByRole('heading', { name: 'Привет, Максим!' }));
  await clickButton('Продолжить');
  const card = await screen.findByRole('button', {
    name: 'Перевернуть карточку: Little by little',
  });
  fireEvent.click(card);
  assert.ok(screen.getByRole('button', { name: 'Перевернуть карточку: Понемногу' }));
  await clickButton('Следующая карточка');
  assert.ok(screen.getByRole('button', { name: 'Перевернуть карточку: Take your time' }));
});

test('library search shows empty state and reset restores decks', async () => {
  await openPage('library');
  fireEvent.change(screen.getByRole('textbox', { name: 'Найти набор' }), {
    target: { value: 'несуществующий набор' },
  });
  assert.ok(screen.getByRole('heading', { name: 'Пока ничего не нашлось' }));
  const main = within(document.querySelector('main'));
  fireEvent.click(main.getByRole('button', { name: 'Сбросить поиск' }));
  assert.ok(screen.getByRole('heading', { name: 'JavaScript' }));
});

test('editor validates an empty draft and saves a complete demo deck', async () => {
  await openPage('create');
  await clickButton('Сохранить набор');
  assert.match(screen.getByRole('alert').textContent, /Укажите название/);
  fireEvent.change(screen.getByRole('textbox', { name: 'Название набора' }), {
    target: { value: 'Мой тестовый набор' },
  });
  const terms = screen.getAllByRole('textbox', { name: 'Термин' });
  const definitions = screen.getAllByRole('textbox', { name: 'Определение' });
  for (let i = 0; i < 2; i++) {
    fireEvent.change(terms[i], { target: { value: `Слово ${i + 1}` } });
    fireEvent.change(definitions[i], { target: { value: `Перевод ${i + 1}` } });
  }
  await clickButton('Добавить карточку');
  assert.equal(screen.getAllByRole('textbox', { name: 'Термин' }).length, 3);
  await clickButton('Сохранить набор');
  await screen.findByRole('heading', { name: 'Мой тестовый набор' });
  assert.ok(screen.getByText('2 карточки'));
  assert.ok(screen.getByText('Слово 1'));
});

test('folder modal closes on Escape and creates a folder in the current view', async () => {
  await openPage('folders');
  await clickButton('Новая папка');
  assert.ok(screen.getByRole('dialog'));
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(screen.queryByRole('dialog'), null);
  await clickButton('Новая папка');
  fireEvent.change(screen.getByRole('textbox', { name: 'Название папки' }), {
    target: { value: 'Экзамены' },
  });
  await clickButton('Создать папку');
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(screen.getByRole('heading', { name: 'Экзамены' }));
});

test('test requires selections and shows explicitly illustrative results', async () => {
  await openPage('study/english/test');
  assert.equal(screen.getByRole('button', { name: 'Завершить тест' }).disabled, true);
  for (const question of document.querySelectorAll('.test-question')) {
    fireEvent.click(within(question).getByRole('button', { name: /^A / }));
  }
  await clickButton('Завершить тест');
  assert.ok(screen.getByRole('heading', { name: 'Отличный старт!' }));
  assert.ok(screen.getByText('Пример результата'));
  assert.match(
    screen.getByText(/Это пример экрана результатов/).textContent,
    /Проверка знаний появится/,
  );
});

test('match demo can be completed and restarted', async () => {
  await openPage('study/english/match');
  for (const [term, definition] of [
    ['Little by little', 'Понемногу'],
    ['Take your time', 'Не торопись'],
    ['Make a difference', 'Изменить что-то к лучшему'],
    ['Keep in mind', 'Иметь в виду'],
  ]) {
    await clickButton(term);
    await clickButton(definition);
  }
  assert.ok(screen.getByRole('heading', { name: 'Все пары найдены!' }));
  await clickButton('Повторить');
  assert.ok(screen.getByRole('button', { name: 'Take your time' }));
});
