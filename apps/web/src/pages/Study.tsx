import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import type { Deck, StudyMode } from '../entities/deck';
import { Modes, ProgressBar } from '../shared/ui';
import { ru } from '../shared/ru';

export function Study({
  deck,
  mode,
  back,
  changeMode,
}: {
  deck: Deck;
  mode: StudyMode;
  back: () => void;
  changeMode: (mode: StudyMode) => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [modeMenu, setModeMenu] = useState(false);
  const [finished, setFinished] = useState(false);
  const [testAnswers, setTestAnswers] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<{ id: string; side: string } | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [mismatch, setMismatch] = useState(false);
  const card = deck.cards[index];
  const totalQuestions = Math.min(3, deck.cards.length);
  const next = () => {
    setIndex((value) => (value + 1) % deck.cards.length);
    setFlipped(false);
    setAnswer(null);
  };
  const previous = () => {
    setIndex((value) => (value - 1 + deck.cards.length) % deck.cards.length);
    setFlipped(false);
    setAnswer(null);
  };
  useEffect(() => {
    if (mode !== 'cards') return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest('button, input, textarea, select') || event.target.isContentEditable)
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setFlipped((value) => !value);
      }
      if (event.key === 'ArrowRight') {
        setIndex((value) => (value + 1) % deck.cards.length);
        setFlipped(false);
      }
      if (event.key === 'ArrowLeft') {
        setIndex((value) => (value - 1 + deck.cards.length) % deck.cards.length);
        setFlipped(false);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [mode, deck.cards.length]);
  const options = [card, ...deck.cards.filter((item) => item.id !== card.id).slice(0, 3)];
  const matchCards = deck.cards.slice(0, 4);
  const choosePair = (id: string, side: string) => {
    if (matched.includes(id)) return;
    setMismatch(false);
    if (!selected || selected.side === side) {
      setSelected({ id, side });
      return;
    }
    if (selected.id === id) {
      setMatched((items) => [...items, id]);
      setSelected(null);
    } else {
      setMismatch(true);
      setSelected(null);
    }
  };
  return (
    <div className="study-page">
      <div className="study-topbar">
        <button className="back-link" onClick={back}>
          <ArrowLeft size={18} />
          {deck.title}
        </button>
        <button
          className="secondary"
          onClick={() => setModeMenu(!modeMenu)}
          aria-expanded={modeMenu}
        >
          {ru[mode]}
          <ChevronDown size={16} />
        </button>
      </div>
      {modeMenu && (
        <div className="study-mode-picker">
          <Modes onSelect={changeMode} active={mode} />
        </div>
      )}
      <div className="study-intro">
        <span className="eyebrow">{ru.demoSession}</span>
        <h1>{mode === 'match' ? ru.matchTitle : ru[mode]}</h1>
        <p>
          {mode === 'match' ? ru.matchHintLong : mode === 'test' ? ru.testHintLong : ru.studyHint}
        </p>
      </div>
      {mode === 'cards' && (
        <>
          <div className="study-progress">
            <ProgressBar value={((index + 1) / deck.cards.length) * 100} />
            <span>
              {index + 1} / {deck.cards.length}
            </span>
          </div>
          <button
            className={`flashcard ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(!flipped)}
            aria-label={`${ru.flipAria}: ${flipped ? card.definition : card.term}`}
          >
            <div className="flashcard-inner">
              <div className="flashcard-face">
                <span className="eyebrow">{ru.term}</span>
                <strong>{card.term}</strong>
                <span className="flashcard-footer">
                  <RotateCcw size={15} />
                  {ru.flip}
                </span>
              </div>
              <div className="flashcard-face flashcard-back">
                <span className="eyebrow">{ru.definition}</span>
                <strong>{card.definition}</strong>
                <span className="flashcard-footer">
                  <RotateCcw size={15} />
                  {ru.flip}
                </span>
              </div>
            </div>
          </button>
          <div className="card-controls">
            <button className="icon-button outlined" onClick={previous} aria-label={ru.previous}>
              <ArrowLeft size={20} />
            </button>
            <span>
              {index + 1} / {deck.cards.length}
            </span>
            <button className="icon-button outlined" onClick={next} aria-label={ru.next}>
              <ArrowRight size={20} />
            </button>
          </div>
          <div className="review-buttons">
            <button className="secondary" onClick={next}>
              <RotateCcw size={17} />
              {ru.learning}
            </button>
            <button className="primary" onClick={next}>
              <Check size={18} />
              {ru.know}
            </button>
          </div>
          <p className="keyboard-hint">{ru.flipHint}</p>
        </>
      )}
      {mode === 'learn' && (
        <>
          <div className="study-progress">
            <ProgressBar value={((index + 1) / deck.cards.length) * 100} />
            <span>
              {index + 1} / {deck.cards.length}
            </span>
          </div>
          <section className="panel question-panel">
            <span className="eyebrow">{ru.chooseAnswer}</span>
            <h2>{card.term}</h2>
            <div className="answer-grid">
              {options.map((option, i) => (
                <button
                  className={`answer-option ${answer === i ? 'selected' : ''}`}
                  key={option.id}
                  onClick={() => setAnswer(i)}
                >
                  <span>{i + 1}</span>
                  {option.definition}
                  {answer === i && <Check size={18} />}
                </button>
              ))}
            </div>
            {answer !== null && (
              <div className="answer-feedback" role="status">
                <div>
                  <strong>{ru.selectedAnswer}</strong>
                  <p>{ru.selectedHint}</p>
                </div>
                <button className="primary" onClick={next}>
                  {ru.nextCard}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
          </section>
        </>
      )}
      {mode === 'test' &&
        (finished ? (
          <section className="panel result-panel">
            <span className="result-icon">
              <Check size={40} />
            </span>
            <span className="eyebrow">{ru.exampleResult}</span>
            <h2>{ru.resultTitle}</h2>
            <div className="result-score">
              80<span>%</span>
            </div>
            <p>{ru.resultHint}</p>
            <button
              className="primary"
              onClick={() => {
                setFinished(false);
                setTestAnswers({});
              }}
            >
              <RotateCcw size={17} />
              {ru.restart}
            </button>
            <button className="text-button" onClick={back}>
              {ru.toLibrary}
              <ArrowRight size={17} />
            </button>
          </section>
        ) : (
          <>
            <div className="test-question-list">
              {deck.cards.slice(0, 3).map((item, questionIndex) => (
                <section className="panel test-question" key={item.id}>
                  <span className="eyebrow">
                    {ru.question} {questionIndex + 1} / {totalQuestions}
                  </span>
                  <h2>{item.term}</h2>
                  <div className="answer-grid">
                    {[item, ...deck.cards.filter((other) => other.id !== item.id).slice(0, 3)].map(
                      (option, optionIndex) => (
                        <button
                          key={option.id}
                          className={`answer-option ${testAnswers[item.id] === optionIndex ? 'selected' : ''}`}
                          onClick={() => setTestAnswers({ ...testAnswers, [item.id]: optionIndex })}
                        >
                          <span>
                            {testAnswers[item.id] === optionIndex ? (
                              <Check size={14} />
                            ) : (
                              String.fromCharCode(65 + optionIndex)
                            )}
                          </span>
                          {option.definition}
                        </button>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="test-finish">
              <span className="muted">
                {Object.keys(testAnswers).length} / {totalQuestions}
              </span>
              <button
                className="primary"
                disabled={Object.keys(testAnswers).length < totalQuestions}
                onClick={() => setFinished(true)}
              >
                {ru.finishTest}
                <ArrowRight size={18} />
              </button>
            </div>
          </>
        ))}
      {mode === 'match' &&
        (matched.length === matchCards.length ? (
          <section className="panel result-panel">
            <span className="result-icon">
              <Check size={40} />
            </span>
            <h2>{ru.matchFinished}</h2>
            <p>{ru.matchFinishedHint}</p>
            <button
              className="primary"
              onClick={() => {
                setMatched([]);
                setSelected(null);
              }}
            >
              <RotateCcw size={18} />
              {ru.again}
            </button>
          </section>
        ) : (
          <>
            <div className="match-status">
              <span className="badge">
                {matched.length} / {matchCards.length} {ru.pairs}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setMatched([]);
                  setSelected(null);
                  setMismatch(false);
                }}
              >
                <RotateCcw size={16} />
                {ru.again}
              </button>
            </div>
            <div className={`match-board ${mismatch ? 'mismatch' : ''}`}>
              <div>
                {matchCards.map((item) => (
                  <button
                    key={item.id}
                    className={`match-tile ${selected?.id === item.id && selected.side === 'term' ? 'selected' : ''} ${matched.includes(item.id) ? 'matched' : ''}`}
                    disabled={matched.includes(item.id)}
                    onClick={() => choosePair(item.id, 'term')}
                  >
                    {matched.includes(item.id) ? <Check size={23} /> : item.term}
                  </button>
                ))}
              </div>
              <div>
                {[...matchCards].reverse().map((item) => (
                  <button
                    key={item.id}
                    className={`match-tile ${selected?.id === item.id && selected.side === 'definition' ? 'selected' : ''} ${matched.includes(item.id) ? 'matched' : ''}`}
                    disabled={matched.includes(item.id)}
                    onClick={() => choosePair(item.id, 'definition')}
                  >
                    {matched.includes(item.id) ? <Check size={23} /> : item.definition}
                  </button>
                ))}
              </div>
            </div>
            {mismatch && (
              <p className="match-message" role="status">
                <X size={16} />
                {ru.again}
              </p>
            )}
          </>
        ))}
    </div>
  );
}
