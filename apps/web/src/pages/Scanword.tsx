import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Puzzle } from 'lucide-react';
import { SCANWORD_LEVELS, type ScanwordLevelId } from '@memly/contracts';
import type { Deck } from '../entities/deck';
import { PageHeading, ProgressBar } from '../shared/ui';
import { scanwordText as text } from '../shared/scanword-text';
import { studyDuration, studyText } from '../shared/study-text';
import { StudyResults } from '../features/StudyResults';
import { ScanwordBoard } from '../features/ScanwordBoard';
import { useScanwordSession } from '../features/use-scanword-session';

export function Scanword({
  deck,
  levelId,
  nextLevel,
  back,
  saved,
  sessionId,
}: {
  deck?: Deck;
  levelId?: ScanwordLevelId;
  nextLevel?: (id: ScanwordLevelId) => void;
  back: () => void;
  saved?: () => Promise<void>;
  sessionId?: string;
}) {
  const level = SCANWORD_LEVELS.find((item) => item.id === levelId);
  const game = useScanwordSession(level ?? deck!, saved, sessionId);
  const [checked, setChecked] = useState(false);
  const session = game.session;
  const board = session?.scanword;
  const roundDone = board?.words.every((word) => word.solved);
  const next = level ? SCANWORD_LEVELS.find((item) => item.number === level.number + 1) : undefined;
  const start = () => {
    if (level) {
      setChecked(false);
      void game.start({ requestId: crypto.randomUUID() });
    }
  };
  const leave = async () => {
    if (!session || session.status !== 'active' || (await game.flush())) back();
  };
  const check = async () => {
    if (!board || game.pending || game.hasRetry) return;
    const value = await game.send({
      type: 'scanword-check',
      round: board.round,
      cells: Object.entries(game.drafts)
        .filter(([, value]) => value)
        .map(([key, value]) => ({ key, value })),
    });
    if (value) setChecked(true);
  };
  return (
    <div className="scanword-page">
      <button className="back-link" disabled={game.pending} onClick={() => void leave()}>
        <ArrowLeft size={17} />
        {text.allLevels}
      </button>
      <PageHeading
        title={level ? `${text.level(level.number)}: ${level.title}` : text.title}
        subtitle={text.subtitle}
      />
      {!saved && <p className="study-notice">{text.demo}</p>}
      <section className="panel scanword-deck-bar">
        <span className="scanword-deck-icon">
          {level ? <Puzzle size={23} /> : <BookOpen size={23} />}
        </span>
        <div>
          <strong>{session?.deckTitle ?? level?.title ?? deck?.title}</strong>
          <p>
            {session
              ? text.solved(session.summary.answered, session.summary.total)
              : level
                ? `${text.wordCount(level.wordCount)} · ${text.difficulty[level.difficulty]}`
                : text.legacyHint}
          </p>
        </div>
      </section>
      {game.error && (
        <div className="form-error" role="alert">
          <p>{game.error}</p>
          <div className="study-actions">
            <button
              className="secondary"
              disabled={game.pending}
              onClick={() =>
                game.hasRetry
                  ? void game.send()
                  : game.hasStartRetry
                    ? void game.retryStart()
                    : void game.load()
              }
            >
              {text.retry}
            </button>
            {session && saved && (
              <button
                className="secondary"
                disabled={game.pending}
                onClick={() => void game.reload()}
              >
                {text.reload}
              </button>
            )}
          </div>
        </div>
      )}
      {game.loading ? (
        <p role="status">{text.loading}</p>
      ) : !session ? (
        <>
          {game.resume ? (
            <section className="panel study-resume">
              <h2>{text.resume}</h2>
              <p>
                {text.resumeHint}{' '}
                {text.solved(game.resume.summary.answered, game.resume.summary.total)}
              </p>
              <div className="study-actions">
                <button className="primary" disabled={game.pending} onClick={game.continueGame}>
                  {text.continue}
                </button>
              </div>
            </section>
          ) : (
            <section className="panel scanword-setup">
              <p>{level ? text.unlockHint : text.legacyHint}</p>
              {!level && (
                <button className="primary" onClick={back}>
                  {text.allLevels}
                  <ArrowRight size={18} />
                </button>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          {session.outdated && (
            <p className="study-notice" role="status">
              {studyText.outdated}
            </p>
          )}
          {session.status !== 'active' ? (
            level ? (
              <section className="panel result-panel scanword-level-result">
                <span className="result-icon">
                  <Check size={40} />
                </span>
                <h2>
                  {session.status === 'completed'
                    ? next
                      ? text.levelDone
                      : text.finalDone
                    : studyText.abandoned}
                </h2>
                <p>
                  {session.status === 'completed'
                    ? next
                      ? text.levelDoneHint
                      : text.finalHint
                    : text.unlockHint}
                </p>
                <div className="result-score">
                  {session.summary.score}
                  <span>%</span>
                </div>
                <p>
                  {text.independent}
                  <br />
                  {text.solved(session.summary.answered, session.summary.total)}
                  <br />
                  {studyText.mistakes}: {session.summary.mistakes} · {text.hints}:{' '}
                  {session.summary.hints ?? 0}
                  <br />
                  {studyText.elapsed}: {studyDuration(session.elapsedMs)}
                </p>
                <div className="study-actions">
                  {session.status === 'completed' && next && (
                    <button
                      className="primary"
                      disabled={game.pending}
                      onClick={() => nextLevel?.(next.id)}
                    >
                      {text.nextLevel}
                      <ArrowRight size={18} />
                    </button>
                  )}
                  <button className="secondary" disabled={game.pending} onClick={start}>
                    {text.replayLevel}
                  </button>
                  <button className="secondary" disabled={game.pending} onClick={back}>
                    {text.allLevels}
                  </button>
                </div>
              </section>
            ) : (
              <StudyResults
                session={session}
                pending={game.pending}
                onStart={start}
                onSetup={back}
                readOnly
              />
            )
          ) : (
            board && (
              <>
                <section className="panel scanword-board-panel">
                  <div className="scanword-round-header">
                    <h2>{level ? text.title : text.round(board.round, board.rounds)}</h2>
                    <span>
                      <Clock3 size={18} />
                      {studyDuration(game.elapsedMs)}
                    </span>
                  </div>
                  <div className="scanword-progress">
                    <ProgressBar
                      value={
                        (board.words.filter((word) => word.solved).length / board.words.length) *
                        100
                      }
                    />
                    <span>
                      {text.solved(
                        board.words.filter((word) => word.solved).length,
                        board.words.length,
                      )}
                    </span>
                  </div>
                  <ScanwordBoard
                    board={board}
                    drafts={game.drafts}
                    change={(next) => {
                      game.updateLetters(next);
                      setChecked(false);
                    }}
                    blocked={game.blocked || (game.hasRetry && !game.pending)}
                    pending={game.pending}
                    hint={(id) => {
                      setChecked(false);
                      void game.hint(id);
                    }}
                    check={() => void check()}
                  />
                </section>
                <div className="scanword-bottom">
                  <div className="study-actions">
                    {roundDone ? (
                      <button
                        className="primary"
                        disabled={game.pending || game.hasRetry}
                        onClick={() => {
                          setChecked(false);
                          void game.send({ type: 'scanword-next', round: board.round });
                        }}
                      >
                        {text.next}
                        <ArrowRight size={18} />
                      </button>
                    ) : (
                      <button
                        className="primary"
                        disabled={game.pending || game.hasRetry}
                        onClick={() => void check()}
                      >
                        {text.check}
                      </button>
                    )}
                    <button
                      className="secondary"
                      disabled={game.pending || game.hasRetry}
                      onClick={() => void leave()}
                    >
                      {text.exit}
                    </button>
                  </div>
                  <span className="scanword-save-status" role="status">
                    {game.pending
                      ? text.saving
                      : game.dirty || game.hasRetry
                        ? text.unsaved
                        : text.saved}
                  </span>
                </div>
                {(roundDone || checked) && (
                  <p
                    className={`scanword-check-message ${board.wrongWords.length ? 'has-errors' : ''}`}
                    role="status"
                  >
                    {roundDone
                      ? text.roundDone
                      : board.wrongWords.length
                        ? text.wrong
                        : text.checked}
                  </p>
                )}
                <p className="keyboard-hint">{text.unlimited}</p>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
