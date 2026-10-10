import { Check } from 'lucide-react';
import type { StudySessionDto } from '@memly/contracts';
import { cardCount } from '../shared/ru';
import { studyText as text, studyDuration } from '../shared/study-text';
import { SpeechButton } from '../shared/SpeechButton';
export function StudyResults({
  session,
  pending,
  onStart,
  onSetup,
}: {
  session: StudySessionDto;
  pending: boolean;
  onStart: (cardIds?: string[]) => void | Promise<void>;
  onSetup: () => void;
}) {
  const mode = session.mode;
  const total = session.summary.total;
  return (
    <>
      <section className="panel result-panel">
        <span className="result-icon">
          <Check size={40} />
        </span>
        <h2>{session.status === 'completed' ? text.result : text.abandoned}</h2>
        <span className="eyebrow">
          {mode === 'learn'
            ? text.firstPass
            : mode === 'cards'
              ? text.known
              : mode === 'match'
                ? text.matched
                : text.correctCount}
        </span>
        <div className="result-score">
          {session.summary.score}
          <span>%</span>
        </div>
        <p>
          {session.summary.correct} / {total} · {text.mistakes}: {session.summary.mistakes} ·{' '}
          {text.attempts}: {session.summary.attempts}
          <br />
          {text.mastered}: {cardCount(session.summary.mastered)}
          <br />
          {text.elapsed}: {studyDuration(session.elapsedMs)}
          {session.bestMs !== null && (
            <>
              <br />
              {text.best}: {studyDuration(session.bestMs)}
            </>
          )}
        </p>
        <div className="study-actions">
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              void onStart(
                session.results.length && !session.outdated
                  ? session.results.map((row) => row.cardId)
                  : undefined,
              )
            }
          >
            {text.again}
          </button>
          {session.results.some((row) => row.mistakes || !row.correct) && !session.outdated && (
            <button
              className="secondary"
              disabled={pending}
              onClick={() =>
                void onStart(
                  session.results
                    .filter((row) => row.mistakes || !row.correct)
                    .map((row) => row.cardId),
                )
              }
            >
              {text.repeatMistakes}
            </button>
          )}
          <button className="secondary" onClick={() => onSetup()}>
            {text.setup}
          </button>
        </div>
      </section>
      {session.results.length > 0 && (
        <section className="panel study-results">
          <h2>{text.review}</h2>
          {session.results.map((row) => (
            <article
              key={row.cardId}
              className={row.mistakes || !row.correct ? 'study-result-error' : ''}
            >
              <div className="spoken-heading">
                <strong>{row.prompt}</strong>
                <SpeechButton text={row.prompt} />
              </div>
              <p className="spoken-answer">
                {text.expected}: {row.expected}
                <SpeechButton text={row.expected} />
              </p>
              <p>
                {text.yourAnswer}: {row.answer || '—'} · {text.mistakes}: {row.mistakes}
              </p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
