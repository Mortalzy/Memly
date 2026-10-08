import { useEffect, useState } from 'react';
import type { StudyHistoryItem, StudyOverview } from '@memly/contracts';
import { studyClient } from './study-client';
import { errorMessage } from '../shared/api';
import { ru } from '../shared/ru';
import { studyText as text, studyDuration } from '../shared/study-text';
export function StudyHistory({ open }: { open: (item: StudyHistoryItem) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StudyOverview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError('');
    studyClient
      .overview(days, abort.signal)
      .then(setData)
      .catch((error) => {
        if (!abort.signal.aborted) setError(errorMessage(error));
      });
    return () => abort.abort();
  }, [days, attempt]);
  return (
    <section className="study-history">
      <div className="section-heading">
        <h2>{text.history}</h2>
        <div className="segmented">
          <button
            aria-pressed={days === 7}
            className={days === 7 ? 'active' : ''}
            onClick={() => setDays(7)}
          >
            {text.week}
          </button>
          <button
            aria-pressed={days === 30}
            className={days === 30 ? 'active' : ''}
            onClick={() => setDays(30)}
          >
            {text.month}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
          <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>
            {text.retry}
          </button>
        </p>
      ) : !data ? (
        <p role="status">{text.loading}</p>
      ) : (
        <>
          <div className="study-overview">
            <div>
              <strong>{data.completed}</strong>
              <span>{text.completed}</span>
            </div>
            <div>
              <strong>
                {data.correct} / {data.questions}
              </strong>
              <span>{text.correctCount}</span>
            </div>
            <div>
              <strong>{studyDuration(data.elapsedMs)}</strong>
              <span>{text.elapsed}</span>
            </div>
          </div>
          <div className="panel study-results">
            {data.history.length ? (
              data.history.map((item) => (
                <article key={item.id}>
                  <div>
                    <h3>
                      {item.deckTitle} · {ru[item.mode]}
                    </h3>
                    <p>
                      {new Date(item.startedAt).toLocaleString('ru-RU')} ·{' '}
                      {item.status === 'completed'
                        ? text.completed
                        : item.status === 'active'
                          ? text.active
                          : text.abandoned}
                    </p>
                    <p>
                      {item.summary.correct} / {item.summary.total} · {text.mistakes}:{' '}
                      {item.summary.mistakes} · {studyDuration(item.elapsedMs)}
                    </p>
                  </div>
                  <button className="secondary" onClick={() => open(item)}>
                    {item.status === 'active' ? text.continue : text.openResult}
                  </button>
                </article>
              ))
            ) : (
              <p>{text.emptyHistory}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
