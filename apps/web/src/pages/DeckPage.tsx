import { ArrowLeft, Pencil, Star, LockKeyhole } from 'lucide-react';
import type { Deck, StudyMode } from '../entities/deck';
import { Modes, ProgressBar, Symbol } from '../shared/ui';
import { cardCount, ru } from '../shared/ru';

export function DeckPage({
  deck,
  back,
  edit,
  favorite,
  study,
}: {
  deck: Deck;
  back: () => void;
  edit: () => void;
  favorite: () => void;
  study: (mode: StudyMode) => void;
}) {
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={17} />
        {ru.toLibrary}
      </button>
      <div className="deck-heading">
        <Symbol value={deck.icon} />
        <div>
          <span className="eyebrow">{cardCount(deck.count)}</span>
          <h1>{deck.title}</h1>
          <p>{deck.description}</p>
        </div>
        <div className="deck-actions">
          <button
            className={`icon-button outlined ${deck.favorite ? 'favorite' : ''}`}
            onClick={favorite}
            aria-label={deck.favorite ? ru.unfavorite : ru.favorite}
          >
            <Star size={20} fill={deck.favorite ? 'currentColor' : 'none'} />
          </button>
          <button className="secondary" onClick={edit}>
            <Pencil size={17} />
            {ru.edit}
          </button>
        </div>
      </div>
      <div className="deck-author">
        <span className="avatar small">М</span>
        {ru.author}
        <span className="dot">·</span>
        <LockKeyhole size={14} />
        {ru.private}
      </div>
      <section className="deck-study-banner">
        <div>
          <h2>{ru.continueLabel}</h2>
          <p>{ru.studyHint}</p>
        </div>
        <div className="deck-study-progress">
          <ProgressBar value={deck.progress} />
          <span>{deck.progress}%</span>
        </div>
      </section>
      <Modes onSelect={study} />
      <section className="terms-section">
        <div className="section-heading">
          <h2>{ru.terms}</h2>
          <span className="muted">{ru.sampleCards}</span>
        </div>
        <p className="muted small-text">{ru.demoContent}</p>
        <div className="terms-list">
          {deck.cards.map((card, i) => (
            <div className="term-row" key={card.id}>
              <span className="term-number">{i + 1}</span>
              <strong>{card.term}</strong>
              <span>{card.definition}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
