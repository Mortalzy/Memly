import { useState } from 'react';
import { errorMessage } from '../shared/api';
import { ArrowLeft, Pencil, Star, LockKeyhole } from 'lucide-react';
import type { Deck, StudyMode } from '../entities/deck';
import { Modes, ProgressBar, Symbol } from '../shared/ui';
import { cardCount, ru } from '../shared/ru';
import { SpeechButton } from '../shared/SpeechButton';

export function DeckPage({
  deck,
  back,
  edit,
  favorite,
  study,
  live = false,
  canEdit = true,
  remove,
}: {
  deck: Deck;
  back: () => void;
  edit: () => void;
  favorite: () => void;
  study: (mode: StudyMode) => void;
  live?: boolean;
  canEdit?: boolean;
  remove?: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
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
          {canEdit && (
            <button className="secondary" onClick={edit}>
              <Pencil size={17} />
              {ru.edit}
            </button>
          )}
        </div>
      </div>
      {canEdit && remove && (
        <button
          className="text-button"
          disabled={pending}
          onClick={async () => {
            if (!window.confirm('Удалить набор и все его карточки?')) return;
            setPending(true);
            setError('');
            try {
              await remove();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          Удалить набор
        </button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="deck-author">
        <span className="avatar small">М</span>
        {deck.ownerName ?? ru.author}
        <span className="dot">·</span>
        <LockKeyhole size={14} />
        {deck.visibility === 'public' ? ru.public : ru.private}
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
          <span className="muted">{live ? cardCount(deck.cards.length) : ru.sampleCards}</span>
        </div>
        {!live && <p className="muted small-text">{ru.demoContent}</p>}
        <div className="terms-list">
          {deck.cards.map((card, i) => (
            <div className="term-row" key={card.id}>
              <span className="term-number">{i + 1}</span>
              <div className="term-with-audio">
                <strong>{card.term}</strong>
                <SpeechButton text={card.term} />
              </div>
              <div className="term-with-audio">
                <span>{card.definition}</span>
                <SpeechButton text={card.definition} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
