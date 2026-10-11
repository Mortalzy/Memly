import { Check } from 'lucide-react';
import type { StudySessionDto } from '@memly/contracts';
import { cardCount } from '../shared/ru';
import { studyText as text, studyDuration, matchDuration } from '../shared/study-text';
import { SpeechButton } from '../shared/SpeechButton';
import { scanwordText } from '../shared/scanword-text';
export function StudyResults({
  session,
  pending,
  onStart,
  onSetup,
  readOnly = false,
}: {
  session: StudySessionDto;
  pending: boolean;
  onStart: (cardIds?: string[]) => void | Promise<void>;
  onSetup: () => void;
  readOnly?: boolean;
}) {
  const mode = session.mode;
  const total = session.summary.total;
  const reviewOnly = mode === 'cards' && session.options.cardSorting === false;
  return (
    <>
      <section className="panel result-panel">
        <span className="result-icon">
          <Check size={40} />
        </span>
        <h2>{session.status === 'completed' ? text.result : text.abandoned}</h2>
        <span className="eyebrow">
          {reviewOnly
            ? text.reviewed
            : mode === 'scanword'
              ? scanwordText.independent
              : mode === 'learn'
                ? text.firstPass
                : mode === 'cards'
                  ? text.known
                  : mode === 'match'
                    ? text.matchClock
                    : text.correctCount}
        </span>
        <div className="result-score">
          {reviewOnly ? (
            `${session.summary.answered} / ${total}`
          ) : mode === 'match' ? (
            matchDuration(session.elapsedMs)
          ) : (
            <>
              {session.summary.score}
              <span>%</span>
            </>
          )}
        </div>
        <p>
          {!reviewOnly && (
            <>
              {session.summary.correct} / {total} · {text.mistakes}: {session.summary.mistakes} ·{' '}
              {text.attempts}: {session.summary.attempts}
              <br />
              {text.mastered}: {cardCount(session.summary.mastered)}
              <br />
            </>
          )}
          {mode === 'match' && (
            <>
              {text.penalty}: {matchDuration(session.penaltyMs ?? 0)}
              <br />
            </>
          )}
          {text.elapsed}: {studyDuration(session.elapsedMs)}
          {mode === 'scanword' && (
            <>
              <br />
              {scanwordText.hints}: {session.summary.hints ?? 0}
            </>
          )}
          {session.bestMs !== null && (
            <>
              <br />
              {text.best}:{' '}
              {mode === 'match' ? matchDuration(session.bestMs) : studyDuration(session.bestMs)}
            </>
          )}
        </p>
        {!readOnly && (
          <div className="study-actions">
            <button
              className="primary"
              disabled={pending}
              onClick={() =>
                void onStart(
                  mode !== 'match' && session.results.length && !session.outdated
                    ? session.results.map((row) => row.cardId)
                    : undefined,
                )
              }
            >
              {text.again}
            </button>
            {!reviewOnly &&
              session.results.some((row) => row.mistakes || row.hints || !row.correct) &&
              !session.outdated && (
                <button
                  className="secondary"
                  disabled={pending}
                  onClick={() =>
                    void onStart(
                      session.results
                        .filter((row) => row.mistakes || row.hints || !row.correct)
                        .map((row) => row.cardId),
                    )
                  }
                >
                  {text.repeatMistakes}
                </button>
              )}
            {mode === 'test' && (
              <button className="secondary" onClick={() => window.print()}>
                {text.print}
              </button>
            )}
            <button className="secondary" onClick={() => onSetup()}>
              {text.setup}
            </button>
          </div>
        )}
      </section>
      {session.results.length > 0 && (
        <section className="panel study-results">
          <h2>{text.review}</h2>
          {session.results.map((row) => (
            <article
              key={row.cardId}
              className={
                !reviewOnly && (row.mistakes || row.hints || !row.correct)
                  ? 'study-result-error'
                  : ''
              }
            >
              <div className="spoken-heading">
                <strong>{row.prompt}</strong>
                <SpeechButton text={row.prompt} />
              </div>
              <p className="spoken-answer">
                {text.expected}: {row.expected}
                <SpeechButton text={row.expected} />
              </p>
              {!reviewOnly && (
                <p>
                  {text.yourAnswer}: {row.answer || '—'} · {text.mistakes}: {row.mistakes}
                  {mode === 'scanword' && (
                    <>
                      {' '}
                      · {scanwordText.hints}: {row.hints ?? 0}
                    </>
                  )}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
