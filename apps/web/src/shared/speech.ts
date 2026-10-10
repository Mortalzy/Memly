import { speechText } from './speech-text';

interface SpeechState {
  owner: string | null;
  playing: boolean;
  error: string;
}
const idle: SpeechState = { owner: null, playing: false, error: '' };
let state = idle;
let active: SpeechSynthesisUtterance | null = null;
let synthesis: SpeechSynthesis | null = null;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

// Current sets use English/Russian. This heuristic is not general language detection.
export function speechLanguage(value: string): 'en-US' | 'ru-RU' {
  const russian = value.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const latin = value.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return russian > latin ? 'ru-RU' : 'en-US';
}

export function speechVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | undefined {
  const normalized = language.toLowerCase();
  const candidates = voices.filter(
    (voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === normalized.split('-')[0],
  );
  return (
    candidates.find((voice) => voice.lang.toLowerCase().replace('_', '-') === normalized) ??
    candidates.find((voice) => voice.default) ??
    candidates[0]
  );
}

function publish(next: SpeechState): void {
  state = next;
  for (const listener of listeners) listener();
}
function detach(): void {
  clearTimeout(startupTimer);
  window.removeEventListener('hashchange', cancelSpeech);
  document.removeEventListener('visibilitychange', visibilityChanged);
}
function cancelSpeech(): void {
  speech.stop();
}
function visibilityChanged(): void {
  if (document.hidden) speech.stop();
}

export const speech = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot(): SpeechState {
    return state;
  },
  stop(owner?: string): void {
    if (owner && state.owner !== owner) return;
    const previous = synthesis;
    active = null;
    synthesis = null;
    detach();
    publish(idle);
    if (previous) {
      try {
        previous.cancel();
      } catch {
        console.warn('Не удалось остановить озвучку.');
      }
    }
  },
  play(owner: string, value: string, language = speechLanguage(value)): void {
    speech.stop();
    if (!value.trim()) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      publish({ owner, playing: false, error: speechText.unsupported });
      return;
    }
    try {
      const synth = window.speechSynthesis;
      // Some browsers load voices asynchronously. An empty list uses the utterance's lang
      // and browser default; getVoices is read again for every subsequent user click.
      const voices = synth.getVoices();
      const voice = speechVoice(voices, language);
      if (voices.length && !voice) {
        publish({ owner, playing: false, error: speechText.missingVoice });
        return;
      }
      const utterance = new window.SpeechSynthesisUtterance(value.trim());
      utterance.lang = language;
      if (voice) utterance.voice = voice;
      active = utterance;
      synthesis = synth;
      const fail = (message: string) => {
        if (active !== utterance) return;
        speech.stop(owner);
        publish({ owner, playing: false, error: message });
      };
      utterance.onstart = () => {
        if (active === utterance) clearTimeout(startupTimer);
      };
      utterance.onend = () => {
        if (active !== utterance) return;
        active = null;
        synthesis = null;
        detach();
        publish(idle);
      };
      utterance.onerror = (event) => {
        fail(
          event.error === 'language-unavailable' || event.error === 'voice-unavailable'
            ? speechText.missingVoice
            : speechText.failed,
        );
      };
      publish({ owner, playing: true, error: '' });
      window.addEventListener('hashchange', cancelSpeech);
      document.addEventListener('visibilitychange', visibilityChanged);
      startupTimer = setTimeout(() => fail(speechText.failed), 10000);
      synth.speak(utterance);
    } catch {
      speech.stop(owner);
      publish({ owner, playing: false, error: speechText.failed });
    }
  },
};
