import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Shuffle, Star } from 'lucide-react';
import type { StudyAction, StudySessionDto } from '@memly/contracts';
import { SpeechButton } from '../shared/SpeechButton';
import { speech } from '../shared/speech';
import { ru } from '../shared/ru';
import { studyText as text } from '../shared/study-text';

export function FlashcardPlayer({
  session,
  blocked,
  send,
}: {
  session: StudySessionDto;
  blocked: boolean;
  send: (action: StudyAction) => Promise<StudySessionDto | null>;
}) {
  const q = session.current!;
  const sorting = session.options.cardSorting !== false;
  const [flipped, setFlipped] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState(false);
  const owner = useId();
  const touch = useRef<number | null>(null);
  const next = () => {
    setPlaying(false);
    if (sorting)
      void send({ type: 'navigate', index: (session.cursor + 1) % session.questions.length });
    else void send({ type: 'review', questionId: q.id });
  };
  const previous = () => {
    setPlaying(false);
    void send({ type: 'navigate', index: Math.max(0, session.cursor - 1) });
  };
  useEffect(() => {
    setFlipped(false);
  }, [q.id]);
  useEffect(() => () => speech.stop(owner), [owner, q.id]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!playing || blocked) return;
    if (audio) speech.play(owner, flipped ? (q.back ?? '') : q.prompt);
    const timer = window.setTimeout(() => {
      if (!flipped) setFlipped(true);
      else if (sorting) {
        if (session.cursor === session.questions.length - 1) setPlaying(false);
        else void send({ type: 'navigate', index: session.cursor + 1 });
      } else void send({ type: 'review', questionId: q.id });
    }, 2500);
    return () => {
      window.clearTimeout(timer);
      speech.stop(owner);
    };
  }, [playing, flipped, q.id, blocked, audio]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        blocked ||
        (event.target instanceof HTMLElement &&
          event.target.closest('button,input,textarea,select'))
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(false);
        setFlipped((v) => !v);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      }
      if (sorting && (event.key === '1' || event.key === '2')) {
        event.preventDefault();
        setPlaying(false);
        void send({ type: 'rate', questionId: q.id, known: event.key === '2' });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [session, blocked]);
  return (
    <>
      <div className="flashcard-toolbar">
        <button
          className="secondary"
          disabled={blocked}
          onClick={() => {
            setPlaying(false);
            void send({ type: 'shuffle' });
          }}
        >
          <Shuffle size={17} />
          {text.shuffle}
        </button>
        <button
          className="icon-button outlined"
          disabled={blocked}
          aria-label={q.starred ? text.unstar : text.star}
          aria-pressed={q.starred ?? false}
          onClick={() => void send({ type: 'star', questionId: q.id, starred: !q.starred })}
        >
          <Star size={20} fill={q.starred ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="flashcard-with-audio">
        <button
          className={`flashcard ${flipped ? 'flipped' : ''}`}
          disabled={blocked}
          aria-label={`${ru.flipAria}: ${flipped ? q.back : q.prompt}`}
          onClick={() => {
            setPlaying(false);
            setFlipped(!flipped);
          }}
          onTouchStart={(event) => {
            touch.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const x = event.changedTouches[0]?.clientX;
            if (touch.current !== null && x !== undefined && Math.abs(x - touch.current) > 60) {
              if (x < touch.current) next();
              else previous();
              event.preventDefault();
            }
            touch.current = null;
          }}
        >
          <div className="flashcard-inner">
            <div className="flashcard-face" aria-hidden={flipped}>
              <span className="eyebrow">
                {session.options.direction === 'forward' ? ru.term : ru.definition}
              </span>
              <strong>{q.prompt}</strong>
              <span className="flashcard-footer">{ru.flip}</span>
            </div>
            <div className="flashcard-face flashcard-back" aria-hidden={!flipped}>
              <strong>{q.back}</strong>
              <span className="flashcard-footer">{ru.flip}</span>
            </div>
          </div>
        </button>
        <div className="flashcard-audio">
          <SpeechButton key={q.id} text={flipped ? (q.back ?? '') : q.prompt} />
        </div>
      </div>
      <div className="card-controls">
        <button
          className="icon-button outlined"
          aria-label={ru.previous}
          disabled={blocked || session.cursor === 0}
          onClick={previous}
        >
          <ArrowLeft size={20} />
        </button>
        <span>
          {session.cursor + 1} / {session.questions.length}
        </span>
        <button
          className="icon-button outlined"
          aria-label={ru.next}
          disabled={blocked}
          onClick={next}
        >
          <ArrowRight size={20} />
        </button>
        <button
          className="icon-button outlined"
          aria-label={playing ? text.pause : text.play}
          aria-pressed={playing}
          disabled={blocked}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>
      <label className="study-checkbox autoplay-audio">
        <input
          type="checkbox"
          checked={audio}
          onChange={(event) => setAudio(event.target.checked)}
        />
        {text.autoAudio}
      </label>
      {sorting && (
        <div className="review-buttons">
          <button
            className="secondary"
            disabled={blocked}
            onClick={() => {
              setPlaying(false);
              void send({ type: 'rate', questionId: q.id, known: false });
            }}
          >
            <RotateCcw size={17} />
            {ru.learning}
          </button>
          <button
            className="primary"
            disabled={blocked}
            onClick={() => {
              setPlaying(false);
              void send({ type: 'rate', questionId: q.id, known: true });
            }}
          >
            <Check size={17} />
            {ru.know}
          </button>
        </div>
      )}
      <p className="keyboard-hint">
        {ru.flipHint}
        {sorting ? ' · 1 / 2' : ''}
      </p>
    </>
  );
}
