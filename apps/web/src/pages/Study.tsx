import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Star } from 'lucide-react';
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
import { useId } from 'react';
import { speech } from '../shared/speech';
import { SpeechButton } from '../shared/SpeechButton';
import { studyText as text, matchDuration } from '../shared/study-text';
import { ApiError, errorMessage } from '../shared/api';
import { studyClient } from '../features/study-client';
import { QuestionInput } from '../features/StudyQuestionInput';
import { StudySetup } from '../features/StudySetup';
import { FlashcardPlayer } from '../features/FlashcardPlayer';
import { MatchBoard } from '../features/MatchBoard';
import { StudyResults } from '../features/StudyResults';
import { PrototypeStudy } from './PrototypeStudy';
import { Scanword } from './Scanword';

export function Study(props: {
  deck: Deck;
  mode: StudyMode;
  back: () => void;
  changeMode: (mode: StudyMode) => void;
  saved?: () => Promise<void>;
  sessionId?: string;
}) {
  if (props.mode === 'scanword')
    return (
      <Scanword
        deck={props.deck}
        back={props.back}
        saved={props.saved}
        sessionId={props.sessionId}
      />
    );
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
  const speechOwner = useId();
  const [session, setSession] = useState<StudySessionDto | null>(null);
  const [resume, setResume] = useState<StudySessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<StudyOptions>({
    direction: 'reverse',
    cardSorting: false,
    matchGame: true,
    learnMethod: 'learn',
    retype: true,
    grading: 'strict',
    singleAnswer: false,
    testTypes: ['written', 'choice', 'truefalse', 'matching'],
    answerType: 'mixed',
    count:
      mode === 'match'
        ? Math.min(6, deck.cards.length)
        : mode === 'cards' || mode === 'learn'
          ? deck.cards.length
          : Math.min(20, deck.cards.length),
    shuffle: true,
    filter: 'all',
  });
  const [answer, setAnswer] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [retyped, setRetyped] = useState('');
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
  const accept = (value: StudySessionDto, restoreDrafts = true, preserveAnswer = false) => {
    receivedAt.current = Date.now();
    setSession(value);
    setOptions(value.options);
    setRetyped('');
    setConfirmSubmit(false);
    if (!preserveAnswer) setAnswer('');
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
      accept(value, true, input.action.type === 'star');
      if (value.status !== 'active')
        void savedRef.current?.().catch((error) => setError(errorMessage(error)));
      return value;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409
      )
        retryEvent.current = null;
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
      ...(mode === 'match' && options.matchGame && !cardIds
        ? { count: Math.min(6, deck.cards.length) }
        : {}),
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
    if (
      mode !== 'learn' ||
      session?.status !== 'active' ||
      !session.feedback?.correct ||
      blocked ||
      error
    )
      return;
    const timer = window.setTimeout(() => void send({ type: 'next' }), 1600);
    return () => window.clearTimeout(timer);
  }, [session?.revision, blocked, error, mode]);
  const pair = (
    side: 'left' | 'right',
    id: string,
    from?: { side: 'left' | 'right'; id: string },
  ) => {
    if (blocked) return;
    const first = from ?? selected;
    if (!first) {
      setSelected({ side, id });
      return;
    }
    if (first.id === id) {
      setSelected(null);
      return;
    }
    if (first.side === side) {
      if (session?.options.matchGame) void send({ type: 'mismatch', first: first.id, second: id });
      else setSelected({ side, id });
      return;
    }
    void send({
      type: 'pair',
      left: side === 'left' ? id : first.id,
      right: side === 'right' ? id : first.id,
    });
  };
  const q = session?.current;
  useEffect(() => {
    if (
      mode !== 'learn' ||
      !q?.audio ||
      session?.feedback ||
      blocked ||
      session?.status !== 'active'
    )
      return;
    speech.play(speechOwner, q.audio, undefined, options.audioSpeed ?? 1);
    return () => speech.stop(speechOwner);
  }, [q?.id, session?.feedback, blocked, mode, speechOwner]);
  useEffect(() => {
    if (mode !== 'learn' || !q || q.type !== 'choice' || session?.feedback || blocked) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select'))
        return;
      const option = q.options[Number(event.key) - 1];
      if (/^[1-4]$/u.test(event.key) && option) {
        event.preventDefault();
        void send({ type: 'answer', questionId: q.id, value: option.id });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [q?.id, session?.feedback, blocked, mode]);
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
    <div
      className={`study-page ${mode === 'match' && session?.status === 'active' && session.options.matchGame ? 'match-active' : ''}`}
    >
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
                <FlashcardPlayer session={session} blocked={blocked} send={send} />
              )}
              {mode === 'learn' && session.learning && (
                <div className="learn-progress-groups">
                  <span>
                    {text.familiar}: {session.learning.familiar} / {session.learning.total}
                  </span>
                  <span>
                    {text.masteredShort}: {session.learning.mastered} / {session.learning.total}
                  </span>
                  {session.learning.streak >= 5 && (
                    <strong>
                      {text.streak}: {session.learning.streak}
                    </strong>
                  )}
                </div>
              )}
              {mode === 'learn' &&
                (session.feedback ? (
                  <section className="panel question-panel">
                    <div className="spoken-heading">
                      <h2>{session.feedback.prompt}</h2>
                      <SpeechButton text={session.feedback.prompt} />
                    </div>
                    <div
                      className={`study-feedback ${session.feedback.correct ? 'correct' : 'incorrect'}`}
                      role="status"
                    >
                      <strong>{session.feedback.correct ? text.correct : text.incorrect}</strong>
                      <p>
                        {text.yourAnswer}: {session.feedback.answer}
                      </p>
                      <p className="spoken-answer">
                        {text.expected}: {session.feedback.expected}
                        <SpeechButton text={session.feedback.expected} />
                      </p>
                    </div>
                    {session.feedback.retypeRequired && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void send({ type: 'retype', value: retyped });
                        }}
                      >
                        <label>
                          {text.retypePrompt}
                          <input
                            value={retyped}
                            disabled={blocked}
                            onChange={(event) => setRetyped(event.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                        <button className="secondary" disabled={blocked || !retyped.trim()}>
                          {text.retypeCheck}
                        </button>
                      </form>
                    )}
                    {session.feedback.canOverride && (
                      <button
                        className="text-button"
                        disabled={blocked}
                        onClick={() => void send({ type: 'override' })}
                      >
                        {text.override}
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={blocked || session.feedback.retypeRequired}
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
                      <div className="spoken-heading">
                        <h2>{q.audio ? text.listen : q.prompt}</h2>
                        <SpeechButton
                          key={q.id}
                          text={q.audio ?? q.prompt}
                          label={q.audio ? text.listenWord : undefined}
                          rate={options.audioSpeed ?? 1}
                        />
                        <button
                          className="icon-button outlined"
                          type="button"
                          disabled={blocked}
                          aria-label={q.starred ? text.unstar : text.star}
                          aria-pressed={q.starred ?? false}
                          onClick={() =>
                            void send({ type: 'star', questionId: q.id, starred: !q.starred })
                          }
                        >
                          <Star size={18} fill={q.starred ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <QuestionInput
                        key={q.id}
                        submit={() =>
                          void send({ type: 'answer', questionId: q.id, value: answer })
                        }
                        question={q}
                        value={answer}
                        change={(value) => {
                          setAnswer(value);
                          if (q.type === 'choice')
                            void send({ type: 'answer', questionId: q.id, value });
                        }}
                        disabled={blocked}
                      />
                      <button
                        type="button"
                        className="text-button"
                        disabled={blocked}
                        onClick={() => void send({ type: 'skip', questionId: q.id })}
                      >
                        {text.dontKnow}
                      </button>
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
                          {question.matchGroup !== undefined && (
                            <>
                              {' '}
                              · {text.matching} · {text.group} {question.matchGroup}
                            </>
                          )}
                        </span>
                        <div className="spoken-heading">
                          <h2>{question.prompt}</h2>
                          <SpeechButton text={question.prompt} />
                        </div>
                        {question.statement !== undefined && (
                          <p className="test-statement">{question.statement}</p>
                        )}
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
                  {confirmSubmit && (
                    <section className="panel unanswered-prompt" role="alert">
                      <p>{text.unansweredConfirm}</p>
                      <div className="study-actions">
                        <button
                          className="primary"
                          disabled={blocked}
                          onClick={() =>
                            void send({
                              type: 'test',
                              finish: true,
                              allowUnanswered: true,
                              answers: Object.entries(drafts).map(([questionId, value]) => ({
                                questionId,
                                value,
                              })),
                            })
                          }
                        >
                          {text.submitAnyway}
                        </button>
                        <button
                          className="secondary"
                          disabled={blocked}
                          onClick={() => setConfirmSubmit(false)}
                        >
                          {text.cancel}
                        </button>
                      </div>
                    </section>
                  )}
                  <div className="test-finish">
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={() => {
                        if (session.questions.some((q) => !drafts[q.id]?.trim())) {
                          setConfirmSubmit(true);
                          return;
                        }
                        void send({
                          type: 'test',
                          finish: true,
                          answers: Object.entries(drafts).map(([questionId, value]) => ({
                            questionId,
                            value,
                          })),
                        });
                      }}
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
                      {matchDuration(elapsed)} · {text.mistakes}: {session.summary.mistakes}
                    </span>
                  </div>
                  <MatchBoard session={session} blocked={blocked} selected={selected} pair={pair} />
                  {session.feedback && (
                    <p className="match-message" role="status">
                      {session.feedback.correct ? text.pairCorrect : text.pairWrong}
                    </p>
                  )}
                  <p className="keyboard-hint">
                    {text.clockHint} {text.penaltyHint}
                  </p>
                  <button className="secondary" disabled={blocked} onClick={() => void start()}>
                    {text.matchRestart}
                  </button>
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
