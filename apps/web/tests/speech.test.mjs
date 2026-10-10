import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://memly.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = await import('@testing-library/react');
const { createElement } = await import('react');
const { SpeechButton } = await import('../src/shared/SpeechButton.tsx');
const { speech, speechLanguage } = await import('../src/shared/speech.ts');
const { PrototypeStudy } = await import('../src/pages/PrototypeStudy.tsx');
const { Study } = await import('../src/pages/Study.tsx');
const { createStudyState, studyView } = await import('../../../packages/study-engine/src/index.ts');
let spoken, cancelled, voices;
class Utterance {
  constructor(text) {
    this.text = text;
  }
}
const voice = (lang, name = lang) => ({ lang, name, default: false });
beforeEach(() => {
  spoken = [];
  cancelled = 0;
  voices = [voice('ru-RU'), voice('en-GB'), voice('en-US')];
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: Utterance,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      cancel: () => {
        cancelled++;
      },
      speak: (utterance) => {
        spoken.push(utterance);
        utterance.onstart?.();
      },
    },
  });
});
afterEach(() => {
  cleanup();
  speech.stop();
});
test('English and Russian use matching voices; same button stops; a new word replaces playback', () => {
  render(
    createElement(
      'div',
      null,
      createElement(SpeechButton, { text: 'Apple' }),
      createElement(SpeechButton, { text: 'Яблоко' }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.equal(spoken[0].lang, 'en-US');
  assert.equal(spoken[0].voice.lang, 'en-US');
  const previous = spoken[0];
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Яблоко' }));
  assert.equal(cancelled, 1);
  assert.equal(spoken[1].lang, 'ru-RU');
  assert.equal(spoken[1].voice.lang, 'ru-RU');
  act(() => previous.onend());
  assert.ok(screen.getByRole('button', { name: 'Остановить озвучку: Яблоко' }));
  fireEvent.click(screen.getByRole('button', { name: 'Остановить озвучку: Яблоко' }));
  assert.equal(cancelled, 2);
  assert.equal(speech.snapshot().playing, false);
});
test('flipping stops sound and reads only the visible side without flipping or rating on audio clicks', () => {
  render(
    createElement(PrototypeStudy, {
      deck: { title: 'Фрукты', cards: [{ id: '1', term: 'Apple', definition: 'Яблоко' }] },
      mode: 'cards',
      back: () => {},
      changeMode: () => {},
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.ok(screen.getByRole('button', { name: 'Перевернуть карточку: Apple' }));
  fireEvent.click(screen.getByRole('button', { name: 'Перевернуть карточку: Apple' }));
  assert.equal(cancelled, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Яблоко' }));
  assert.equal(spoken.at(-1).text, 'Яблоко');
  assert.ok(screen.getByRole('button', { name: 'Перевернуть карточку: Яблоко' }));
  cleanup();
  assert.equal(cancelled, 2);
});
test('unsupported browsers and synthesis language errors show useful messages without choosing a wrong-language voice', () => {
  render(createElement(SpeechButton, { text: 'Apple' }));
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.match(screen.getByRole('status').textContent, /браузер не поддерживает/);
  cleanup();
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [voice('ru-RU')],
      speak: (utterance) => {
        assert.equal(utterance.lang, 'en-US');
        assert.equal(utterance.voice, undefined);
        utterance.onerror({ error: 'language-unavailable' });
      },
      cancel: () => {},
    },
  });
  render(createElement(SpeechButton, { text: 'Apple' }));
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.match(screen.getByRole('status').textContent, /Нет голоса/);
});
test('an initially empty voice list delegates language selection and subsequent clicks use newly loaded voices', () => {
  voices = [];
  render(createElement(SpeechButton, { text: 'Apple' }));
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.equal(spoken[0].lang, 'en-US');
  assert.equal(spoken[0].voice, undefined);
  act(() => spoken[0].onend());
  voices = [voice('en-GB')];
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.equal(spoken[1].voice.lang, 'en-GB');
  assert.equal(speechLanguage('  TAKE your time!'), 'en-US');
  assert.equal(speechLanguage('Не торопись'), 'ru-RU');
});
test('repeated playback still works when a loaded voice list omits the language that already played', () => {
  for (const [text, language, otherLanguage] of [
    ['Apple', 'en-US', 'ru-RU'],
    ['Яблоко', 'ru-RU', 'en-US'],
  ]) {
    voices = [];
    render(createElement(SpeechButton, { text }));
    for (let attempt = 0; attempt < 3; attempt++) {
      fireEvent.click(screen.getByRole('button', { name: `Озвучить: ${text}` }));
      const utterance = spoken.at(-1);
      assert.equal(utterance.text, text);
      assert.equal(utterance.lang, language);
      assert.equal(utterance.voice, undefined);
      assert.equal(screen.queryByRole('status'), null);
      act(() => utterance.onend());
      voices = [voice(otherLanguage)];
    }
    cleanup();
  }
  assert.equal(spoken.length, 6);
});
test('a newly loaded but unavailable voice falls back once to automatic selection, including on repeated clicks', () => {
  for (const [text, language] of [
    ['Apple', 'en-US'],
    ['Яблоко', 'ru-RU'],
  ]) {
    for (const error of ['voice-unavailable', 'language-unavailable']) {
      voices = [];
      render(createElement(SpeechButton, { text }));
      fireEvent.click(screen.getByRole('button', { name: `Озвучить: ${text}` }));
      act(() => spoken.at(-1).onend());
      voices = [voice(language)];
      for (let attempt = 0; attempt < 2; attempt++) {
        fireEvent.click(screen.getByRole('button', { name: `Озвучить: ${text}` }));
        const selected = spoken.at(-1);
        assert.equal(selected.voice.lang, language);
        act(() => selected.onerror({ error }));
        const automatic = spoken.at(-1);
        assert.notEqual(automatic, selected);
        assert.equal(automatic.text, text);
        assert.equal(automatic.lang, language);
        assert.equal(automatic.voice, undefined);
        act(() => {
          selected.onend();
          selected.onerror({ error });
        });
        assert.equal(spoken.at(-1), automatic);
        assert.ok(screen.getByRole('button', { name: `Остановить озвучку: ${text}` }));
        assert.equal(screen.queryByRole('status'), null);
        act(() => automatic.onend());
      }
      cleanup();
    }
  }
  assert.equal(spoken.length, 20);
});
test('unavailable automatic selection ends the retry and can recover on a later click without reloading', () => {
  render(createElement(SpeechButton, { text: 'Apple' }));
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  act(() => spoken[0].onerror({ error: 'voice-unavailable' }));
  assert.equal(spoken.length, 2);
  act(() => spoken[1].onerror({ error: 'language-unavailable' }));
  assert.equal(spoken.length, 2);
  assert.equal(speech.snapshot().playing, false);
  assert.match(screen.getByRole('status').textContent, /Нет голоса/);
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  assert.equal(spoken.length, 3);
  assert.equal(screen.queryByRole('status'), null);
  act(() => spoken[2].onend());
});
test('playback errors allow retry; stale cancel errors do not interrupt the new utterance; route changes stop audio', () => {
  render(
    createElement(
      'div',
      null,
      createElement(SpeechButton, { text: 'Apple' }),
      createElement(SpeechButton, { text: 'Cherry' }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  act(() => spoken[0].onerror({ error: 'audio-busy' }));
  assert.match(screen.getByRole('status').textContent, /Попробуйте ещё раз/);
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Apple' }));
  const previous = spoken.at(-1);
  fireEvent.click(screen.getByRole('button', { name: 'Озвучить: Cherry' }));
  act(() => previous.onerror({ error: 'canceled' }));
  assert.equal(speech.snapshot().playing, true);
  act(() => window.dispatchEvent(new Event('hashchange')));
  assert.equal(speech.snapshot().playing, false);
});

test('all connected study modes can read a prompt without submitting answers, ratings or matches; tests hide answer audio', async () => {
  const originalFetch = globalThis.fetch;
  const deck = {
    id: 'deck',
    title: 'Фрукты',
    cards: [
      { id: '1', term: 'Apple', definition: 'Яблоко', revision: 1 },
      { id: '2', term: 'Cherry', definition: 'Вишня', revision: 1 },
    ],
  };
  try {
    for (const mode of ['cards', 'learn', 'test', 'match']) {
      const state = createStudyState(
        deck.cards,
        mode,
        {
          direction: 'forward',
          count: 2,
          shuffle: false,
          filter: 'all',
          answerType: 'written',
        },
        () => 0.3,
      );
      const requests = [];
      globalThis.fetch = async (url, options = {}) => {
        requests.push({ url, method: options.method ?? 'GET' });
        assert.equal(options.method ?? 'GET', 'GET');
        return Response.json({
          id: 'session',
          deckId: deck.id,
          mode,
          status: 'active',
          revision: 1,
          options: state.options,
          elapsedMs: 0,
          bestMs: null,
          outdated: false,
          ...studyView(state),
        });
      };
      render(
        createElement(Study, {
          deck,
          mode,
          sessionId: 'session',
          back: () => {},
          changeMode: () => {},
          saved: async () => {},
        }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Озвучить: Apple' }));
      assert.equal(spoken.at(-1).text, 'Apple');
      assert.equal(requests.length, 1);
      if (mode === 'test')
        assert.equal(screen.queryByRole('button', { name: 'Озвучить: Яблоко' }), null);
      cleanup();
      assert.equal(speech.snapshot().playing, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
