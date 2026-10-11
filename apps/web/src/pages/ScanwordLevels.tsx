import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Info, LockKeyhole, Puzzle } from 'lucide-react';
import type { ScanwordLevelId, ScanwordLevelsDto } from '@memly/contracts';
import { PageHeading, ProgressBar } from '../shared/ui';
import { errorMessage } from '../shared/api';
import { scanwordText as text } from '../shared/scanword-text';
import { studyClient } from '../features/study-client';
import { demoScanwordLevels } from '../features/scanword-demo';

export function ScanwordLevels({
  live,
  back,
  play,
}: {
  live: boolean;
  back: () => void;
  play: (id: ScanwordLevelId) => void;
}) {
  const [data, setData] = useState<ScanwordLevelsDto | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError('');
    const request = live ? studyClient.levels(abort.signal) : Promise.resolve(demoScanwordLevels());
    void request
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(errorMessage(failure));
      });
    return () => abort.abort();
  }, [live, attempt]);
  return (
    <div className="scanword-levels-page">
      <button className="back-link" onClick={back}>
        <ArrowLeft size={17} />
        {text.allGames}
      </button>
      <div className="scanword-levels-heading">
        <PageHeading title={text.levelsTitle} subtitle={text.levelsSubtitle} />
        <span className="scanword-catalog-badge">
          <Puzzle size={20} />
          {text.curated}
        </span>
      </div>
      {!live && <p className="study-notice">{text.levelsDemo}</p>}
      {error ? (
        <div className="form-error" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>
            {text.retry}
          </button>
        </div>
      ) : !data ? (
        <p role="status">{text.loading}</p>
      ) : (
        <>
          <section className="panel scanword-levels-progress" aria-label={text.yourProgress}>
            <strong>{text.yourProgress}</strong>
            <span>{text.levelProgress(data.completed, data.total)}</span>
            <ProgressBar value={data.total ? (data.completed / data.total) * 100 : 0} />
            <span>{data.total ? Math.round((data.completed / data.total) * 100) : 0}%</span>
          </section>
          <div className="scanword-levels-grid">
            {data.levels.map((level) => (
              <article
                key={level.id}
                className={`panel scanword-level-card ${level.completed ? 'is-completed' : level.unlocked ? 'is-available' : 'is-locked'}`}
                aria-label={`${text.level(level.number)}: ${level.title}`}
              >
                <div className="scanword-level-art" aria-hidden="true">
                  <div className="scanword-mini-grid">
                    {Array.from({ length: 25 }, (_, i) => (
                      <span
                        key={i}
                        className={
                          (i + level.number) % 7 === 0
                            ? 'rose'
                            : (i * 3 + level.number) % 5 === 0
                              ? 'block'
                              : ''
                        }
                      />
                    ))}
                  </div>
                  {level.completed ? (
                    <span className="scanword-completed-icon">
                      <Check size={22} />
                    </span>
                  ) : !level.unlocked ? (
                    <LockKeyhole className="scanword-locked-icon" size={24} />
                  ) : null}
                </div>
                <span className="scanword-level-number">{text.level(level.number)}</span>
                <h2>{level.title}</h2>
                <p>
                  {text.wordCount(level.wordCount)} · {text.difficulty[level.difficulty]}
                </p>
                <span
                  className={`scanword-level-status ${level.completed ? 'completed' : level.unlocked ? 'available' : 'locked'}`}
                >
                  {level.completed
                    ? text.levelCompleted
                    : level.unlocked
                      ? text.levelAvailable
                      : text.levelLocked}
                </span>
                <button
                  className={level.unlocked && !level.completed ? 'primary' : 'secondary'}
                  disabled={!level.unlocked}
                  onClick={() => play(level.id)}
                >
                  {!level.unlocked
                    ? text.finishBefore(level.number - 1)
                    : level.activeSessionId
                      ? text.continue
                      : level.completed
                        ? text.replayLevel
                        : text.startLevel}
                </button>
              </article>
            ))}
          </div>
          <p className="scanword-levels-note">
            <Info size={19} />
            {text.unlockHint}
          </p>
        </>
      )}
    </div>
  );
}
