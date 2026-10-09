import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
const { createElement } = await import('react');
const { App } = await import('../src/app/App.tsx');
const storage = Object.getOwnPropertyDescriptor(window, 'localStorage');
const warn = console.warn;

beforeEach(() => {
  window.history.replaceState(null, '', '/#/settings');
  window.localStorage.clear();
  document.documentElement.dataset.theme = 'light';
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'localStorage', storage);
  console.warn = warn;
});

test('theme selection survives reopening the app for both dark and light modes', () => {
  render(createElement(App, { demo: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Тёмная', exact: true }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.style.colorScheme, 'dark');
  cleanup();
  document.documentElement.dataset.theme = 'light';
  render(createElement(App, { demo: true }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.ok(
    screen.getByRole('button', { name: 'Тёмная', exact: true }).classList.contains('active'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Светлая', exact: true }));
  cleanup();
  document.documentElement.dataset.theme = 'dark';
  render(createElement(App, { demo: true }));
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.documentElement.style.colorScheme, 'light');
  assert.ok(
    screen.getByRole('button', { name: 'Светлая', exact: true }).classList.contains('active'),
  );
});

test('blocked storage does not prevent changing the theme and reports failed persistence', () => {
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('Blocked', 'SecurityError');
    },
  });
  render(createElement(App, { demo: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Тёмная', exact: true }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.match(screen.getByRole('status').textContent, /не разрешил сохранить/);
  assert.equal(warnings.length, 1);
});
