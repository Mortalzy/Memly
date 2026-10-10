import { useEffect, useId, useSyncExternalStore } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { speech } from './speech';
import { speechText } from './speech-text';

export function SpeechButton({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const owner = useId();
  const state = useSyncExternalStore(speech.subscribe, speech.snapshot);
  const playing = state.owner === owner && state.playing;
  const error = state.owner === owner ? state.error : '';
  useEffect(() => () => speech.stop(owner), [owner, text]);
  const label = playing ? speechText.stop(text) : speechText.play(text);
  return (
    <span className="speech-control">
      <button
        type="button"
        className={`speech-button ${playing ? 'is-speaking' : ''}`}
        aria-label={label}
        aria-pressed={playing}
        title={label}
        disabled={disabled || !text.trim()}
        onClick={(event) => {
          event.stopPropagation();
          if (playing) speech.stop(owner);
          else speech.play(owner, text);
        }}
      >
        {playing ? (
          <Square size={16} aria-hidden="true" />
        ) : (
          <Volume2 size={19} aria-hidden="true" />
        )}
      </button>
      {error && (
        <span className="speech-error" role="status">
          {error}
        </span>
      )}
    </span>
  );
}
