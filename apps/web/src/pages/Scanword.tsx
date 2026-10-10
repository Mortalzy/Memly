import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3 } from 'lucide-react';
import { scanwordCandidates, type StartStudyInput, type StudyOptions } from '@memly/contracts';
import type { Deck } from '../entities/deck';
import { PageHeading, ProgressBar } from '../shared/ui';
import { scanwordText as text } from '../shared/scanword-text';
import { studyDuration, studyText } from '../shared/study-text';
import { StudyResults } from '../features/StudyResults';
import { ScanwordBoard } from '../features/ScanwordBoard';
import { useScanwordSession } from '../features/use-scanword-session';

export function Scanword({
  deck,
  back,
  saved,
  sessionId,
}: {
  deck: Deck;
  back: () => void;
  saved?: () => Promise<void>;
  sessionId?: string;
}) {
  const game = useScanwordSession(deck, saved, sessionId);
  const [direction, setDirection] = useState<StudyOptions['direction']>(() =>
    scanwordCandidates(deck.cards, 'reverse').eligible.length ? 'reverse' : 'forward',
  );
  const [checked, setChecked] = useState(false);
  const choices = scanwordCandidates(deck.cards, direction);
  const session = game.session;
  const board = session?.scanword;
  const roundDone = board?.words.every((word) => word.solved);
  const start = (cardIds?: string[]) => {
    const options: StudyOptions = {
      direction: session?.options.direction ?? direction,
      answerType: 'written',
      count: 500,
      shuffle: true,
      filter: 'all',
    };
    const eligible = scanwordCandidates(deck.cards, options.direction).eligible.filter(
      (item) => !cardIds || cardIds.includes(item.cardId),
    );
    const input: StartStudyInput = {
      requestId: crypto.randomUUID(),
      deckId: deck.id,
      mode: 'scanword',
      options: { ...options, count: eligible.length },
      cardIds: eligible.map((item) => item.cardId),
    };
    setChecked(false);
    void game.start(input);
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
        {text.allGames}
      </button>
      <PageHeading title={text.title} subtitle={text.subtitle} />
      {!saved && <p className="study-notice">{text.demo}</p>}
      <section className="panel scanword-deck-bar">
        <span className="scanword-deck-icon">
          <BookOpen size={23} />
        </span>
        <div>
          <strong>{session?.deckTitle ?? deck.title}</strong>
          <p>
            {deck.cards.length} карточек ·{' '}
            {session
              ? text.solved(session.summary.answered, session.summary.total)
              : text.ready(choices.eligible.length, deck.cards.length)}
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
                <button className="secondary" disabled={game.pending} onClick={game.reset}>
                  {text.new}
                </button>
              </div>
            </section>
          ) : (
            <section className="panel scanword-setup">
              <h2>{text.setup}</h2>
              <p>{text.rules}</p>
              <label>
                {text.direction}
                <select
                  value={direction}
                  disabled={game.pending || game.hasStartRetry}
                  onChange={(event) =>
                    setDirection(event.target.value as StudyOptions['direction'])
                  }
                >
                  <option value="reverse">{text.terms}</option>
                  <option value="forward">{text.definitions}</option>
                </select>
              </label>
              <div className="scanword-ready">
                <Check size={20} />
                <strong>{text.ready(choices.eligible.length, deck.cards.length)}</strong>
              </div>
              {choices.excluded.length > 0 && (
                <>
                  <p className="study-notice">{text.subset}</p>
                  <details className="scanword-excluded">
                    <summary>
                      {text.excluded} ({choices.excluded.length})
                    </summary>
                    <ul>
                      {choices.excluded.map((item) => (
                        <li key={item.cardId}>
                          <strong>{item.answer}</strong>
                          <span>{item.reason === 'duplicate' ? text.duplicate : text.format}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
              <button
                className="primary"
                disabled={game.pending || !choices.eligible.length || game.hasStartRetry}
                onClick={() => start()}
              >
                {game.pending ? text.loading : text.start}
                <ArrowRight size={18} />
              </button>
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
            <StudyResults
              session={session}
              pending={game.pending}
              onStart={start}
              onSetup={game.reset}
            />
          ) : (
            board && (
              <>
                <section className="panel scanword-board-panel">
                  <div className="scanword-round-header">
                    <h2>{text.round(board.round, board.rounds)}</h2>
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
