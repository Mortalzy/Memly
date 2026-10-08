import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, RotateCcw } from 'lucide-react';
import type {
  StartStudyInput,
  StudyAction,
  StudyEventInput,
  StudyOptions,
  StudySessionDto,
} from '@memly/contracts';
import type { Deck, StudyMode } from '../entities/deck';
import { Modes, ProgressBar } from '../shared/ui';
import { ru } from '../shared/ru';
import { studyText as text, studyDuration } from '../shared/study-text';
import { errorMessage } from '../shared/api';
import { studyClient } from '../features/study-client';
import { QuestionInput } from '../features/StudyQuestionInput';
import { StudySetup } from '../features/StudySetup';
import { StudyResults } from '../features/StudyResults';
import { PrototypeStudy } from './PrototypeStudy';

export function Study(props: {
  deck: Deck;
  mode: StudyMode;
  back: () => void;
  changeMode: (mode: StudyMode) => void;
  saved?: () => Promise<void>;
  sessionId?: string;
}) {
  return props.saved ? <SessionStudy {...props} /> : <PrototypeStudy {...props} />;
}
function draftsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => left[key] === right[key])
  );
}
function SessionStudy({
  deck,
  mode,
  back,
  changeMode,
  saved,
  sessionId,
}: {
  deck: Deck;
  mode: StudyMode;
  back: () => void;
  changeMode: (mode: StudyMode) => void;
  saved?: () => Promise<void>;
  sessionId?: string;
}) {
  const [session, setSession] = useState<StudySessionDto | null>(null);
  const [resume, setResume] = useState<StudySessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<StudyOptions>({
    direction: 'forward',
    answerType: 'mixed',
    count:
      mode === 'cards' || mode === 'match' ? deck.cards.length : Math.min(20, deck.cards.length),
    shuffle: true,
    filter: 'all',
  });
  const [answer, setAnswer] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flipped, setFlipped] = useState(false);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; id: string } | null>(null);
  const [clock, setClock] = useState(0);
  const receivedAt = useRef(Date.now());
  const busy = useRef(false);
  const retryEvent = useRef<StudyEventInput | null>(null);
  const retryStart = useRef<StartStudyInput | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const blocked = pending || Boolean(retryEvent.current);
  const accept = (value: StudySessionDto, restoreDrafts = true) => {
    receivedAt.current = Date.now();
    setSession(value);
    setOptions(value.options);
    setFlipped(false);
    setAnswer('');
    setSelected(null);
    if (restoreDrafts) setDrafts(value.drafts);
  };
  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      if (sessionId) {
        const value = await studyClient.get(sessionId, signal);
        if (value.deckId !== deck.id || value.mode !== mode)
          throw new Error('Занятие относится к другому набору или режиму');
        accept(value);
      } else setResume(await studyClient.active(deck.id, mode, signal));
    } catch (error) {
      if (!signal?.aborted) setError(errorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [deck.id, mode, sessionId]);
  useEffect(() => {
    if (mode !== 'match' || session?.status !== 'active') return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [mode, session?.status]);
  const send = async (action?: StudyAction): Promise<StudySessionDto | null> => {
    if (!session || busy.current) return null;
    const input =
      retryEvent.current ??
      (action ? { eventId: crypto.randomUUID(), revision: session.revision, action } : null);
    if (!input) return null;
    busy.current = true;
    setPending(true);
    setError('');
    retryEvent.current = input;
    try {
      const value = await studyClient.event(session.id, input);
      retryEvent.current = null;
      accept(value);
      if (value.status !== 'active')
        void savedRef.current?.().catch((error) => setError(errorMessage(error)));
      return value;
    } catch (error) {
      setError(errorMessage(error));
      return null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const reload = async () => {
    if (!session || busy.current) return;
    setPending(true);
    try {
      const value = await studyClient.get(session.id);
      retryEvent.current = null;
      accept(value);
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const start = async (cardIds?: string[]) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    const settings = {
      ...options,
      ...(cardIds ? { count: cardIds.length, filter: 'all' as const } : {}),
    };
    const input = retryStart.current ?? {
      requestId: crypto.randomUUID(),
      deckId: deck.id,
      mode,
      options: settings,
      ...(cardIds ? { cardIds } : {}),
    };
    retryStart.current = input;
    try {
      const value = await studyClient.start(input);
      retryStart.current = null;
      retryEvent.current = null;
      setResume(null);
      accept(value);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const reset = async () => {
    if (resume) setResume(null);
    else {
      setSession(null);
      retryEvent.current = null;
      retryStart.current = null;
      setError('');
    }
  };
  // Persist complete draft snapshots. Failed delivery is retried with the same event ID.
  useEffect(() => {
    if (
      !session ||
      mode !== 'test' ||
      session.status !== 'active' ||
      pending ||
      error ||
      draftsEqual(drafts, session.drafts)
    )
      return;
    const timer = window.setTimeout(
      () =>
        void send({
          type: 'test',
          finish: false,
          answers: Object.entries(drafts).map(([questionId, value]) => ({ questionId, value })),
        }),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [drafts, session?.revision, pending, error]);
  useEffect(() => {
    if (mode !== 'cards' || session?.status !== 'active') return;
    const key = (event: KeyboardEvent) => {
      if (
        blocked ||
        (event.target instanceof HTMLElement &&
          event.target.closest('button,input,textarea,select'))
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setFlipped((value) => !value);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const index =
          (session.cursor + (event.key === 'ArrowLeft' ? -1 : 1) + session.questions.length) %
          session.questions.length;
        void send({ type: 'navigate', index });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mode, session, blocked]);
  const pair = (side: 'left' | 'right', id: string) => {
    if (blocked) return;
    if (!selected || selected.side === side) {
      setSelected({ side, id });
      return;
    }
    void send({
      type: 'pair',
      left: side === 'left' ? id : selected.id,
      right: side === 'right' ? id : selected.id,
    });
  };
  const q = session?.current;
  const updateOptions = (next: Partial<StudyOptions>) => {
    retryStart.current = null;
    setOptions((value) => ({ ...value, ...next }));
  };
  const intro =
    mode === 'cards'
      ? text.cardsHint
      : mode === 'learn'
        ? text.learnHint
        : mode === 'test'
          ? text.testHint
          : text.matchHint;
  const total = session?.summary.total ?? 0;
  const elapsed =
    session?.status === 'active'
      ? session.elapsedMs + Math.max(0, (clock || Date.now()) - receivedAt.current)
      : (session?.elapsedMs ?? 0);
  return (
    <div className="study-page">
      <div className="study-topbar">
        <button className="back-link" onClick={back}>
          <ArrowLeft size={18} />
          {deck.title}
        </button>
        <button className="secondary" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {ru[mode]}
          <ChevronDown size={16} />
        </button>
      </div>
      {menu && (
        <div className="study-mode-picker">
          <Modes onSelect={changeMode} active={mode} />
        </div>
      )}
      <div className="study-intro">
        <span className="eyebrow">{text.saved}</span>
        <h1>{ru[mode]}</h1>
        <p>{intro}</p>
      </div>
      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
          <div className="study-actions">
            {retryEvent.current ? (
              <>
                <button className="secondary" disabled={pending} onClick={() => void send()}>
                  {text.retry}
                </button>
                <button className="secondary" disabled={pending} onClick={() => void reload()}>
                  {text.reload}
                </button>
              </>
            ) : (
              <button
                className="secondary"
                disabled={pending}
                onClick={() =>
                  retryStart.current ? void start() : session ? void reload() : void load()
                }
              >
                {text.retry}
              </button>
            )}
          </div>
        </div>
      )}
      {loading ? (
        <p role="status">{text.loading}</p>
      ) : !session ? (
        <>
          {resume && (
            <section className="panel study-resume">
              <h2>{text.resume}</h2>
              <p>
                {text.resumeHint} · {resume.summary.answered} / {resume.summary.total}
              </p>
              <div className="study-actions">
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => {
                    accept(resume);
                    setResume(null);
                  }}
                >
                  {text.continue}
                </button>
                <button className="secondary" disabled={pending} onClick={() => void reset()}>
                  {text.new}
                </button>
              </div>
            </section>
          )}
          {!resume && (
            <StudySetup
              mode={mode}
              options={options}
              pending={pending}
              available={deck.cards.length}
              updateOptions={updateOptions}
              onStart={() => void start()}
            />
          )}
        </>
      ) : (
        <>
          {session.outdated && (
            <p className="study-notice" role="status">
              {text.outdated}
            </p>
          )}
          {session.status !== 'active' ? (
            <StudyResults
              session={session}
              pending={pending}
              onStart={start}
              onSetup={() => void reset()}
            />
          ) : (
            <>
              <div className="study-progress">
                <ProgressBar value={total ? (session.summary.answered / total) * 100 : 0} />
                <span>
                  {session.summary.answered} / {total}
                </span>
              </div>
              {mode === 'cards' && q && (
                <>
                  <button
                    className={`flashcard ${flipped ? 'flipped' : ''}`}
                    aria-label={`${ru.flipAria}: ${flipped ? q.back : q.prompt}`}
                    onClick={() => setFlipped(!flipped)}
                  >
                    <div className="flashcard-inner">
                      <div className="flashcard-face">
                        <span className="eyebrow">
                          {options.direction === 'forward' ? ru.term : ru.definition}
                        </span>
                        <strong>{q.prompt}</strong>
                        <span className="flashcard-footer">{ru.flip}</span>
                      </div>
                      <div className="flashcard-face flashcard-back">
                        <strong>{q.back}</strong>
                        <span className="flashcard-footer">{ru.flip}</span>
                      </div>
                    </div>
                  </button>
                  <div className="card-controls">
                    <button
                      className="icon-button outlined"
                      aria-label={ru.previous}
                      disabled={blocked}
                      onClick={() =>
                        void send({
                          type: 'navigate',
                          index:
                            (session.cursor - 1 + session.questions.length) %
                            session.questions.length,
                        })
                      }
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
                      onClick={() =>
                        void send({
                          type: 'navigate',
                          index: (session.cursor + 1) % session.questions.length,
                        })
                      }
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                  <div className="review-buttons">
                    <button
                      className="secondary"
                      disabled={blocked}
                      onClick={() => void send({ type: 'rate', questionId: q.id, known: false })}
                    >
                      <RotateCcw size={17} />
                      {ru.learning}
                    </button>
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={() => void send({ type: 'rate', questionId: q.id, known: true })}
                    >
                      <Check size={17} />
                      {ru.know}
                    </button>
                  </div>
                  <p className="keyboard-hint">{ru.flipHint}</p>
                </>
              )}
              {mode === 'learn' &&
                (session.feedback ? (
                  <section className="panel question-panel">
                    <h2>{session.feedback.prompt}</h2>
                    <div
                      className={`study-feedback ${session.feedback.correct ? 'correct' : 'incorrect'}`}
                      role="status"
                    >
                      <strong>{session.feedback.correct ? text.correct : text.incorrect}</strong>
                      <p>
                        {text.yourAnswer}: {session.feedback.answer}
                      </p>
                      <p>
                        {text.expected}: {session.feedback.expected}
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={() => void send({ type: 'next' })}
                    >
                      {text.next}
                      <ArrowRight size={17} />
                    </button>
                  </section>
                ) : (
                  q && (
                    <form
                      className="panel question-panel"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send({ type: 'answer', questionId: q.id, value: answer });
                      }}
                    >
                      <span className="eyebrow">
                        {q.type === 'choice' ? text.choice : text.written}
                      </span>
                      <h2>{q.prompt}</h2>
                      <QuestionInput
                        question={q}
                        value={answer}
                        change={setAnswer}
                        disabled={blocked}
                      />
                      <button
                        className="primary study-submit"
                        type="submit"
                        disabled={blocked || !answer.trim()}
                      >
                        {text.check}
                      </button>
                    </form>
                  )
                ))}
              {mode === 'test' && (
                <>
                  <p className="study-draft-status" role="status">
                    {pending
                      ? text.saving
                      : draftsEqual(drafts, session.drafts)
                        ? text.autosaved
                        : text.unsaved}
                  </p>
                  <div className="test-question-list">
                    {session.questions.map((question, index) => (
                      <section className="panel test-question" key={question.id}>
                        <span className="eyebrow">
                          {ru.question} {index + 1} / {session.questions.length}
                        </span>
                        <h2>{question.prompt}</h2>
                        <QuestionInput
                          question={question}
                          value={drafts[question.id] ?? ''}
                          change={(value) =>
                            setDrafts((previous) => ({ ...previous, [question.id]: value }))
                          }
                          disabled={blocked}
                        />
                      </section>
                    ))}
                  </div>
                  <div className="test-finish">
                    <button
                      className="primary"
                      disabled={blocked || session.questions.some((q) => !drafts[q.id]?.trim())}
                      onClick={() =>
                        void send({
                          type: 'test',
                          finish: true,
                          answers: Object.entries(drafts).map(([questionId, value]) => ({
                            questionId,
                            value,
                          })),
                        })
                      }
                    >
                      {text.finish}
                    </button>
                  </div>
                </>
              )}
              {mode === 'match' && session.board && (
                <>
                  <div className="match-status">
                    <span className="badge">
                      {session.board.round} / {session.board.rounds} · {session.summary.answered} /{' '}
                      {total}
                    </span>
                    <span aria-live="off">
                      {studyDuration(elapsed)} · {text.mistakes}: {session.summary.mistakes}
                    </span>
                  </div>
                  <div className="match-board">
                    {(['left', 'right'] as const).map((side) => (
                      <div key={side}>
                        {session.board![side].map((tile) => (
                          <button
                            key={tile.id}
                            className={`match-tile ${tile.matched ? 'matched' : ''} ${selected?.id === tile.id ? 'selected' : ''}`}
                            disabled={tile.matched || blocked}
                            aria-pressed={selected?.id === tile.id}
                            onClick={() => pair(side, tile.id)}
                          >
                            {tile.matched ? <Check size={22} /> : tile.text}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {session.feedback && (
                    <p className="match-message" role="status">
                      {session.feedback.correct ? text.pairCorrect : text.pairWrong}
                    </p>
                  )}
                  <p className="keyboard-hint">{text.clockHint}</p>
                </>
              )}
              <div className="study-bottom">
                <button
                  className="text-button"
                  disabled={blocked}
                  onClick={() => {
                    if (window.confirm(text.stopConfirm)) void send({ type: 'abandon' });
                  }}
                >
                  {text.stop}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
